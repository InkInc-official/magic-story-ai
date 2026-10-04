import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { generateStoryNavigatorRun } from './service.js';
import type { NavigatorContextResult } from './types.js';

const routes = [0, 1].map(index => ({ routeKey: String.fromCharCode(65 + index), title: `案${index}`, summary: '概要', whyPossible: '理由', authorIntentRelation: '一致', preparation: [], affectedEntities: [], benefits: [], risks: [], immediateOptions: [] }));
const raw = JSON.stringify({ schemaVersion: 1, currentPosition: { summary: '現在地', planDeviation: ['変更'] }, routes });
const contextResult = {
  context: 'navigator context',
  manifest: { version: '3b2-v1', anchor: { id: 'c1', order: 1 }, chapters: [], characterIds: [], storyFactIds: [], characterKnowledgeIds: [], outlineIds: [], plotIds: [], relationshipIds: [], foreshadowingIds: [], storyStateIds: [], worldSettingIds: [], sceneIds: [], storyNodeIds: [], storyEdgeIds: [], omittedSections: [], finalContextLength: 17 },
  currentState: { project: { id: 'p1', title: '作品', genre: 'genre', description: '', authorIntent: 'snapshot intent', genreGuidanceMode: 'required', genreGuidanceNotes: 'snapshot genre' } },
} as unknown as NavigatorContextResult;

function fakeDatabase() {
  const state = { runCreate: null as Record<string, unknown> | null, runUpdates: [] as Record<string, unknown>[], proposals: [] as Record<string, unknown>[] };
  const transaction = {
    storyNavigatorRun: {
      update: async ({ data }: { data: Record<string, unknown> }) => { state.runUpdates.push(data); return { id: 'run1', ...data }; },
      findUniqueOrThrow: async () => ({ id: 'run1', proposals: state.proposals }),
    },
    storyNavigatorProposal: { createMany: async ({ data }: { data: Record<string, unknown>[] }) => { state.proposals.push(...data); return { count: data.length }; } },
  };
  const database = {
    storyNavigatorRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => { state.runCreate = data; return { id: 'run1', ...data }; },
      update: transaction.storyNavigatorRun.update,
    },
    $transaction: async (callback: (value: typeof transaction) => unknown) => callback(transaction),
  } as unknown as PrismaClient;
  return { database, state };
}

test('persists a completed Run, snapshots and undecided Proposals atomically', async () => {
  const { database, state } = fakeDatabase();
  await generateStoryNavigatorRun({ projectId: 'p1', anchorChapterId: 'c1', request: '質問' }, {
    database,
    buildContext: async () => contextResult,
    complete: async () => raw,
  });
  assert.equal(state.runCreate?.authorIntentSnapshot, 'snapshot intent');
  assert.equal(state.runCreate?.genreGuidanceModeSnapshot, 'required');
  assert.equal(state.runCreate?.genreGuidanceNotesSnapshot, 'snapshot genre');
  assert.equal(state.runCreate?.sourceManifest, JSON.stringify(contextResult.manifest));
  assert.equal(state.runUpdates[0].rawResponse, raw);
  assert.equal(state.runUpdates[0].status, 'completed');
  assert.equal(state.proposals.length, 2);
  assert.ok(state.proposals.every(proposal => proposal.decisionStatus === 'undecided'));
});

test('marks a Run failed and creates no Proposal for invalid output', async () => {
  const { database, state } = fakeDatabase();
  await assert.rejects(() => generateStoryNavigatorRun({ projectId: 'p1', anchorChapterId: 'c1' }, {
    database,
    buildContext: async () => contextResult,
    complete: async () => 'invalid json',
  }));
  assert.equal(state.proposals.length, 0);
  assert.equal(state.runUpdates.at(-1)?.status, 'failed');
  assert.equal(state.runUpdates.at(-1)?.rawResponse, 'invalid json');
});

test('Navigator completion receives no Universal Agent tools', async () => {
  const { database } = fakeDatabase();
  let options: Record<string, unknown> = {};
  await generateStoryNavigatorRun({ projectId: 'p1', anchorChapterId: 'c1' }, {
    database,
    buildContext: async () => contextResult,
    complete: async value => { options = value as unknown as Record<string, unknown>; return raw; },
  });
  assert.equal('tools' in options, false);
});

test('Creative Rule context load failure is not treated as zero rules and creates no Run', async () => {
  const { database, state } = fakeDatabase();
  await assert.rejects(() => generateStoryNavigatorRun({ projectId: 'p1', anchorChapterId: 'c1' }, {
    database,
    buildContext: async () => { throw new Error('creative rule load failed'); },
    complete: async () => raw,
  }), /creative rule load failed/);
  assert.equal(state.runCreate, null);
});
