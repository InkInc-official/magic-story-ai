import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { EXPLORATION_BATCH_HARD_CAP, assertObservationProvenance, dedupeObservations, parseExplorationCandidates, parseExplorationObservations, selectExplorationChapters, splitChapterForExploration, type ExplorationChapter } from './exploration.js';

const chapter = (id: string, order: number, content = `本文${id}`): ExplorationChapter => ({ id, order, title: id, content });

describe('exploration range', () => {
  const chapters = [chapter('c1', 1), chapter('c2', 2), chapter('c3', 3), chapter('future', 4)];
  test('includes anchor and excludes future', () => assert.deepEqual(selectExplorationChapters(chapters, 3, { rangeMode: 'all' }).map(item => item.id), ['c1', 'c2', 'c3']));
  test('respects recent and explicit ranges', () => {
    assert.deepEqual(selectExplorationChapters(chapters, 3, { rangeMode: 'recent', recentCount: 2 }).map(item => item.id), ['c2', 'c3']);
    assert.deepEqual(selectExplorationChapters(chapters, 3, { rangeMode: 'range', startChapterId: 'c1', endChapterId: 'c2' }).map(item => item.id), ['c1', 'c2']);
  });
  test('rejects an out-of-bound range chapter', () => assert.throws(() => selectExplorationChapters(chapters, 3, { rangeMode: 'range', startChapterId: 'c1', endChapterId: 'future' })));
});

test('splits long chapters at paragraph boundaries under the batch budget', () => {
  const parts = splitChapterForExploration(chapter('long', 1, `${'あ'.repeat(3000)}\n\n${'い'.repeat(3000)}\n\n${'う'.repeat(3000)}`), 7000);
  assert.equal(parts.length, 2);
  assert.ok(parts.every(part => part.content.length <= 7000));
  assert.ok(EXPLORATION_BATCH_HARD_CAP > 7000);
});

test('deduplicates exact, normalized and same-excerpt observations', () => {
  const base = { observationKey: 'a', sourceChapterId: 'c1', excerpt: '古い 鍵。', elementSummary: '古い鍵', reasonInteresting: '具体物' };
  const values = [base, { ...base, observationKey: 'b' }, { ...base, observationKey: 'c', excerpt: '古い鍵' }, { ...base, observationKey: 'summary', excerpt: '鍵が置かれていた', elementSummary: '古い 鍵。' }, { ...base, observationKey: 'd', sourceChapterId: 'c2' }];
  assert.deepEqual(dedupeObservations(values).map(item => item.observationKey), ['a', 'd']);
});

test('validates structured stages and rejects hallucinated provenance', () => {
  const stage1 = JSON.stringify({ schemaVersion: 1, observations: [{ sourceChapterId: 'c1', excerpt: '古い鍵', elementSummary: '鍵', reasonInteresting: '再登場可能' }] });
  const observations = parseExplorationObservations(stage1, 'c1');
  assert.doesNotThrow(() => assertObservationProvenance(observations[0], [chapter('c1', 1, '机に古い鍵を戻した')]));
  assert.throws(() => assertObservationProvenance({ ...observations[0], excerpt: '存在しない描写' }, [chapter('c1', 1, '机に古い鍵を戻した')]));
  assert.throws(() => parseExplorationObservations(stage1, 'other'));
  assert.throws(() => parseExplorationObservations('{"schemaVersion":1,"observations":[{}]}', 'c1'));
  const stage2 = JSON.stringify({ schemaVersion: 1, candidates: [{ observationKey: 'c1:0', possibleUses: ['事件へ接続'], currentStoryRelation: '現在地と関連', authorIntentRelation: '意図に沿う', risks: ['後付け感'], relevance: 'medium' }] });
  assert.equal(parseExplorationCandidates(stage2, new Set(['c1:0'])).length, 1);
  assert.throws(() => parseExplorationCandidates(stage2, new Set(['other'])));
});

test('rejects oversized exploration output', () => {
  assert.throws(() => parseExplorationObservations(JSON.stringify({ schemaVersion: 1, observations: Array.from({ length: 51 }, () => ({ sourceChapterId: 'c1', excerpt: '鍵', elementSummary: '鍵', reasonInteresting: '理由' })) }), 'c1'));
  assert.throws(() => parseExplorationObservations(JSON.stringify({ schemaVersion: 1, observations: [{ sourceChapterId: 'c1', excerpt: 'x'.repeat(1201), elementSummary: '鍵', reasonInteresting: '理由' }] }), 'c1'));
  assert.throws(() => parseExplorationCandidates(JSON.stringify({ schemaVersion: 1, candidates: [{ observationKey: 'key', possibleUses: Array.from({ length: 21 }, () => '用途'), currentStoryRelation: '関係', authorIntentRelation: '意図', risks: [], relevance: 'high' }] }), new Set(['key'])));
});
