import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import {
  appendStoryMeaningDecision,
  buildChapterMeaningContext,
  completeStoryMeaningRun,
  getLatestFreshStoryMeaningRun,
  getLatestStoryMeaningDecisions,
  getLatestStoryMeaningRun,
  markStoryMeaningRunFailed,
  startStoryMeaningRun,
  StoryMeaningPersistenceError,
  StoryMeaningValidationError,
} from './index.js';

function context(content = '「帰る」😀', factContent = '真実') {
  return buildChapterMeaningContext({
    project: { id: 'p1', title: '作品', authorIntent: '静かな決意' },
    chapter: { id: 'ch1', projectId: 'p1', order: 1, title: '第一章', content, povCharacterId: 'char1' },
    characters: [{ id: 'char1', name: '葵' }],
    facts: [{ id: 'fact1', content: factContent, readerState: 'reader_hidden' }],
  });
}

function output(content = '「帰る」') {
  return { schemaVersion: 1, events: [{
    localEventKey: 'event1', summary: '帰る決意',
    evidence: [{ localEvidenceKey: 'evidence1', chapterId: 'ch1', startOffset: 0, endOffset: content.length, exactExcerpt: content, evidenceType: 'primary' }],
    actorRefs: [{ type: 'character', id: 'char1' }],
    claims: [{
      localClaimKey: 'claim1', layer: 'derived', dimension: 'decision_commitment', statement: '帰る決意を表明した。',
      supportLevel: 'strongly_supported', evidenceRefs: ['evidence1'], relatedEntityRefs: [{ type: 'story_fact', id: 'fact1' }], impactScope: 'chapter',
    }],
  }] };
}

function fakeDatabase() {
  type Row = Record<string, unknown>;
  const state = {
    chapters: [{ id: 'ch1', projectId: 'p1', content: '「帰る」😀' }],
    runs: [] as Row[], events: [] as Row[], claims: [] as Row[], decisions: [] as Row[],
    entities: {
      character: new Set(['char1', 'char2']), story_fact: new Set(['fact1']), relationship: new Set<string>(), plot: new Set<string>(), foreshadowing: new Set<string>(),
    },
    failEventCreate: false,
  };
  let sequence = 0;
  const now = () => new Date(1_700_000_000_000 + sequence++);
  const expandedRun = (run: Row) => ({ ...run, events: state.events.filter(event => event.runId === run.id).map(event => ({
    ...event,
    claims: state.claims.filter(claim => claim.eventId === event.id).map(claim => ({ ...claim, decisions: state.decisions.filter(decision => decision.claimId === claim.id).reverse() })),
  })) });
  const runMatches = (run: Row, where: Row) => Object.entries(where).every(([key, value]) => typeof value === 'object' ? true : run[key] === value);
  const repository = {
    chapter: { findFirst: async ({ where }: { where: Row }) => state.chapters.find(value => value.id === where.id && value.projectId === where.projectId) || null },
    storyMeaningAnalysisRun: {
      create: async ({ data }: { data: Row }) => { const value = { id: `run${sequence}`, createdAt: now(), updatedAt: now(), completedAt: null, error: '', ...data }; state.runs.push(value); return value; },
      findFirst: async ({ where, include }: { where: Row; include?: Row }) => {
        const values = state.runs.filter(run => runMatches(run, where)).sort((a, b) => String(b.id).localeCompare(String(a.id)));
        const value = values[0];
        if (!value) return null;
        if (include && 'chapter' in include) return { ...value, chapter: state.chapters.find(chapter => chapter.id === value.chapterId) };
        return expandedRun(value);
      },
      findMany: async ({ where }: { where: Row }) => state.runs.filter(run => runMatches(run, where)).sort((a, b) => String(b.id).localeCompare(String(a.id))).map(expandedRun),
      findUniqueOrThrow: async ({ where }: { where: Row }) => expandedRun(state.runs.find(run => run.id === where.id)!),
      update: async ({ where, data }: { where: Row; data: Row }) => { const value = state.runs.find(run => run.id === where.id)!; Object.assign(value, data, { updatedAt: now() }); return value; },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => { const values = state.runs.filter(run => runMatches(run, where)); values.forEach(value => Object.assign(value, data)); return { count: values.length }; },
    },
    storyMeaningEvent: { create: async ({ data }: { data: Row & { claims: { create: Row[] } } }) => {
      if (state.failEventCreate) throw new Error('event insert failed');
      const { claims, ...eventData } = data; const event = { id: `event${sequence++}`, createdAt: now(), ...eventData }; state.events.push(event);
      claims.create.forEach(claim => state.claims.push({ id: `claim${sequence++}`, eventId: event.id, createdAt: now(), ...claim })); return event;
    } },
    storyMeaningClaim: { findFirst: async ({ where }: { where: Row }) => {
      const claim = state.claims.find(value => value.id === where.id); if (!claim) return null;
      const event = state.events.find(value => value.id === claim.eventId)!; const run = state.runs.find(value => value.id === event.runId)!;
      return run.projectId === (where.event as { run: { projectId: string } }).run.projectId ? { ...claim, event: { ...event, run } } : null;
    } },
    storyMeaningDecision: {
      create: async ({ data }: { data: Row }) => { const value = { id: `decision${sequence++}`, createdAt: now(), ...data }; state.decisions.push(value); return value; },
      findMany: async ({ where }: { where: { claim: { event: { run: { projectId: string; chapterId: string } } } } }) => state.decisions.filter(decision => {
        const claim = state.claims.find(value => value.id === decision.claimId)!; const event = state.events.find(value => value.id === claim.eventId)!; const run = state.runs.find(value => value.id === event.runId)!;
        return run.projectId === where.claim.event.run.projectId && run.chapterId === where.claim.event.run.chapterId;
      }).reverse().map(decision => ({ ...decision, claim: state.claims.find(value => value.id === decision.claimId) })),
    },
    character: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter(id => state.entities.character.has(id)).map(id => ({ id })) },
    storyFact: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter(id => state.entities.story_fact.has(id)).map(id => ({ id })) },
    characterRelationship: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter(id => state.entities.relationship.has(id)).map(id => ({ id })) },
    plot: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter(id => state.entities.plot.has(id)).map(id => ({ id })) },
    foreshadowing: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter(id => state.entities.foreshadowing.has(id)).map(id => ({ id })) },
  };
  const database = {
    ...repository,
    $transaction: async (callback: (value: typeof repository) => unknown) => {
      const snapshot = { runs: structuredClone(state.runs), events: structuredClone(state.events), claims: structuredClone(state.claims), decisions: structuredClone(state.decisions) };
      try { return await callback(repository); } catch (error) { state.runs = snapshot.runs; state.events = snapshot.events; state.claims = snapshot.claims; state.decisions = snapshot.decisions; throw error; }
    },
  } as unknown as PrismaClient;
  return { database, state };
}

test('validated output persists atomically with AI provenance and raw Unicode evidence', async () => {
  const { database, state } = fakeDatabase();
  const run = await startStoryMeaningRun({ projectId: 'p1', chapterId: 'ch1', context: context() }, database);
  const completed = await completeStoryMeaningRun({ projectId: 'p1', runId: run.id, output: output() }, database);
  assert.equal(state.runs[0].status, 'completed');
  assert.equal(state.events.length, 1); assert.match(String(state.events[0].evidenceJson), /「帰る」/);
  assert.equal(state.claims[0].provenance, 'ai_analysis'); assert.equal(String(state.claims[0].claimFingerprint).length, 64);
  assert.equal((completed as { events: unknown[] }).events.length, 1);
});

test('invalid output and entity IDs absent from the supplied context are rejected before transaction writes', async () => {
  const { database, state } = fakeDatabase();
  const run = await startStoryMeaningRun({ projectId: 'p1', chapterId: 'ch1', context: context() }, database);
  const invalid = output(); invalid.events[0].evidence[0].exactExcerpt = '不一致';
  await assert.rejects(completeStoryMeaningRun({ projectId: 'p1', runId: run.id, output: invalid }, database));
  assert.equal(state.events.length, 0); assert.equal(state.runs[0].status, 'pending');
  const unpresented = output(); unpresented.events[0].actorRefs[0].id = 'char2';
  await assert.rejects(completeStoryMeaningRun({ projectId: 'p1', runId: run.id, output: unpresented }, database), (error: unknown) => error instanceof StoryMeaningValidationError && error.code === 'unknown_entity');
  const cross = output(); cross.events[0].actorRefs[0].id = 'other-project-character';
  await assert.rejects(completeStoryMeaningRun({ projectId: 'p1', runId: run.id, output: cross }, database), (error: unknown) => error instanceof StoryMeaningValidationError && error.code === 'unknown_entity');
  assert.equal(state.events.length, 0);

  const poisonedContext = buildChapterMeaningContext({
    project: { id: 'p1', title: '作品' },
    chapter: { id: 'ch1', projectId: 'p1', order: 1, title: '第一章', content: '「帰る」😀' },
    characters: [{ id: 'other-project-character', name: '別Project人物' }],
    facts: [{ id: 'fact1', content: '真実', readerState: 'reader_hidden' }],
  });
  const poisonedRun = await startStoryMeaningRun({ projectId: 'p1', chapterId: 'ch1', context: poisonedContext }, database);
  await assert.rejects(completeStoryMeaningRun({ projectId: 'p1', runId: poisonedRun.id, output: cross }, database), (error: unknown) => error instanceof StoryMeaningPersistenceError && error.code === 'ownership');
  assert.equal(state.events.length, 0);
});

test('transaction failure leaves no partial completed run', async () => {
  const { database, state } = fakeDatabase(); state.failEventCreate = true;
  const run = await startStoryMeaningRun({ projectId: 'p1', chapterId: 'ch1', context: context() }, database);
  await assert.rejects(completeStoryMeaningRun({ projectId: 'p1', runId: run.id, output: output() }, database), /event insert failed/);
  assert.equal(state.events.length, 0); assert.equal(state.claims.length, 0); assert.equal(state.runs[0].status, 'pending');
});

test('failed lifecycle keeps bounded error and rejects cross-project run mutation', async () => {
  const { database, state } = fakeDatabase();
  const run = await startStoryMeaningRun({ projectId: 'p1', chapterId: 'ch1', context: context() }, database);
  await markStoryMeaningRunFailed({ projectId: 'p1', runId: run.id, error: new Error('失敗'.repeat(3000)) }, database);
  assert.equal(state.runs[0].status, 'failed'); assert.equal(String(state.runs[0].error).length, 4000);
  await assert.rejects(markStoryMeaningRunFailed({ projectId: 'other', runId: run.id, error: 'x' }, database));
});

test('latest and latest fresh differ without deleting historical runs', async () => {
  const { database, state } = fakeDatabase();
  const oldContext = context(); const run = await startStoryMeaningRun({ projectId: 'p1', chapterId: 'ch1', context: oldContext }, database);
  await completeStoryMeaningRun({ projectId: 'p1', runId: run.id, output: output() }, database);
  assert.equal((await getLatestStoryMeaningRun('p1', 'ch1', oldContext, database) as { fresh: boolean }).fresh, true);
  const changedContext = context('「帰る」😀', '変更された真実');
  assert.equal((await getLatestStoryMeaningRun('p1', 'ch1', changedContext, database) as { fresh: boolean }).fresh, false);
  assert.equal(await getLatestFreshStoryMeaningRun('p1', 'ch1', changedContext, database), null);
  state.runs[0].promptVersion = 'chapter-meaning-ja-v0';
  assert.equal(await getLatestFreshStoryMeaningRun('p1', 'ch1', oldContext, database), null);
  assert.equal(state.runs.length, 1);
});

test('decisions append, derive latest, and never auto-carry across freshness boundary', async () => {
  const { database, state } = fakeDatabase(); const current = context();
  const run = await startStoryMeaningRun({ projectId: 'p1', chapterId: 'ch1', context: current }, database);
  await completeStoryMeaningRun({ projectId: 'p1', runId: run.id, output: output() }, database);
  const claimId = String(state.claims[0].id);
  await appendStoryMeaningDecision({ projectId: 'p1', claimId, decision: 'adopted' }, database);
  await appendStoryMeaningDecision({ projectId: 'p1', claimId, decision: 'alternative', authorInterpretation: '別の読み' }, database);
  assert.equal(state.decisions.length, 2); assert.equal(state.claims[0].provenance, 'ai_analysis');
  const latest = await getLatestStoryMeaningDecisions('p1', 'ch1', current, database);
  assert.equal(latest[0].decision, 'alternative'); assert.equal(latest[0].fresh, true);
  const changed = context('「帰る」😀', '変更された真実');
  assert.equal((await getLatestStoryMeaningDecisions('p1', 'ch1', changed, database))[0].fresh, false);
  assert.equal(state.decisions.length, 2, 'historical decisions remain stored');
});
