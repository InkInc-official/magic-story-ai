import { createChatCompletion } from './ai-client';
import { db } from './db';
import { InspectorContextInputError } from './inspector-context';
import { loadAndBuildInspectorContext } from './inspector-context-loader';
import { NarrativeInspectorError, type NarrativeInspectorIssue } from './narrative-inspector';
import { inspectBuiltContext, type InspectorCompletion } from './narrative-inspector-runner';
import { learningStatusAfterReinspection } from './narrative-learning';
import {
  buildInspectorContextFingerprint,
  CURRENT_INSPECTOR_FINGERPRINT_VERSION,
  isInspectorFingerprintVersion,
  type InspectorFingerprintVersion,
} from './inspector-fingerprint';
import {
  buildIssueFingerprint,
  decisionIsFresh,
  executeInspectionRun,
  issueCoveredByScope,
  NARRATIVE_INSPECTOR_VERSION,
  NARRATIVE_ISSUE_DECISIONS,
  type NarrativeIssueDecisionValue,
} from './narrative-inspector-persistence';

export interface NarrativeInspectorRequest { projectId: string; chapterId: string; startOffset?: number; endOffset?: number }

function parseArray(value: string) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function publicIssue(issue: Record<string, unknown>, current?: { contentHash: string; contextFingerprint: string; fingerprintVersion: string }) {
  const decisions = Array.isArray(issue.decisions) ? issue.decisions as Array<Record<string, unknown>> : [];
  const latestDecision = decisions[0] || null;
  const decisionFresh = Boolean(latestDecision && current && decisionIsFresh(latestDecision as never, issue as never, current));
  return {
    ...issue,
    evidenceRefs: parseArray(String(issue.evidenceRefs || '[]')),
    adjustments: parseArray(String(issue.adjustments || '[]')),
    decisions: undefined,
    latestDecision: latestDecision ? { ...latestDecision, fresh: decisionFresh } : null,
  };
}

async function currentChapterContext(projectId: string, chapterId: string, version: InspectorFingerprintVersion) {
  const context = await loadAndBuildInspectorContext(projectId, chapterId);
  return { context, contextFingerprint: buildInspectorContextFingerprint(context, version), fingerprintVersion: version };
}

function storedVersion(value: string): InspectorFingerprintVersion {
  if (!isInspectorFingerprintVersion(value)) throw new Error(`Unsupported persisted Inspector fingerprint version: ${value}`);
  return value;
}

export async function runNarrativeInspector(
  request: NarrativeInspectorRequest,
  complete: InspectorCompletion = async messages => createChatCompletion({ messages, temperature: 0.1, max_tokens: 5000 }),
  dependencies: { database?: typeof db; buildContext?: typeof loadAndBuildInspectorContext } = {},
) {
  const database = dependencies.database || db;
  const buildContext = dependencies.buildContext || loadAndBuildInspectorContext;
  const chapter = await database.chapter.findFirst({ where: { id: request.chapterId, projectId: request.projectId }, select: { id: true, content: true } });
  if (!chapter) throw new InspectorContextInputError('Chapterが見つからないかProject境界が不正です');
  const hasRange = request.startOffset !== undefined || request.endOffset !== undefined;
  if (hasRange && (!Number.isInteger(request.startOffset) || !Number.isInteger(request.endOffset))) throw new NarrativeInspectorError('invalid_schema', 'startOffsetとendOffsetは両方整数で指定してください');
  const requestedStart = hasRange ? request.startOffset! : 0;
  const requestedEnd = hasRange ? request.endOffset! : chapter.content.length;
  return executeInspectionRun({
    createPending: () => database.narrativeInspectionRun.create({ data: {
      projectId: request.projectId, chapterId: request.chapterId,
      requestedStartOffset: requestedStart, requestedEndOffset: requestedEnd,
      inspectorVersion: NARRATIVE_INSPECTOR_VERSION, fingerprintVersion: CURRENT_INSPECTOR_FINGERPRINT_VERSION,
    } }),
    inspectAndCommit: async run => {
    const context = await buildContext(request.projectId, request.chapterId, hasRange ? { range: { start: requestedStart, end: requestedEnd } } : {});
    const fingerprintVersion = CURRENT_INSPECTOR_FINGERPRINT_VERSION;
    const contextFingerprint = buildInspectorContextFingerprint(context, fingerprintVersion);
    const result = await inspectBuiltContext(context, complete);
    const fingerprintSource = { text: context.inspectedText.excerpt, startOffset: context.inspectedText.startOffset };
    const detected = result.issues.map(issue => ({ issue, fingerprint: buildIssueFingerprint(request.projectId, request.chapterId, issue, fingerprintSource) }));
    const detectedFingerprints = new Set(detected.map(item => item.fingerprint));
    const scope = {
      start: context.inspectedText.startOffset,
      end: context.inspectedText.endOffset,
      fullChapter: !hasRange && !context.inspectedText.truncated,
      contentHash: context.inspectedText.contentHash,
    };
    const persisted = await database.$transaction(async transaction => {
      const existing = await transaction.narrativeIssue.findMany({ where: { projectId: request.projectId, chapterId: request.chapterId } });
      for (const { issue, fingerprint } of detected) {
        await transaction.narrativeIssue.upsert({
          where: { projectId_chapterId_fingerprint: { projectId: request.projectId, chapterId: request.chapterId, fingerprint } },
          create: issueData(issue, fingerprint, request, run.id, context.inspectedText.contentHash, contextFingerprint, fingerprintVersion),
          update: {
            lastSeenRunId: run.id, severity: issue.severity, startOffset: issue.startOffset, endOffset: issue.endOffset,
            explanation: issue.explanation, suggestedDirection: issue.suggestedDirection,
            evidenceRefs: JSON.stringify(issue.evidenceRefs), adjustments: JSON.stringify(issue.adjustments), status: 'open',
            contentHash: context.inspectedText.contentHash, contextFingerprint, fingerprintVersion, inspectorVersion: NARRATIVE_INSPECTOR_VERSION, lastDetectedAt: new Date(),
          },
        });
      }
      const resolvedIds = existing.filter(issue => !detectedFingerprints.has(issue.fingerprint) && issue.status !== 'superseded' && issueCoveredByScope(issue, scope)).map(issue => issue.id);
      if (resolvedIds.length > 0) await transaction.narrativeIssue.updateMany({ where: { id: { in: resolvedIds } }, data: { status: 'resolved' } });
      const activeLearning = await transaction.narrativeLearningSession.findMany({ where: { projectId: request.projectId, chapterId: request.chapterId, status: 'active' }, include: { issue: { select: { fingerprint: true, fingerprintVersion: true } } } });
      for (const session of activeLearning) {
        const resolvedInScope = resolvedIds.includes(session.issueId);
        const nextStatus = resolvedInScope
          ? 'completed'
          : scope.fullChapter
            ? learningStatusAfterReinspection(session, { issueFingerprint: session.issue.fingerprint, contentHash: context.inspectedText.contentHash, contextFingerprint, fingerprintVersion }, false)
            : 'active';
        if (nextStatus === 'completed') {
          await transaction.narrativeLearningSession.update({ where: { id: session.id }, data: { status: 'completed', completedAt: new Date() } });
        } else if (nextStatus === 'stale') {
          await transaction.narrativeLearningSession.update({ where: { id: session.id }, data: { status: 'stale' } });
        }
      }
      await transaction.narrativeInspectionRun.update({ where: { id: run.id }, data: {
        inspectedStartOffset: context.inspectedText.startOffset, inspectedEndOffset: context.inspectedText.endOffset,
        contentHash: context.inspectedText.contentHash, contextManifest: JSON.stringify(context.manifest), contextFingerprint, fingerprintVersion,
        status: 'completed', completedAt: new Date(),
      } });
      return transaction.narrativeIssue.findMany({ where: { projectId: request.projectId, chapterId: request.chapterId }, include: { decisions: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: [{ status: 'asc' }, { lastDetectedAt: 'desc' }] });
    });
      return {
      schemaVersion: result.schemaVersion, runId: run.id,
      issues: persisted.map(issue => publicIssue(issue as unknown as Record<string, unknown>, { contentHash: context.inspectedText.contentHash, contextFingerprint, fingerprintVersion })),
      inspectedRange: { start: context.inspectedText.startOffset, end: context.inspectedText.endOffset },
      contentHash: context.inspectedText.contentHash, contextFingerprint, fingerprintVersion, truncated: context.inspectedText.truncated,
      };
    },
    markFailed: (run, error) => database.narrativeInspectionRun.update({ where: { id: run.id }, data: { status: 'failed', error: error instanceof Error ? error.message.slice(0, 4000) : 'Unknown inspector error', completedAt: new Date() } }),
  });
}

function issueData(issue: NarrativeInspectorIssue, fingerprint: string, request: NarrativeInspectorRequest, runId: string, contentHash: string, contextFingerprint: string, fingerprintVersion: InspectorFingerprintVersion) {
  return {
    projectId: request.projectId, chapterId: request.chapterId, firstDetectedRunId: runId, lastSeenRunId: runId,
    fingerprint, category: issue.category, issueType: issue.issueType, severity: issue.severity,
    locationKind: issue.locationKind, startOffset: issue.startOffset, endOffset: issue.endOffset, excerpt: issue.excerpt,
    explanation: issue.explanation, suggestedDirection: issue.suggestedDirection,
    evidenceRefs: JSON.stringify(issue.evidenceRefs), adjustments: JSON.stringify(issue.adjustments),
    status: 'open', contentHash, contextFingerprint, fingerprintVersion, inspectorVersion: NARRATIVE_INSPECTOR_VERSION,
  };
}

export async function listNarrativeIssues(projectId: string, chapterId: string) {
  const chapter = await db.chapter.findFirst({ where: { id: chapterId, projectId }, select: { id: true } });
  if (!chapter) throw new InspectorContextInputError('Chapterが見つからないかProject境界が不正です');
  const context = await loadAndBuildInspectorContext(projectId, chapterId);
  const issues = await db.narrativeIssue.findMany({ where: { projectId, chapterId }, include: { decisions: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: [{ status: 'asc' }, { lastDetectedAt: 'desc' }] });
  const issuesWithFreshness = issues.map(issue => {
    const fingerprintVersion = storedVersion(issue.fingerprintVersion);
    return publicIssue(issue as unknown as Record<string, unknown>, {
      contentHash: context.inspectedText.contentHash,
      contextFingerprint: buildInspectorContextFingerprint(context, fingerprintVersion),
      fingerprintVersion,
    });
  });
  const persistedVersions = [...new Set(issues.map(issue => storedVersion(issue.fingerprintVersion)))];
  const fingerprintVersion = persistedVersions.length === 1 ? persistedVersions[0] : CURRENT_INSPECTOR_FINGERPRINT_VERSION;
  return {
    issues: issuesWithFreshness,
    contentHash: context.inspectedText.contentHash,
    contextFingerprint: buildInspectorContextFingerprint(context, fingerprintVersion),
    fingerprintVersion,
  };
}

export async function decideNarrativeIssue(issueId: string, projectId: string, decision: NarrativeIssueDecisionValue, authorNote: string) {
  if (!NARRATIVE_ISSUE_DECISIONS.includes(decision) || typeof authorNote !== 'string' || authorNote.length > 4000) throw new NarrativeInspectorError('invalid_schema', '作者判断またはメモが不正です');
  const issue = await db.narrativeIssue.findFirst({ where: { id: issueId, projectId }, select: { id: true, projectId: true, chapterId: true, fingerprint: true, excerpt: true, contentHash: true, contextFingerprint: true, fingerprintVersion: true } });
  if (!issue) throw new InspectorContextInputError('Issueが見つからないかProject境界が不正です');
  const fingerprintVersion = storedVersion(issue.fingerprintVersion);
  const { context, contextFingerprint } = await currentChapterContext(projectId, issue.chapterId, fingerprintVersion);
  const created = await db.narrativeIssueDecision.create({ data: {
    issueId: issue.id, decision, authorNote: authorNote.trim(), issueFingerprint: issue.fingerprint,
    decidedAgainstContentHash: context.inspectedText.contentHash, decidedAgainstExcerpt: issue.excerpt, contextFingerprint, fingerprintVersion,
  } });
  return { ...created, fresh: decisionIsFresh(created, issue, { contentHash: context.inspectedText.contentHash, contextFingerprint, fingerprintVersion }) };
}
