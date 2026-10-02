export const LEARNING_LEVELS = [0, 1, 2] as const;
export type LearningLevel = typeof LEARNING_LEVELS[number];

export class NarrativeLearningError extends Error {
  constructor(public code: 'invalid_input' | 'invalid_json' | 'invalid_schema' | 'stale' | 'not_found' | 'ai_failure', message: string) { super(message); }
}

export function fallbackLearningQuestion(category: string) {
  if (category === 'viewpoint') return 'この場面で、現在の視点人物または語り手が直接知覚できる情報はどこまででしょうか？';
  if (category === 'knowledge') return 'この時点で、本文の人物や読者はどの情報まで知っているでしょうか？';
  if (category === 'voice') return 'この人物は、この場面の相手や状況に対して、普段どのような話し方をする設定でしょうか？';
  return 'この作品ルールは、この場面にも適用される条件でしょうか？';
}

export function parseLearningOutput(raw: string, requestedLevel: LearningLevel) {
  if (!raw.trim()) throw new NarrativeLearningError('invalid_json', 'Learning AIから空の応答が返されました');
  const fenced = raw.trim().match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const first = raw.indexOf('{'); const last = raw.lastIndexOf('}');
  const candidates = [...new Set([raw.trim(), fenced, first >= 0 && last > first ? raw.slice(first, last + 1) : ''].filter((value): value is string => Boolean(value)))];
  let parsed: unknown;
  for (const candidate of candidates) {
    try { parsed = JSON.parse(candidate); break; } catch { /* try next */ }
  }
  if (!parsed || typeof parsed !== 'object') throw new NarrativeLearningError('invalid_json', 'Learning応答をJSONとして解釈できません');
  const value = parsed as Record<string, unknown>;
  if (value.schemaVersion !== 1 || value.level !== requestedLevel || typeof value.content !== 'string' || !value.content.trim() || value.content.length > 1200) {
    throw new NarrativeLearningError('invalid_schema', 'Learning応答の形式が不正です');
  }
  return { schemaVersion: 1 as const, level: requestedLevel, content: value.content.trim() };
}

export function learningSessionIsFresh(session: { startingIssueFingerprint: string; startingContentHash: string; startingContextFingerprint: string }, current: { issueFingerprint: string; contentHash: string; contextFingerprint: string }) {
  return session.startingIssueFingerprint === current.issueFingerprint
    && session.startingContentHash === current.contentHash
    && session.startingContextFingerprint === current.contextFingerprint;
}

export function nextLearningLevel(currentLevel: number): 1 | 2 {
  if (currentLevel === 0) return 1;
  if (currentLevel === 1) return 2;
  throw new NarrativeLearningError('invalid_input', 'これ以上のヒントLevelはありません');
}

export function learningStatusAfterReinspection(
  session: { startingIssueFingerprint: string; startingContentHash: string; startingContextFingerprint: string },
  current: { issueFingerprint: string; contentHash: string; contextFingerprint: string },
  issueResolvedInScope: boolean,
): 'active' | 'completed' | 'stale' {
  if (issueResolvedInScope) return 'completed';
  return learningSessionIsFresh(session, current) ? 'active' : 'stale';
}
