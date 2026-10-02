import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractPromotionDraft, validatePromotionDraft } from './promotion-structured.js';

const chapters = new Set(['chapter-1']);

test('accepts create-only Plot and Foreshadowing drafts with safe statuses', () => {
  const actions = validatePromotionDraft({ actions: [
    { targetType: 'plot', operation: 'create', reason: '正式計画にする', payload: { name: '対立の深化', description: '対立を進める', plotType: 'main', priority: 10, status: 'planned', tags: ['対立'], order: 1 } },
    { targetType: 'foreshadowing', operation: 'create', reason: '過去描写を今後再利用する', payload: { chapterId: 'chapter-1', content: '鍵を再登場させる計画', expectedResolveChapter: 8, status: 'planted', importance: 'high' } },
  ] }, chapters);
  assert.equal(actions[0].payload.status, 'planned');
  assert.equal(actions[1].payload.status, 'planted');
});

test('allows zero actions when no concrete formal plan is justified', () => {
  assert.deepEqual(extractPromotionDraft('{"schemaVersion":1,"actions":[]}', chapters), []);
});

test('rejects unsupported targets, update/delete and malformed project relations', () => {
  assert.throws(() => validatePromotionDraft({ actions: [{ targetType: 'story_fact', operation: 'create', reason: 'x', payload: {} }] }, chapters));
  assert.throws(() => validatePromotionDraft({ actions: [{ targetType: 'plot', operation: 'update', reason: 'x', payload: { name: 'x' } }] }, chapters));
  assert.throws(() => validatePromotionDraft({ actions: [{ targetType: 'foreshadowing', operation: 'create', reason: 'x', payload: { chapterId: 'other-project', content: 'x' } }] }, chapters));
  assert.throws(() => validatePromotionDraft({ actions: [{ targetType: 'plot', operation: 'create', reason: 'x', payload: { name: 'x', plotType: 'invalid', priority: 0, order: 0, status: 'planned', tags: [] } }] }, chapters));
  assert.throws(() => validatePromotionDraft({ actions: [{ targetType: 'foreshadowing', operation: 'create', reason: 'x', payload: { chapterId: 'chapter-1', content: 'x', expectedResolveChapter: 2, status: 'resolved', importance: 'high' } }] }, chapters));
});
