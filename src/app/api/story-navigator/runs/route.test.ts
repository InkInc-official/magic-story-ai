import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { GET } from './route.js';

function replaceMethod(target: object, key: string, implementation: (...args: never[]) => unknown) { const value = target as Record<string, unknown>; const original = value[key]; value[key] = implementation; return () => { value[key] = original; }; }
const request = (query: string) => new Request(`http://localhost/api/story-navigator/runs?${query}`) as unknown as NextRequest;

test('loads a Run only through its Project boundary', async t => {
  let where: unknown;
  const restore = replaceMethod(db.storyNavigatorRun, 'findFirst', async (args: { where: unknown }) => { where = args.where; return null; });
  t.after(restore);
  assert.equal((await GET(request('projectId=p1&runId=run-other'))).status, 404);
  assert.deepEqual(where, { id: 'run-other', projectId: 'p1' });
});

test('requires projectId for Run history', async () => {
  assert.equal((await GET(request('runId=run1'))).status, 400);
});
