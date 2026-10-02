import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { PUT } from './route.js';

const request = (decisionStatus: string) => new Request('http://localhost/api/story-navigator/proposals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: 'p1', proposalId: 'proposal1', decisionStatus }) }) as unknown as NextRequest;
function replaceMethod(target: object, key: string, implementation: (...args: never[]) => unknown) { const value = target as Record<string, unknown>; const original = value[key]; value[key] = implementation; return () => { value[key] = original; }; }

test('updates all allowed decision transitions without changing Canon models', async t => {
  const updates: Record<string, unknown>[] = [];
  const restore = [
    replaceMethod(db.storyNavigatorProposal, 'findFirst', async () => ({ id: 'proposal1' })),
    replaceMethod(db.storyNavigatorProposal, 'update', async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return { id: 'proposal1', ...data }; }),
  ];
  t.after(() => restore.reverse().forEach(callback => callback()));
  for (const status of ['accepted', 'held', 'rejected', 'undecided']) assert.equal((await PUT(request(status))).status, 200);
  assert.deepEqual(updates.map(item => item.decisionStatus), ['accepted', 'held', 'rejected', 'undecided']);
  assert.equal(updates.at(-1)?.decidedAt, null);
});

test('rejects invalid status and cross-project Proposal', async t => {
  assert.equal((await PUT(request('canon'))).status, 400);
  const restore = replaceMethod(db.storyNavigatorProposal, 'findFirst', async () => null);
  t.after(restore);
  assert.equal((await PUT(request('accepted'))).status, 404);
});
