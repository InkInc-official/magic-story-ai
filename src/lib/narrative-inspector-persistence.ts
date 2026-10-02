import { createHash } from 'node:crypto';
import type { NarrativeInspectorIssue } from './narrative-inspector';

export const NARRATIVE_INSPECTOR_VERSION = '4b5-v1';
export const NARRATIVE_ISSUE_STATUSES = ['open', 'resolved', 'stale', 'superseded'] as const;
export const NARRATIVE_ISSUE_DECISIONS = ['accepted_issue', 'allowed_exception', 'not_an_issue'] as const;
export type NarrativeIssueStatus = typeof NARRATIVE_ISSUE_STATUSES[number];
export type NarrativeIssueDecisionValue = typeof NARRATIVE_ISSUE_DECISIONS[number];

export interface PersistedIssueShape {
  id: string;
  fingerprint: string;
  locationKind: string;
  startOffset: number;
  endOffset: number;
  excerpt: string;
  status: string;
  contentHash: string;
}

export interface InspectionScope {
  start: number;
  end: number;
  fullChapter: boolean;
  contentHash: string;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function normalizedExcerpt(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function buildIssueFingerprint(
  projectId: string,
  chapterId: string,
  issue: Pick<NarrativeInspectorIssue, 'category' | 'issueType' | 'locationKind' | 'excerpt' | 'evidenceRefs' | 'startOffset' | 'endOffset'>,
  source?: { text: string; startOffset: number },
) {
  const relativeStart = source ? issue.startOffset - source.startOffset : 0;
  const relativeEnd = source ? issue.endOffset - source.startOffset : 0;
  const anchorBefore = source && issue.locationKind === 'excerpt' ? normalizedExcerpt(source.text.slice(Math.max(0, relativeStart - 64), relativeStart)) : '';
  const anchorAfter = source && issue.locationKind === 'excerpt' ? normalizedExcerpt(source.text.slice(relativeEnd, Math.min(source.text.length, relativeEnd + 64))) : '';
  return digest({ projectId, chapterId, category: issue.category, issueType: issue.issueType, locationKind: issue.locationKind, excerpt: normalizedExcerpt(issue.excerpt), anchorBefore, anchorAfter, evidenceRefs: [...new Set(issue.evidenceRefs)].sort() });
}

export function buildContextFingerprint(manifest: unknown) {
  return digest(manifest);
}

export function issueCoveredByScope(issue: PersistedIssueShape, scope: InspectionScope) {
  if (issue.locationKind === 'chapter') return scope.fullChapter;
  if (scope.fullChapter) return true;
  if (issue.contentHash !== scope.contentHash) return false;
  return issue.startOffset >= scope.start && issue.endOffset <= scope.end;
}

export function partitionReinspection(existing: PersistedIssueShape[], detectedFingerprints: ReadonlySet<string>, scope: InspectionScope) {
  return {
    matched: existing.filter(issue => detectedFingerprints.has(issue.fingerprint)),
    resolved: existing.filter(issue => !detectedFingerprints.has(issue.fingerprint) && issue.status !== 'superseded' && issueCoveredByScope(issue, scope)),
    untouched: existing.filter(issue => !detectedFingerprints.has(issue.fingerprint) && (issue.status === 'superseded' || !issueCoveredByScope(issue, scope))),
  };
}

export function decisionIsFresh(decision: { issueFingerprint: string; decidedAgainstContentHash: string; decidedAgainstExcerpt: string; contextFingerprint: string }, issue: { fingerprint: string; contentHash: string; excerpt: string; contextFingerprint: string }, current: { contentHash: string; contextFingerprint: string }) {
  return decision.issueFingerprint === issue.fingerprint
    && decision.decidedAgainstContentHash === issue.contentHash
    && decision.decidedAgainstContentHash === current.contentHash
    && decision.decidedAgainstExcerpt === issue.excerpt
    && decision.contextFingerprint === issue.contextFingerprint
    && decision.contextFingerprint === current.contextFingerprint;
}

export async function executeInspectionRun<Run, Result>(operations: {
  createPending: () => Promise<Run>;
  inspectAndCommit: (run: Run) => Promise<Result>;
  markFailed: (run: Run, error: unknown) => Promise<unknown>;
}) {
  const run = await operations.createPending();
  try {
    return await operations.inspectAndCommit(run);
  } catch (error) {
    await operations.markFailed(run, error).catch(() => undefined);
    throw error;
  }
}
