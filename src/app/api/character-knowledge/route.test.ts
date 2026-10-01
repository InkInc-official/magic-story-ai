import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { DELETE, POST, PUT } from './route.js';

const request = (method: string, body?: Record<string, unknown>, query = '') => new Request(`http://localhost/api/character-knowledge${query}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body && { body: JSON.stringify(body) }) }) as unknown as NextRequest;
const valid = { projectId: 'p1', factId: 'f1', characterId: 'c1', status: 'suspects', effectiveChapterId: 'ch1', beliefNotes: '手掛かりから疑う', notes: '' };

function replaceMethod(target: object, key: string, implementation: (...args: never[]) => unknown) {
  const mutable = target as Record<string, unknown>;
  const original = mutable[key]; mutable[key] = implementation;
  return () => { mutable[key] = original; };
}

function validLinkMocks() {
  return [
    replaceMethod(db.storyFact, 'findFirst', async () => ({ id: 'f1' })),
    replaceMethod(db.character, 'findFirst', async () => ({ id: 'c1' })),
    replaceMethod(db.chapter, 'findFirst', async () => ({ id: 'ch1' })),
  ];
}

test('CharacterKnowledge API creates, updates and deletes history events', async t => {
  let knowledgeFindCount = 0;
  const restore = [...validLinkMocks(),
    replaceMethod(db.characterKnowledge, 'findFirst', async () => (++knowledgeFindCount === 2 ? { id: 'k1', factId: 'f1', characterId: 'c1', status: 'suspects', effectiveChapterId: 'ch1', beliefNotes: '', notes: '' } : knowledgeFindCount === 4 ? { id: 'k1' } : null)),
    replaceMethod(db.characterKnowledge, 'create', async () => ({ id: 'k1', ...valid })),
    replaceMethod(db.characterKnowledge, 'update', async () => ({ id: 'k1', ...valid, status: 'knows' })),
    replaceMethod(db.characterKnowledge, 'delete', async () => ({ id: 'k1' })),
  ];
  t.after(() => restore.reverse().forEach(callback => callback()));
  assert.equal((await POST(request('POST', valid))).status, 201);
  assert.equal((await PUT(request('PUT', { ...valid, id: 'k1', status: 'knows' }))).status, 200);
  assert.equal((await DELETE(request('DELETE', undefined, '?id=k1&projectId=p1'))).status, 200);
});

test('rejects invalid status and false belief without notes', async () => {
  assert.equal((await POST(request('POST', { ...valid, status: 'unknown' }))).status, 400);
  assert.equal((await POST(request('POST', { ...valid, status: 'believes_false', beliefNotes: '' }))).status, 400);
});

test('rejects cross-project character and chapter', async t => {
  let characterValid = false;
  let chapterValid = true;
  const restore = [
    replaceMethod(db.storyFact, 'findFirst', async () => ({ id: 'f1' })),
    replaceMethod(db.character, 'findFirst', async () => characterValid ? { id: 'c1' } : null),
    replaceMethod(db.chapter, 'findFirst', async () => chapterValid ? { id: 'ch1' } : null),
  ];
  t.after(() => restore.reverse().forEach(callback => callback()));
  assert.equal((await POST(request('POST', valid))).status, 400);
  characterValid = true;
  chapterValid = false;
  assert.equal((await POST(request('POST', valid))).status, 400);
});

test('rejects duplicate chapter point and duplicate story-start event', async t => {
  const restore = [...validLinkMocks(), replaceMethod(db.characterKnowledge, 'findFirst', async () => ({ id: 'duplicate' }))];
  t.after(() => restore.reverse().forEach(callback => callback()));
  assert.equal((await POST(request('POST', valid))).status, 409);
  assert.equal((await POST(request('POST', { ...valid, effectiveChapterId: null }))).status, 409);
});
