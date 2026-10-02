import { Prisma } from '@prisma/client';
import { createChatCompletion } from './ai-client';
import { db } from './db';
import { loadAndBuildInspectorContext } from './inspector-context-loader';
import { sanitizeInspectorText, type NarrativeInspectorIssue } from './narrative-inspector';
import { buildContextFingerprint } from './narrative-inspector-persistence';
import { fallbackLearningQuestion, learningSessionIsFresh, NarrativeLearningError, nextLearningLevel, parseLearningOutput } from './narrative-learning';
import { buildNarrativeLearningPrompt, NARRATIVE_LEARNING_PROMPT_VERSION, NARRATIVE_LEARNING_SYSTEM_PROMPT } from './prompts/ja/narrative-learning';

type LearningCompletion = (messages: Array<{ role: 'system' | 'user'; content: string }>) => Promise<string>;

function parseRefs(value: string) {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []; } catch { return []; }
}

function issueForPrompt(issue: { category: string; issueType: string; excerpt: string; explanation: string; suggestedDirection: string; evidenceRefs: string }): NarrativeInspectorIssue {
  return {
    category: issue.category as NarrativeInspectorIssue['category'], issueType: issue.issueType as NarrativeInspectorIssue['issueType'],
    locationKind: 'excerpt', excerpt: issue.excerpt, startOffset: 0, endOffset: 0,
    explanation: issue.explanation, suggestedDirection: issue.suggestedDirection,
    severity: 'check', evidenceRefs: parseRefs(issue.evidenceRefs), adjustments: [],
  };
}

async function currentLearningContext(projectId: string, chapterId: string) {
  const context = await loadAndBuildInspectorContext(projectId, chapterId);
  return { context, contentHash: context.inspectedText.contentHash, contextFingerprint: buildContextFingerprint(context.legacyFreshnessPayload) };
}

function publicSession<T extends { evidenceRefsSnapshot: string }>(session: T) {
  return { ...session, evidenceRefsSnapshot: parseRefs(session.evidenceRefsSnapshot) };
}

async function generateStep(input: {
  issue: ReturnType<typeof issueForPrompt>;
  context: Awaited<ReturnType<typeof currentLearningContext>>['context'];
  level: 0 | 1 | 2;
  previousSteps: Array<{ level: number; content: string }>;
  complete: LearningCompletion;
}) {
  const raw = await input.complete([
    { role: 'system', content: NARRATIVE_LEARNING_SYSTEM_PROMPT },
    { role: 'user', content: buildNarrativeLearningPrompt(input) },
  ]);
  return sanitizeInspectorText(parseLearningOutput(raw, input.level).content, input.context);
}

export async function startLearningSession(issueId: string, projectId: string, complete: LearningCompletion = messages => createChatCompletion({ messages, temperature: 0.4, max_tokens: 700 })) {
  const issue = await db.narrativeIssue.findFirst({ where: { id: issueId, projectId }, include: { learningSessions: { where: { status: 'active' }, include: { steps: { orderBy: { level: 'asc' } } }, take: 1 } } });
  if (!issue) throw new NarrativeLearningError('not_found', 'Issueが見つからないかProject境界が不正です');
  if (issue.status !== 'open') throw new NarrativeLearningError('invalid_input', '現在openではないIssueから学習を開始するには再検査が必要です');
  const current = await currentLearningContext(projectId, issue.chapterId);
  const active = issue.learningSessions[0];
  if (active) {
    if (learningSessionIsFresh(active, { issueFingerprint: issue.fingerprint, contentHash: current.contentHash, contextFingerprint: current.contextFingerprint })) return publicSession(active);
    await db.narrativeLearningSession.update({ where: { id: active.id }, data: { status: 'stale' } });
  }
  const promptIssue = issueForPrompt(issue);
  let question: string;
  try {
    question = await generateStep({ issue: promptIssue, context: current.context, level: 0, previousSteps: [], complete });
  } catch {
    question = fallbackLearningQuestion(issue.category);
  }
  try {
    const session = await db.$transaction(async transaction => {
      const created = await transaction.narrativeLearningSession.create({ data: {
        projectId, chapterId: issue.chapterId, issueId: issue.id,
        startingIssueFingerprint: issue.fingerprint, startingContentHash: current.contentHash, startingContextFingerprint: current.contextFingerprint,
        issueExcerptSnapshot: issue.excerpt, issueExplanationSnapshot: issue.explanation, evidenceRefsSnapshot: issue.evidenceRefs,
      } });
      await transaction.narrativeLearningStep.create({ data: {
        sessionId: created.id, level: 0, type: 'question', content: question,
        promptVersion: NARRATIVE_LEARNING_PROMPT_VERSION, contentHash: current.contentHash, contextFingerprint: current.contextFingerprint,
      } });
      return transaction.narrativeLearningSession.findUniqueOrThrow({ where: { id: created.id }, include: { steps: { orderBy: { level: 'asc' } } } });
    });
    return publicSession(session);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const concurrent = await db.narrativeLearningSession.findFirst({ where: { issueId, status: 'active' }, include: { steps: { orderBy: { level: 'asc' } } } });
      if (concurrent) return publicSession(concurrent);
    }
    throw error;
  }
}

export async function getLearningSession(issueId: string, projectId: string) {
  const issue = await db.narrativeIssue.findFirst({ where: { id: issueId, projectId }, select: { id: true, chapterId: true, fingerprint: true } });
  if (!issue) throw new NarrativeLearningError('not_found', 'Issueが見つからないかProject境界が不正です');
  const session = await db.narrativeLearningSession.findFirst({ where: { issueId }, include: { steps: { orderBy: { level: 'asc' } } }, orderBy: { createdAt: 'desc' } });
  if (!session) return null;
  if (session.status === 'active') {
    const current = await currentLearningContext(projectId, issue.chapterId);
    if (!learningSessionIsFresh(session, { issueFingerprint: issue.fingerprint, contentHash: current.contentHash, contextFingerprint: current.contextFingerprint })) {
      return publicSession(await db.narrativeLearningSession.update({ where: { id: session.id }, data: { status: 'stale' }, include: { steps: { orderBy: { level: 'asc' } } } }));
    }
  }
  return publicSession(session);
}

export async function requestLearningHint(sessionId: string, projectId: string, complete: LearningCompletion = messages => createChatCompletion({ messages, temperature: 0.45, max_tokens: 700 })) {
  const session = await db.narrativeLearningSession.findFirst({ where: { id: sessionId, projectId }, include: { issue: true, steps: { orderBy: { level: 'asc' } } } });
  if (!session) throw new NarrativeLearningError('not_found', 'Learning Sessionが見つからないかProject境界が不正です');
  if (session.status !== 'active') throw new NarrativeLearningError(session.status === 'stale' ? 'stale' : 'invalid_input', 'このSessionは継続できません');
  const current = await currentLearningContext(projectId, session.chapterId);
  if (!learningSessionIsFresh(session, { issueFingerprint: session.issue.fingerprint, contentHash: current.contentHash, contextFingerprint: current.contextFingerprint })) {
    await db.narrativeLearningSession.update({ where: { id: session.id }, data: { status: 'stale' } });
    throw new NarrativeLearningError('stale', '本文または設定が変更されています。再検査して新しいIssueから学習を開始してください');
  }
  const level = nextLearningLevel(session.currentHintLevel);
  let content: string;
  try {
    content = await generateStep({ issue: issueForPrompt(session.issue), context: current.context, level, previousSteps: session.steps, complete });
  } catch (error) {
    if (error instanceof NarrativeLearningError) throw error;
    throw new NarrativeLearningError('ai_failure', error instanceof Error ? error.message : 'ヒント生成に失敗しました');
  }
  try {
    const updated = await db.$transaction(async transaction => {
      await transaction.narrativeLearningStep.create({ data: {
        sessionId: session.id, level, type: level === 1 ? 'hint1' : 'hint2', content,
        promptVersion: NARRATIVE_LEARNING_PROMPT_VERSION, contentHash: current.contentHash, contextFingerprint: current.contextFingerprint,
      } });
      return transaction.narrativeLearningSession.update({ where: { id: session.id }, data: { currentHintLevel: level }, include: { steps: { orderBy: { level: 'asc' } } } });
    });
    return publicSession(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const concurrent = await db.narrativeLearningSession.findFirst({ where: { id: session.id, projectId }, include: { steps: { orderBy: { level: 'asc' } } } });
      if (concurrent && concurrent.currentHintLevel >= level) return publicSession(concurrent);
    }
    throw error;
  }
}
