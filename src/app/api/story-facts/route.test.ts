import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { DELETE, POST, PUT } from './route.js';

const request = (method: string, body?: Record<string, unknown>, query = '') => new Request(`http://localhost/api/story-facts${query}`, {
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body && { body: JSON.stringify(body) }),
}) as unknown as NextRequest;

const valid = { projectId: 'p1', content: '犯人は美咲である', importance: 'high', readerInitiallyKnows: false, plannedRevealChapterId: 'c1', revealedChapterId: null, notes: '' };

function replaceMethod(target: object, key: string, implementation: (...args: never[]) => unknown) {
  const mutable = target as Record<string, unknown>;
  const original = mutable[key];
  mutable[key] = implementation;
  return () => { mutable[key] = original; };
}

test('StoryFact API creates, updates and deletes within a project boundary', async t => {
  const restore = [
    replaceMethod(db.project, 'findUnique', async () => ({ id: 'p1' })),
    replaceMethod(db.chapter, 'count', async () => 1),
    replaceMethod(db.storyFact, 'create', async () => ({ id: 'f1', ...valid })),
    replaceMethod(db.storyFact, 'findFirst', async () => ({ id: 'f1', ...valid })),
    replaceMethod(db.storyFact, 'update', async () => ({ id: 'f1', ...valid, content: '更新済み' })),
    replaceMethod(db.storyFact, 'deleteMany', async () => ({ count: 1 })),
  ];
  t.after(() => restore.reverse().forEach(callback => callback()));

  assert.equal((await POST(request('POST', valid))).status, 201);
  assert.equal((await PUT(request('PUT', { ...valid, id: 'f1', content: '更新済み' }))).status, 200);
  assert.equal((await DELETE(request('DELETE', undefined, '?id=f1&projectId=p1'))).status, 200);
});

test('StoryFact API rejects empty content and invalid importance', async () => {
  assert.equal((await POST(request('POST', { ...valid, content: ' ' }))).status, 400);
  assert.equal((await POST(request('POST', { ...valid, importance: 'urgent' }))).status, 400);
});

test('StoryFact API rejects planned and revealed chapters from another project', async t => {
  const restore = [
    replaceMethod(db.project, 'findUnique', async () => ({ id: 'p1' })),
    replaceMethod(db.chapter, 'count', async () => 0),
  ];
  t.after(() => restore.reverse().forEach(callback => callback()));
  assert.equal((await POST(request('POST', valid))).status, 400);
  assert.equal((await POST(request('POST', { ...valid, plannedRevealChapterId: null, revealedChapterId: 'other-project-chapter' }))).status, 400);
});
