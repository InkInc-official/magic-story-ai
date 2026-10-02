import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContextFingerprint, buildIssueFingerprint, decisionIsFresh, executeInspectionRun, issueCoveredByScope, partitionReinspection } from './narrative-inspector-persistence.js';
import type { NarrativeInspectorIssue } from './narrative-inspector.js';

function issue(overrides: Partial<NarrativeInspectorIssue> = {}): NarrativeInspectorIssue {
  return {
    category: 'voice', issueType: 'first_person_mismatch', locationKind: 'excerpt', excerpt: '「俺は行く」', startOffset: 10, endOffset: 16,
    explanation: '確認', suggestedDirection: '意図を確認', severity: 'check', evidenceRefs: ['character:a'], adjustments: [], ...overrides,
  };
}

function persisted(overrides: Record<string, unknown> = {}) {
  return { id: 'i1', fingerprint: 'fp1', locationKind: 'excerpt', startOffset: 10, endOffset: 16, excerpt: '「俺は行く」', status: 'open', contentHash: 'content-1', ...overrides } as never;
}

test('offset移動ではfingerprintが変わらず、excerpt・issueType・evidence変更ではfalse mergeしない', () => {
  const first = buildIssueFingerprint('p1', 'c1', issue());
  assert.equal(first, buildIssueFingerprint('p1', 'c1', issue({ startOffset: 100, endOffset: 106 })));
  assert.notEqual(first, buildIssueFingerprint('p1', 'c1', issue({ excerpt: '「僕は行く」' })));
  assert.notEqual(first, buildIssueFingerprint('p1', 'c1', issue({ issueType: 'speech_style_mismatch' })));
  assert.notEqual(first, buildIssueFingerprint('p1', 'c1', issue({ evidenceRefs: ['relationship:r1'] })));
  assert.notEqual(buildIssueFingerprint('p1', 'c1', issue({ excerpt: 'Ａ' })), buildIssueFingerprint('p1', 'c1', issue({ excerpt: 'A' })));
  assert.notEqual(buildIssueFingerprint('p1', 'c1', issue({ excerpt: '言葉 A' })), buildIssueFingerprint('p1', 'c1', issue({ excerpt: '言葉\nA' })));
  const repeated = '朝。彼は言った。「俺は行く」昼。彼は言った。「俺は行く」夜。';
  const firstStart = repeated.indexOf('「俺は行く」'); const secondStart = repeated.lastIndexOf('「俺は行く」');
  const firstOccurrence = issue({ startOffset: firstStart, endOffset: firstStart + '「俺は行く」'.length });
  const secondOccurrence = issue({ startOffset: secondStart, endOffset: secondStart + '「俺は行く」'.length });
  assert.notEqual(buildIssueFingerprint('p1', 'c1', firstOccurrence, { text: repeated, startOffset: 0 }), buildIssueFingerprint('p1', 'c1', secondOccurrence, { text: repeated, startOffset: 0 }));
});

test('contextFingerprintはkey順序に依存せず、Rule/Knowledge/Voice変更を検知する', () => {
  const base = buildContextFingerprint({ rules: [{ id: 'r1', updatedAt: 'a' }], voice: 'v1', knowledge: 'k1' });
  assert.equal(base, buildContextFingerprint({ knowledge: 'k1', voice: 'v1', rules: [{ updatedAt: 'a', id: 'r1' }] }));
  assert.notEqual(base, buildContextFingerprint({ rules: [{ id: 'r1', updatedAt: 'b' }], voice: 'v1', knowledge: 'k1' }));
  assert.notEqual(base, buildContextFingerprint({ rules: [{ id: 'r1', updatedAt: 'a' }], voice: 'v2', knowledge: 'k1' }));
  assert.notEqual(base, buildContextFingerprint({ rules: [{ id: 'r1', updatedAt: 'a' }], voice: 'v1', knowledge: 'k2' }));
});

test('全文再検査は消失Issueをresolved対象にし、同一fingerprint再出現はmatched/reopen対象にする', () => {
  const existing = [persisted(), persisted({ id: 'i2', fingerprint: 'fp2', status: 'resolved' })];
  const result = partitionReinspection(existing, new Set(['fp2']), { start: 0, end: 100, fullChapter: true, contentHash: 'content-2' });
  assert.deepEqual(result.matched.map(value => value.id), ['i2']);
  assert.deepEqual(result.resolved.map(value => value.id), ['i1']);
});

test('部分検査は範囲内だけresolved対象にし、本文hash変更時とchapter Issueは触らない', () => {
  const inside = persisted({ id: 'inside', startOffset: 10, endOffset: 16 });
  const outside = persisted({ id: 'outside', fingerprint: 'fp2', startOffset: 80, endOffset: 90 });
  const chapter = persisted({ id: 'chapter', fingerprint: 'fp3', locationKind: 'chapter', startOffset: 0, endOffset: 100 });
  const scope = { start: 0, end: 50, fullChapter: false, contentHash: 'content-1' };
  assert.equal(issueCoveredByScope(inside, scope), true);
  assert.equal(issueCoveredByScope(outside, scope), false);
  assert.equal(issueCoveredByScope(chapter, scope), false);
  assert.equal(issueCoveredByScope(inside, { ...scope, contentHash: 'changed' }), false);
  const result = partitionReinspection([inside, outside, chapter], new Set(), scope);
  assert.deepEqual(result.resolved.map(value => value.id), ['inside']);
  assert.deepEqual(result.untouched.map(value => value.id), ['outside', 'chapter']);
});

test('作者判断はIssue・本文・excerpt・context完全一致時だけfresh', () => {
  const decision = { issueFingerprint: 'fp', decidedAgainstContentHash: 'content', decidedAgainstExcerpt: 'excerpt', contextFingerprint: 'context' };
  const target = { fingerprint: 'fp', contentHash: 'content', excerpt: 'excerpt', contextFingerprint: 'context' };
  const current = { contentHash: 'content', contextFingerprint: 'context' };
  assert.equal(decisionIsFresh(decision, target, current), true);
  assert.equal(decisionIsFresh(decision, { ...target, excerpt: 'changed' }, current), false);
  assert.equal(decisionIsFresh(decision, target, { ...current, contentHash: 'changed' }), false);
  assert.equal(decisionIsFresh(decision, target, { ...current, contextFingerprint: 'changed' }), false);
});

test('全作者判断種別はAdapter rolloutだけではfreshnessを失わない', () => {
  for (const decisionValue of ['accepted_issue', 'allowed_exception', 'not_an_issue']) {
    const decision = { decision: decisionValue, issueFingerprint: 'fp', decidedAgainstContentHash: 'content', decidedAgainstExcerpt: 'excerpt', contextFingerprint: 'legacy-compatible' };
    const target = { fingerprint: 'fp', contentHash: 'content', excerpt: 'excerpt', contextFingerprint: 'legacy-compatible' };
    assert.equal(decisionIsFresh(decision, target, { contentHash: 'content', contextFingerprint: 'legacy-compatible' }), true);
  }
});

test('successful runはpending作成後にatomic commitしcompleted結果を返す', async () => {
  const events: string[] = [];
  const result = await executeInspectionRun({
    createPending: async () => { events.push('pending'); return { id: 'run1' }; },
    inspectAndCommit: async () => { events.push('atomic:issues+completed'); return 'completed'; },
    markFailed: async () => { events.push('failed'); },
  });
  assert.equal(result, 'completed');
  assert.deepEqual(events, ['pending', 'atomic:issues+completed']);
});

test('AI・schema・transaction failureはfailed Runにしpartial成功を返さない', async () => {
  for (const failure of ['ai', 'invalid_schema', 'transaction']) {
    const events: string[] = [];
    await assert.rejects(() => executeInspectionRun({
      createPending: async () => { events.push('pending'); return { id: 'run1' }; },
      inspectAndCommit: async () => { events.push(`failure:${failure}`); throw new Error(failure); },
      markFailed: async () => { events.push('failed'); },
    }), new RegExp(failure));
    assert.deepEqual(events, ['pending', `failure:${failure}`, 'failed']);
  }
});
