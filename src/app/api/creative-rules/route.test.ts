import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { DELETE as deleteTechnique, GET as getTechniques, POST as postTechnique, PUT as putTechnique } from './techniques/route.js';
import { DELETE as deleteCustom, POST as postCustom, PUT as putCustom } from './custom/route.js';

const request = (method: string, body?: Record<string, unknown>, query = '') => new Request(`http://localhost/api/creative-rules${query}`, {
  method, headers: { 'Content-Type': 'application/json' }, ...(body && { body: JSON.stringify(body) }),
}) as unknown as NextRequest;

function replaceMethod(target: object, key: string, implementation: (...args: never[]) => unknown) {
  const mutable = target as Record<string, unknown>; const original = mutable[key];
  mutable[key] = implementation; return () => { mutable[key] = original; };
}

test('Creative Rules APIはmissing/nonexistent Projectを日本語errorで拒否する', async t => {
  const restore = replaceMethod(db.project, 'findUnique', async () => null); t.after(restore);
  const missing = await getTechniques(request('GET'));
  assert.equal(missing.status, 400); assert.deepEqual(await missing.json(), { error: 'Project IDは必須です' });
  const nonexistent = await postTechnique(request('POST', { projectId: 'missing', techniqueKey: 'show_dont_tell' }));
  assert.equal(nonexistent.status, 404); assert.match((await nonexistent.json()).error, /Project/);
});

test('Built-in APIはsource/version/mass assignmentを保存せずoffとactive=falseを別々に保持する', async t => {
  let data: Record<string, unknown> | undefined;
  const restore = [
    replaceMethod(db.project, 'findUnique', async () => ({ id: 'project-a' })),
    replaceMethod(db.projectCreativeTechnique, 'create', async (args: { data: Record<string, unknown> }) => { data = args.data; return { id: 'rule', ...args.data }; }),
  ];
  t.after(() => restore.reverse().forEach(value => value()));
  const response = await postTechnique(request('POST', {
    projectId: 'project-a', techniqueKey: 'show_dont_tell', mode: 'off', active: false,
    source: 'ai_suggested_then_confirmed', catalogContractVersion: 99, guidance: '上書き', id: 'spoof',
  }));
  assert.equal(response.status, 201); assert.equal(data?.mode, 'off'); assert.equal(data?.active, false);
  assert.equal(data?.source, 'author'); assert.equal(data?.catalogContractVersion, 1);
  assert.equal(data?.guidance, undefined); assert.equal(data?.id, undefined);
});

test('Built-in APIはID/projectId混在によるcross-project update/deleteを404にする', async t => {
  const restore = [
    replaceMethod(db.projectCreativeTechnique, 'findFirst', async () => null),
    replaceMethod(db.projectCreativeTechnique, 'deleteMany', async () => ({ count: 0 })),
  ];
  t.after(() => restore.reverse().forEach(value => value()));
  assert.equal((await putTechnique(request('PUT', { id: 'project-a-row', projectId: 'project-b', mode: 'required' }))).status, 404);
  assert.equal((await deleteTechnique(request('DELETE', undefined, '?id=project-a-row&projectId=project-b'))).status, 404);
});

test('Custom APIはoffとsource spoofingを拒否しcross-project mutationを隠す', async t => {
  const restore = [
    replaceMethod(db.project, 'findUnique', async () => ({ id: 'project-a' })),
    replaceMethod(db.projectCustomCreativeRule, 'findFirst', async () => null),
    replaceMethod(db.projectCustomCreativeRule, 'deleteMany', async () => ({ count: 0 })),
  ];
  t.after(() => restore.reverse().forEach(value => value()));
  const invalid = await postCustom(request('POST', { projectId: 'project-a', title: '方針', instruction: '本文', category: 'style', mode: 'off', source: 'author' }));
  assert.equal(invalid.status, 400);
  assert.equal((await putCustom(request('PUT', { id: 'project-a-row', projectId: 'project-b', title: '変更' }))).status, 404);
  assert.equal((await deleteCustom(request('DELETE', undefined, '?id=project-a-row&projectId=project-b'))).status, 404);
});
