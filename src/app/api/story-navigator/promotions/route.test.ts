import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { GET, PUT } from './route.js';

function replaceMethod(target: object, key: string, implementation: (...args: never[]) => unknown) { const object = target as Record<string, unknown>; const original = object[key]; object[key] = implementation; return () => { object[key] = original; }; }
const getRequest = (query: string) => new Request(`http://localhost/api/story-navigator/promotions?${query}`) as unknown as NextRequest;
const putRequest = (projectId: string, status = 'approved') => new Request('http://localhost/api/story-navigator/promotions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, actionId: 'action1', status }) }) as unknown as NextRequest;

test('lists and reviews Promotion Actions only inside the Project boundary', async t => {
  let listWhere: unknown; let reviewWhere: unknown; const updates: Record<string, unknown>[] = [];
  const restore = [
    replaceMethod(db.storyNavigatorPromotionAction, 'findMany', async ({ where }: { where: unknown }) => { listWhere = where; return []; }),
    replaceMethod(db.storyNavigatorPromotionAction, 'findFirst', async ({ where }: { where: unknown }) => { reviewWhere = where; return { id: 'action1', status: 'draft' }; }),
    replaceMethod(db.storyNavigatorPromotionAction, 'update', async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return data; }),
  ];
  t.after(() => restore.reverse().forEach(callback => callback()));
  assert.equal((await GET(getRequest('projectId=p1'))).status, 200);
  assert.deepEqual(listWhere, { projectId: 'p1' });
  assert.equal((await PUT(putRequest('p1'))).status, 200);
  assert.deepEqual(reviewWhere, { id: 'action1', projectId: 'p1' });
  assert.equal(updates[0].status, 'approved');
});

test('rejects invalid lifecycle values and cross-project actions', async t => {
  assert.equal((await PUT(putRequest('p1', 'applied'))).status, 400);
  const restore = replaceMethod(db.storyNavigatorPromotionAction, 'findFirst', async () => null); t.after(restore);
  assert.equal((await PUT(putRequest('other'))).status, 404);
});
