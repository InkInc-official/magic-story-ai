import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { GET, POST, PUT } from './route.js';

const request = (method: string, body: Record<string, unknown>) => new Request('http://localhost/api/projects', {
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}) as unknown as NextRequest;

function replaceMethod(target: object, key: string, implementation: (...args: never[]) => unknown) {
  const mutable = target as Record<string, unknown>;
  const original = mutable[key];
  mutable[key] = implementation;
  return () => { mutable[key] = original; };
}

test('Project API preserves genre and applies guidance defaults on creation', async t => {
  let createData: Record<string, unknown> = {};
  const restore = replaceMethod(db.project, 'create', async ({ data }: { data: Record<string, unknown> }) => {
    createData = data;
    return { id: 'p1', ...data };
  });
  t.after(restore);

  const response = await POST(request('POST', { title: '既存作品', genre: '玄幻系统修仙' }));
  assert.equal(response.status, 201);
  assert.equal(createData.genre, '玄幻系统修仙');
  assert.equal(createData.authorIntent, '');
  assert.equal(createData.genreGuidanceMode, 'reference');
  assert.equal(createData.genreGuidanceNotes, '');
});

test('Project API saves and reloads author intent and genre guidance', async t => {
  const saved = {
    id: 'p1', title: '作品', genre: '玄幻系统修仙', authorIntent: '人物の選択を描く',
    genreGuidanceMode: 'required', genreGuidanceNotes: 'フェアプレイを重視する',
  };
  let updateData: Record<string, unknown> = {};
  const restore = [
    replaceMethod(db.project, 'update', async ({ data }: { data: Record<string, unknown> }) => {
      updateData = data;
      return { ...saved, ...data };
    }),
    replaceMethod(db.project, 'findMany', async () => [{ ...saved, ...updateData }]),
  ];
  t.after(() => restore.reverse().forEach(callback => callback()));

  const update = await PUT(request('PUT', saved));
  assert.equal(update.status, 200);
  const reload = await GET();
  const [project] = await reload.json();
  assert.equal(project.authorIntent, saved.authorIntent);
  assert.equal(project.genreGuidanceMode, saved.genreGuidanceMode);
  assert.equal(project.genreGuidanceNotes, saved.genreGuidanceNotes);
  assert.equal(project.genre, saved.genre);
});

test('Project API rejects invalid genre guidance modes', async () => {
  assert.equal((await POST(request('POST', { title: '作品', genreGuidanceMode: 'sometimes' }))).status, 400);
  assert.equal((await PUT(request('PUT', { id: 'p1', genreGuidanceMode: 'sometimes' }))).status, 400);
});
