import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { DELETE } from './route.js';

const request = (query: string) => new Request(`http://localhost/api/characters${query}`, { method: 'DELETE' }) as unknown as NextRequest;

function replaceMethod(target: object, key: string, implementation: (...args: never[]) => unknown) {
  const mutable = target as Record<string, unknown>; const original = mutable[key];
  mutable[key] = implementation; return () => { mutable[key] = original; };
}

test('Character DELETE requires projectId and hides cross-project characters', async t => {
  const restore = replaceMethod(db, '$transaction', async (callback: (transaction: object) => unknown) => callback({
    character: { findFirst: async () => null },
    symbolUsageRule: { updateMany: async () => { throw new Error('別Projectを変更してはならない'); } },
  }));
  t.after(restore);

  assert.equal((await DELETE(request('?id=character-a'))).status, 400);
  const response = await DELETE(request('?id=character-a&projectId=project-b'));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: '人物が見つかりません' });
});

test('Character DELETE keeps ownership check, cleanup and delete in one transaction', async t => {
  const calls: Array<{ operation: string; args?: unknown }> = [];
  const restore = replaceMethod(db, '$transaction', async (callback: (transaction: object) => unknown) => callback({
    character: {
      findFirst: async (args: unknown) => { calls.push({ operation: 'find', args }); return { id: 'character-a' }; },
      delete: async (args: unknown) => { calls.push({ operation: 'delete', args }); return { id: 'character-a' }; },
    },
    symbolUsageRule: { updateMany: async (args: unknown) => { calls.push({ operation: 'cleanup', args }); return { count: 1 }; } },
  }));
  t.after(restore);

  assert.equal((await DELETE(request('?id=character-a&projectId=project-a'))).status, 200);
  assert.deepEqual(calls.map(value => value.operation), ['find', 'cleanup', 'delete']);
  assert.deepEqual(calls[0].args, { where: { id: 'character-a', projectId: 'project-a' }, select: { id: true } });
  assert.deepEqual(calls[1].args, {
    where: { projectId: 'project-a', fixedSpeakerId: 'character-a', speakerMode: 'fixed_character' },
    data: { fixedSpeakerId: null, speakerMode: 'unknown' },
  });
});

test('Character DELETE reports transaction failure without a success response', async t => {
  const restore = replaceMethod(db, '$transaction', async () => { throw new Error('rollback'); });
  t.after(restore);
  assert.equal((await DELETE(request('?id=character-a&projectId=project-a'))).status, 500);
});
