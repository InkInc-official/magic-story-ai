import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { db as realDb } from '../db.js';
import { applyPromotionAction, createPromotionDraft, observationSnapshot, proposalSnapshot } from './promotion.js';

const now = new Date('2026-10-02T00:00:00.000Z');
const run = { projectId: 'p1', sourceManifest: '{}', anchorChapter: { id: 'c1', order: 0, title: '始まり', outlineContent: '', summary: '', content: '本文' } };
const proposal = { id: 'source1', runId: 'run1', routeKey: 'A', title: '案', summary: '要約', decisionStatus: 'accepted', updatedAt: now, run };
const targetSnapshot = JSON.stringify({ project: { updatedAt: now }, plots: [], foreshadowings: [], storyFacts: [], characterKnowledge: [] });

function fakeDatabase(overrides: Record<string, unknown> = {}) {
  const claimCount = typeof overrides.claimCount === 'number' ? overrides.claimCount : 1;
  const actionOverrides = { ...overrides }; delete actionOverrides.claimCount;
  const calls = { plots: 0, foreshadowings: 0, updates: [] as Array<Record<string, unknown>>, findWhere: null as unknown };
  const action = { id: 'a1', projectId: 'p1', sourceType: 'navigator_proposal', sourceProposalId: 'source1', sourceObservationId: null, targetType: 'plot', operation: 'create', proposedPayload: JSON.stringify({ name: '正式計画', description: '', plotType: 'main', priority: 1, status: 'planned', tags: [], order: 0 }), reason: '採用案を計画にする', status: 'approved', sourceSnapshot: proposalSnapshot(proposal), sourceUpdatedAt: now, targetSnapshot, createdEntityId: null, sourceProposal: proposal, sourceObservation: null, ...actionOverrides };
  const transaction = {
    storyNavigatorPromotionAction: {
      findFirst: async ({ where }: { where: unknown }) => { calls.findWhere = where; return action; },
      updateMany: async () => ({ count: claimCount }),
      update: async ({ data }: { data: Record<string, unknown> }) => { calls.updates.push(data); return { ...action, ...data }; },
    },
    project: { findUnique: async () => ({ updatedAt: now }) },
    plot: { findMany: async () => [], create: async () => { calls.plots += 1; return { id: 'plot1' }; } },
    foreshadowing: { findMany: async () => [], create: async () => { calls.foreshadowings += 1; return { id: 'foreshadow1' }; } },
    storyFact: { findMany: async () => [] }, characterKnowledge: { findMany: async () => [] },
    chapter: { findMany: async () => [{ id: 'c1' }] },
  };
  return { calls, database: { $transaction: async (callback: (tx: unknown) => unknown) => callback(transaction) } as unknown as typeof realDb };
}

test('applies an approved Plot once and stores provenance entity id', async () => {
  const { database, calls } = fakeDatabase();
  const result = await applyPromotionAction('p1', 'a1', database);
  assert.equal(calls.plots, 1); assert.equal(calls.foreshadowings, 0);
  assert.equal(result.status, 'applied'); assert.equal(result.createdEntityId, 'plot1');
  assert.deepEqual(calls.findWhere, { id: 'a1', projectId: 'p1' });
});

test('losing the atomic applying claim cannot create a duplicate', async () => {
  const { database, calls } = fakeDatabase({ claimCount: 0 });
  await assert.rejects(() => applyPromotionAction('p1', 'a1', database));
  assert.equal(calls.plots, 0); assert.equal(calls.foreshadowings, 0);
});

test('an applied action is idempotent and creates no duplicate', async () => {
  const { database, calls } = fakeDatabase({ status: 'applied', createdEntityId: 'plot1' });
  const result = await applyPromotionAction('p1', 'a1', database);
  assert.equal(calls.plots, 0); assert.equal(result.createdEntityId, 'plot1');
});

test('draft, rejected and changed sources cannot write targets', async () => {
  for (const status of ['draft', 'rejected']) {
    const { database, calls } = fakeDatabase({ status });
    await assert.rejects(() => applyPromotionAction('p1', 'a1', database)); assert.equal(calls.plots, 0);
  }
  const changed = { ...proposal, summary: '変更後' };
  const { database, calls } = fakeDatabase({ sourceProposal: changed });
  const result = await applyPromotionAction('p1', 'a1', database);
  assert.equal(result.status, 'stale'); assert.equal(calls.plots, 0);
});

test('changed or no-longer-accepted Observation becomes stale', async () => {
  const sourceChapter = { id: 'c1', order: 0, title: '始まり', outlineContent: '', summary: '', content: '鍵が置かれた' };
  const observation = { id: 'observation1', runId: 'explore1', sourceChapterId: 'c1', sourceExcerpt: '鍵が置かれた', elementSummary: '鍵', decisionStatus: 'accepted', updatedAt: now, run: { projectId: 'p1', sourceManifest: '{}' }, sourceChapter };
  for (const changed of [{ ...observation, decisionStatus: 'undecided' }, { ...observation, sourceChapter: { ...sourceChapter, content: '本文が変更された' } }]) {
    const { database, calls } = fakeDatabase({ sourceType: 'navigator_observation', sourceProposal: null, sourceObservation: changed, sourceProposalId: null, sourceObservationId: 'observation1', sourceSnapshot: observationSnapshot(observation) });
    const result = await applyPromotionAction('p1', 'a1', database);
    assert.equal(result.status, 'stale'); assert.equal(calls.plots, 0);
  }
});

test('creates Foreshadowing only after approval and validates its chapter', async () => {
  const payload = { chapterId: 'c1', content: '過去描写を今後再利用する', expectedResolveChapter: 8, status: 'planted', importance: 'medium' };
  const { database, calls } = fakeDatabase({ targetType: 'foreshadowing', proposedPayload: JSON.stringify(payload) });
  const result = await applyPromotionAction('p1', 'a1', database);
  assert.equal(calls.foreshadowings, 1); assert.equal(result.createdEntityId, 'foreshadow1');
});

function draftDatabase(source: Record<string, unknown> | null) {
  const created: Array<Record<string, unknown>> = [];
  return { created, database: {
    chapter: { findMany: async () => [{ id: 'c1', order: 0, title: '始まり' }] },
    storyNavigatorProposal: { findFirst: async () => source },
    storyNavigatorObservation: { findFirst: async () => source },
    project: { findUniqueOrThrow: async () => ({ updatedAt: now }) },
    plot: { findMany: async () => [] }, foreshadowing: { findMany: async () => [] }, storyFact: { findMany: async () => [] }, characterKnowledge: { findMany: async () => [] },
    storyNavigatorPromotionAction: { create: ({ data }: { data: Record<string, unknown> }) => Promise.resolve(created.push(data) && data) },
    $transaction: async (values: Array<Promise<unknown>>) => Promise.all(values),
  } as unknown as typeof realDb };
}

test('creates drafts only from accepted same-project sources without target writes', async () => {
  const accepted = { ...proposal, whyPossible: '成立する', preparation: '[]', affectedEntities: '[]' };
  const { database, created } = draftDatabase(accepted);
  const result = await createPromotionDraft({ projectId: 'p1', sourceType: 'navigator_proposal', sourceId: 'source1' }, { database, complete: async () => '{"schemaVersion":1,"actions":[{"targetType":"plot","operation":"create","reason":"計画化","payload":{"name":"新計画","description":"","plotType":"main","priority":0,"status":"planned","tags":[],"order":0}}]}' });
  assert.equal(result.length, 1); assert.equal(created[0].status, 'draft'); assert.equal(created[0].sourceProposalId, 'source1');
  for (const decisionStatus of ['undecided', 'held', 'rejected']) {
    const refused = draftDatabase({ ...accepted, decisionStatus });
    await assert.rejects(() => createPromotionDraft({ projectId: 'p1', sourceType: 'navigator_proposal', sourceId: 'source1' }, { database: refused.database, complete: async () => '' }));
    assert.equal(refused.created.length, 0);
  }
  const crossProject = draftDatabase(null);
  await assert.rejects(() => createPromotionDraft({ projectId: 'other', sourceType: 'navigator_proposal', sourceId: 'source1' }, { database: crossProject.database, complete: async () => '' }));
});

test('marks a draft stale when StoryFact or CharacterKnowledge changed', async () => {
  for (const changed of ['storyFact', 'characterKnowledge'] as const) {
    const { database, calls } = fakeDatabase();
    const transaction = database as unknown as { $transaction: (callback: (tx: Record<string, unknown>) => unknown) => unknown };
    const original = transaction.$transaction;
    transaction.$transaction = callback => original((tx: unknown) => {
      const mutable = tx as { storyFact: { findMany: () => Promise<unknown[]> }; characterKnowledge: { findMany: () => Promise<unknown[]> } };
      mutable[changed].findMany = async () => [{ id: 'changed', updatedAt: now }];
      return callback(tx as Record<string, unknown>);
    });
    const result = await applyPromotionAction('p1', 'a1', database);
    assert.equal(result.status, 'stale'); assert.equal(calls.plots, 0);
  }
});
