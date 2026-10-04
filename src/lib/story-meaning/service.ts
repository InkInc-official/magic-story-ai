import { db } from '../db';
import {
  STORY_MEANING_CONTEXT_VERSION,
  type ChapterMeaningAnalysisOutput,
  type ChapterMeaningContext,
  type MeaningEntityType,
} from './types';
import { validateChapterMeaningAnalysisOutput } from './validation';
import {
  buildStoryMeaningClaimFingerprint,
  buildStoryMeaningSourceManifest,
  STORY_MEANING_DECISIONS,
  STORY_MEANING_PROMPT_VERSION,
  storyMeaningDecisionIsFresh,
  storyMeaningRunIsFresh,
  type StoryMeaningDecisionValue,
} from './persistence';

export class StoryMeaningPersistenceError extends Error {
  constructor(public readonly code: 'not_found' | 'ownership' | 'invalid_state' | 'invalid_input', message: string) {
    super(message);
    this.name = 'StoryMeaningPersistenceError';
  }
}

type MeaningDatabase = typeof db;
const runInclude = {
  events: {
    orderBy: [{ order: 'asc' as const }, { id: 'asc' as const }],
    include: {
      claims: {
        orderBy: [{ order: 'asc' as const }, { id: 'asc' as const }],
        include: { decisions: { orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }] } },
      },
    },
  },
};

function currentFreshness(context: ChapterMeaningContext) {
  return { contentHash: context.contentHash, contextFingerprint: context.contextFingerprint, fingerprintVersion: context.version, promptVersion: STORY_MEANING_PROMPT_VERSION };
}

function parseJson(value: string, fallback: unknown) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function presentedEntityIds(sourceManifest: string): Partial<Record<MeaningEntityType, ReadonlySet<string>>> {
  const manifest = parseJson(sourceManifest, null);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new StoryMeaningPersistenceError('invalid_input', 'RunのSource Manifestが不正です。');
  const sources = (manifest as { sources?: unknown }).sources;
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) throw new StoryMeaningPersistenceError('invalid_input', 'RunのSource Manifestにsource一覧がありません。');
  const record = sources as Record<string, unknown>;
  const ids = (key: string) => new Set(Array.isArray(record[key]) ? record[key].filter((value): value is string => typeof value === 'string') : []);
  return {
    character: new Set([...ids('characterIds'), ...ids('castCharacterIds')]),
    story_fact: ids('storyFactIds'),
    relationship: ids('relationshipIds'),
    plot: ids('plotIds'),
    foreshadowing: ids('foreshadowingIds'),
  };
}

function publicRun(run: Record<string, unknown>, context?: ChapterMeaningContext) {
  const events = Array.isArray(run.events) ? run.events as Array<Record<string, unknown>> : [];
  return {
    ...run,
    sourceManifest: parseJson(String(run.sourceManifest || '{}'), {}),
    fresh: context ? storyMeaningRunIsFresh(run as never, currentFreshness(context)) : undefined,
    events: events.map(event => ({
      ...event,
      evidence: parseJson(String(event.evidenceJson || '[]'), []),
      actorRefs: parseJson(String(event.actorRefsJson || '[]'), []),
      evidenceJson: undefined,
      actorRefsJson: undefined,
      claims: (Array.isArray(event.claims) ? event.claims as Array<Record<string, unknown>> : []).map(claim => ({
        ...claim,
        evidenceRefs: parseJson(String(claim.evidenceRefsJson || '[]'), []),
        relatedEntityRefs: parseJson(String(claim.relatedEntityRefsJson || '[]'), []),
        evidenceRefsJson: undefined,
        relatedEntityRefsJson: undefined,
        decisionHistory: (Array.isArray(claim.decisions) ? claim.decisions as Array<Record<string, unknown>> : []).map(decision => ({
          id: decision.id,
          decision: decision.decision,
          authorInterpretation: decision.authorInterpretation,
          createdAt: decision.createdAt,
          fresh: context ? storyMeaningDecisionIsFresh(decision as never, claim as never, currentFreshness(context)) : undefined,
        })),
        decisions: undefined,
        latestDecision: Array.isArray(claim.decisions) && claim.decisions[0]
          ? { ...(claim.decisions[0] as Record<string, unknown>), fresh: context ? storyMeaningDecisionIsFresh(claim.decisions[0] as never, claim as never, currentFreshness(context)) : undefined }
          : null,
      })),
    })),
  };
}

async function ownedChapter(database: MeaningDatabase, projectId: string, chapterId: string) {
  const chapter = await database.chapter.findFirst({ where: { id: chapterId, projectId }, select: { id: true, content: true } });
  if (!chapter) throw new StoryMeaningPersistenceError('ownership', 'Chapterが見つからないかProject境界が不正です。');
  return chapter;
}

export async function startStoryMeaningRun(
  input: { projectId: string; chapterId: string; context: ChapterMeaningContext; promptVersion?: string; sourceManifest?: unknown },
  database: MeaningDatabase = db,
) {
  const chapter = await ownedChapter(database, input.projectId, input.chapterId);
  if (input.context.targetChapterId !== chapter.id || input.context.targetChapterText !== chapter.content) {
    throw new StoryMeaningPersistenceError('invalid_input', 'Meaning Contextと現在のChapter本文が一致しません。');
  }
  return database.storyMeaningAnalysisRun.create({ data: {
    projectId: input.projectId,
    chapterId: input.chapterId,
    contentHash: input.context.contentHash,
    contextFingerprint: input.context.contextFingerprint,
    fingerprintVersion: STORY_MEANING_CONTEXT_VERSION,
    promptVersion: input.promptVersion || STORY_MEANING_PROMPT_VERSION,
    sourceManifest: JSON.stringify(input.sourceManifest || buildStoryMeaningSourceManifest(input.context)),
    status: 'pending',
  } });
}

function entityIds(output: ChapterMeaningAnalysisOutput) {
  const values = new Map<MeaningEntityType, Set<string>>();
  for (const event of output.events) for (const ref of [...event.actorRefs, ...event.claims.flatMap(claim => claim.relatedEntityRefs)]) {
    const ids = values.get(ref.type) || new Set<string>();
    ids.add(ref.id);
    values.set(ref.type, ids);
  }
  return values;
}

async function assertEntityOwnership(database: MeaningDatabase, projectId: string, output: ChapterMeaningAnalysisOutput) {
  const ids = entityIds(output);
  const requested = (type: MeaningEntityType) => [...(ids.get(type) || [])];
  const [characters, facts, relationships, plots, foreshadowings] = await Promise.all([
    database.character.findMany({ where: { projectId, id: { in: requested('character') } }, select: { id: true } }),
    database.storyFact.findMany({ where: { projectId, id: { in: requested('story_fact') } }, select: { id: true } }),
    database.characterRelationship.findMany({ where: { projectId, id: { in: requested('relationship') } }, select: { id: true } }),
    database.plot.findMany({ where: { projectId, id: { in: requested('plot') } }, select: { id: true } }),
    database.foreshadowing.findMany({ where: { projectId, id: { in: requested('foreshadowing') } }, select: { id: true } }),
  ]);
  const found = new Map<MeaningEntityType, Set<string>>([
    ['character', new Set(characters.map(value => value.id))],
    ['story_fact', new Set(facts.map(value => value.id))],
    ['relationship', new Set(relationships.map(value => value.id))],
    ['plot', new Set(plots.map(value => value.id))],
    ['foreshadowing', new Set(foreshadowings.map(value => value.id))],
  ]);
  for (const [type, requestedIds] of ids) for (const id of requestedIds) {
    if (!found.get(type)?.has(id)) throw new StoryMeaningPersistenceError('ownership', `Project外または存在しないentity参照です: ${type}/${id}`);
  }
}

export async function completeStoryMeaningRun(
  input: { projectId: string; runId: string; output: unknown },
  database: MeaningDatabase = db,
) {
  const run = await database.storyMeaningAnalysisRun.findFirst({
    where: { id: input.runId, projectId: input.projectId },
    include: { chapter: { select: { id: true, projectId: true, content: true } } },
  });
  if (!run) throw new StoryMeaningPersistenceError('ownership', 'Runが見つからないかProject境界が不正です。');
  if (run.chapter.projectId !== input.projectId) throw new StoryMeaningPersistenceError('ownership', 'RunとChapterのProject境界が不正です。');
  if (run.status !== 'pending') throw new StoryMeaningPersistenceError('invalid_state', 'pending Runだけを完了できます。');
  const output = validateChapterMeaningAnalysisOutput(input.output, run.chapter, {
    knownEntityIds: presentedEntityIds(run.sourceManifest),
  });
  await assertEntityOwnership(database, input.projectId, output);
  return database.$transaction(async transaction => {
    const claimed = await transaction.storyMeaningAnalysisRun.updateMany({
      where: { id: run.id, projectId: input.projectId, status: 'pending' },
      data: { status: 'completed', error: '', completedAt: new Date() },
    });
    if (claimed.count !== 1) throw new StoryMeaningPersistenceError('invalid_state', 'Run状態が変更されています。');
    for (const [eventOrder, event] of output.events.entries()) {
      await transaction.storyMeaningEvent.create({ data: {
        runId: run.id,
        localEventKey: event.localEventKey,
        order: eventOrder,
        summary: event.summary,
        evidenceJson: JSON.stringify(event.evidence),
        actorRefsJson: JSON.stringify(event.actorRefs),
        claims: { create: event.claims.map((claim, claimOrder) => ({
          localClaimKey: claim.localClaimKey,
          order: claimOrder,
          layer: claim.layer,
          dimension: claim.dimension,
          statement: claim.statement,
          supportLevel: claim.supportLevel,
          impactScope: claim.impactScope || null,
          subtype: claim.subtype || null,
          evidenceRefsJson: JSON.stringify(claim.evidenceRefs),
          relatedEntityRefsJson: JSON.stringify(claim.relatedEntityRefs),
          provenance: 'ai_analysis',
          claimFingerprint: buildStoryMeaningClaimFingerprint(claim, event.evidence),
        })) },
      } });
    }
    return transaction.storyMeaningAnalysisRun.findUniqueOrThrow({ where: { id: run.id }, include: runInclude });
  }).then(value => publicRun(value as unknown as Record<string, unknown>));
}

export async function markStoryMeaningRunFailed(
  input: { projectId: string; runId: string; error: unknown },
  database: MeaningDatabase = db,
) {
  const message = (input.error instanceof Error ? input.error.message : String(input.error || 'Unknown meaning analysis error')).slice(0, 4000);
  const result = await database.storyMeaningAnalysisRun.updateMany({
    where: { id: input.runId, projectId: input.projectId, status: 'pending' },
    data: { status: 'failed', error: message, completedAt: new Date() },
  });
  if (result.count !== 1) throw new StoryMeaningPersistenceError('ownership', 'pending Runが見つからないかProject境界が不正です。');
}

export async function listStoryMeaningRuns(
  projectId: string,
  chapterId: string,
  context?: ChapterMeaningContext,
  database: MeaningDatabase = db,
  limit = 20,
) {
  await ownedChapter(database, projectId, chapterId);
  const runs = await database.storyMeaningAnalysisRun.findMany({
    where: { projectId, chapterId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: runInclude, take: Math.min(Math.max(limit, 1), 50),
  });
  return runs.map(run => publicRun(run as unknown as Record<string, unknown>, context));
}

export async function getLatestStoryMeaningRun(projectId: string, chapterId: string, context: ChapterMeaningContext, database: MeaningDatabase = db) {
  await ownedChapter(database, projectId, chapterId);
  const run = await database.storyMeaningAnalysisRun.findFirst({
    where: { projectId, chapterId, status: 'completed' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: runInclude,
  });
  return run ? publicRun(run as unknown as Record<string, unknown>, context) : null;
}

export async function getLatestFreshStoryMeaningRun(projectId: string, chapterId: string, context: ChapterMeaningContext, database: MeaningDatabase = db) {
  await ownedChapter(database, projectId, chapterId);
  const run = await database.storyMeaningAnalysisRun.findFirst({
    where: {
      projectId, chapterId, status: 'completed',
      contentHash: context.contentHash, contextFingerprint: context.contextFingerprint, fingerprintVersion: STORY_MEANING_CONTEXT_VERSION, promptVersion: STORY_MEANING_PROMPT_VERSION,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: runInclude,
  });
  return run ? publicRun(run as unknown as Record<string, unknown>, context) : null;
}

export async function getPendingStoryMeaningRun(projectId: string, chapterId: string, context: ChapterMeaningContext, database: MeaningDatabase = db) {
  await ownedChapter(database, projectId, chapterId);
  const run = await database.storyMeaningAnalysisRun.findFirst({
    where: {
      projectId, chapterId, status: 'pending', contentHash: context.contentHash,
      contextFingerprint: context.contextFingerprint, fingerprintVersion: STORY_MEANING_CONTEXT_VERSION,
      promptVersion: STORY_MEANING_PROMPT_VERSION,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return run ? publicRun(run as unknown as Record<string, unknown>, context) : null;
}

export async function appendStoryMeaningDecision(
  input: { projectId: string; chapterId?: string; runId?: string; claimId: string; decision: StoryMeaningDecisionValue; authorInterpretation?: string },
  database: MeaningDatabase = db,
) {
  const authorInterpretation = input.authorInterpretation || '';
  if (!STORY_MEANING_DECISIONS.includes(input.decision) || typeof authorInterpretation !== 'string' || authorInterpretation.length > 4000
    || (input.decision === 'alternative' && !authorInterpretation.trim())
    || (input.decision !== 'alternative' && authorInterpretation.trim())) {
    throw new StoryMeaningPersistenceError('invalid_input', '作者判断または解釈が不正です。');
  }
  const claim = await database.storyMeaningClaim.findFirst({
    where: { id: input.claimId, event: { run: {
      projectId: input.projectId,
      ...(input.chapterId && { chapterId: input.chapterId }),
      ...(input.runId && { id: input.runId }),
    } } },
    include: { event: { include: { run: { select: { contentHash: true, contextFingerprint: true, fingerprintVersion: true } } } } },
  });
  if (!claim) throw new StoryMeaningPersistenceError('ownership', 'Claimが見つからないかProject境界が不正です。');
  return database.storyMeaningDecision.create({ data: {
    claimId: claim.id,
    claimFingerprint: claim.claimFingerprint,
    decision: input.decision,
    authorInterpretation,
    decidedAgainstContentHash: claim.event.run.contentHash,
    decidedAgainstContextFingerprint: claim.event.run.contextFingerprint,
    fingerprintVersion: claim.event.run.fingerprintVersion,
  } });
}

export async function getLatestStoryMeaningDecisions(
  projectId: string,
  chapterId: string,
  context: ChapterMeaningContext,
  database: MeaningDatabase = db,
) {
  await ownedChapter(database, projectId, chapterId);
  const decisions = await database.storyMeaningDecision.findMany({
    where: { claim: { event: { run: { projectId, chapterId } } } },
    include: { claim: { select: { id: true, claimFingerprint: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const latest = new Map<string, typeof decisions[number]>();
  decisions.forEach(decision => { if (!latest.has(decision.claimId)) latest.set(decision.claimId, decision); });
  return [...latest.values()].map(decision => ({
    ...decision,
    fresh: storyMeaningDecisionIsFresh(decision, decision.claim, currentFreshness(context)),
  }));
}
