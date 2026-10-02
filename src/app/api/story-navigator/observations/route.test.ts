import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { PUT } from './route.js';

const request = (status: string) => new Request('http://localhost/api/story-navigator/observations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'p1', observationId: 'o1', decisionStatus: status }) }) as unknown as NextRequest;
function replaceMethod(target: object, key: string, implementation: (...args: never[]) => unknown) { const object = target as Record<string, unknown>; const original = object[key]; object[key] = implementation; return () => { object[key] = original; }; }

test('updates candidate decisions only inside the Project boundary', async t => {
  const updates: Record<string, unknown>[] = [];
  const restore = [replaceMethod(db.storyNavigatorObservation, 'findFirst', async () => ({ id: 'o1' })), replaceMethod(db.storyNavigatorObservation, 'update', async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return data; })];
  t.after(() => restore.reverse().forEach(callback => callback()));
  for (const status of ['accepted', 'held', 'rejected', 'undecided']) assert.equal((await PUT(request(status))).status, 200);
  assert.deepEqual(updates.map(item => item.decisionStatus), ['accepted', 'held', 'rejected', 'undecided']);
  assert.equal(updates.at(-1)?.decidedAt, null);
});

test('rejects invalid and cross-project decisions', async t => {
  assert.equal((await PUT(request('canon'))).status, 400);
  const restore = replaceMethod(db.storyNavigatorObservation, 'findFirst', async () => null); t.after(restore);
  assert.equal((await PUT(request('accepted'))).status, 404);
});
