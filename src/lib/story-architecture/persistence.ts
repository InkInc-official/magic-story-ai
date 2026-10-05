import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';
import {
  STORY_ARCHITECTURE_CANON_MODES,
  STORY_ARCHITECTURE_DECISIONS,
  STORY_ARCHITECTURE_DESIGN_STATUSES,
  STORY_ARCHITECTURE_FRAMEWORK_MODES,
  STORY_ARCHITECTURE_ITEM_TYPES,
  type StoryArchitecture,
  type StoryArchitectureItemType,
} from './types';
import { validateStoryArchitecture } from './validation';
import { reorderIntegerPositions } from './ordering';
import { asStoryArchitectureInput, assertOnlyKeys, designStatusForDecision, StoryArchitecturePersistenceError } from './request';

export { assertOnlyKeys, StoryArchitecturePersistenceError } from './request';

type Database = PrismaClient | Prisma.TransactionClient;
type Input = Record<string, unknown>;
type EntityType = StoryArchitectureItemType | 'relation';

const aggregateInclude = {
  threads: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
  beats: { orderBy: [{ storyOrder: 'asc' }, { createdAt: 'asc' }] },
  constraints: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
  questions: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
  relations: { orderBy: { createdAt: 'asc' } },
  decisions: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
} satisfies Prisma.StoryArchitectureInclude;

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new StoryArchitecturePersistenceError(400, `${name} is required`);
  return value;
}
function optionalString(value: unknown, fallback = ''): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new StoryArchitecturePersistenceError(400, '文字列が必要です。');
  return value;
}
function nullableString(value: unknown, fallback: string | null = null): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'string') throw new StoryArchitecturePersistenceError(400, '文字列またはnullが必要です。');
  return value;
}
function integer(value: unknown, fallback: number | null = null): number | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new StoryArchitecturePersistenceError(400, '0以上の整数が必要です。');
  return value as number;
}
function enumValue<T extends string>(value: unknown, values: readonly T[], name: string, fallback?: T): T {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== 'string' || !values.includes(candidate as T)) throw new StoryArchitecturePersistenceError(400, `${name}が不正です。`);
  return candidate as T;
}

function toDomain(row: any): StoryArchitecture {
  return validateStoryArchitecture({
    id: row.id, projectId: row.projectId, title: row.title, frameworkMode: row.frameworkMode,
    customFrameworkNotes: row.customFrameworkNotes, canonMode: row.canonMode, notes: row.notes, revision: row.revision,
    threads: row.threads.map(({ proposalRunId: _run, createdAt: _created, updatedAt: _updated, ...item }: any) => item),
    beats: row.beats.map(({ proposalRunId: _run, createdAt: _created, updatedAt: _updated, ...item }: any) => item),
    constraints: row.constraints.map(({ proposalRunId: _run, createdAt: _created, updatedAt: _updated, ...item }: any) => item),
    questions: row.questions.map(({ proposalRunId: _run, createdAt: _created, updatedAt: _updated, ...item }: any) => item),
    relations: row.relations.map(({ createdAt: _created, ...item }: any) => item),
    decisions: row.decisions.map(({ projectId: _project, proposalRunId: _run, createdAt: _created, ...item }: any) => item),
  } as StoryArchitecture);
}

async function load(database: Database, projectId: string, architectureId?: string) {
  const row = await database.storyArchitecture.findFirst({
    where: { projectId, ...(architectureId ? { id: architectureId } : {}) }, include: aggregateInclude,
  });
  if (!row) throw new StoryArchitecturePersistenceError(404, 'Story Architectureが見つかりません。');
  return { row, domain: toDomain(row) };
}

export async function getStoryArchitecture(projectId: string, database: Database = db) {
  const row = await database.storyArchitecture.findUnique({ where: { projectId }, include: aggregateInclude });
  return row ? toDomain(row) : null;
}

export async function createStoryArchitecture(value: unknown, database: PrismaClient = db) {
  const input = assertOnlyKeys(value, ['projectId', 'title', 'frameworkMode', 'customFrameworkNotes', 'canonMode', 'notes']);
  const projectId = requiredString(input.projectId, 'projectId');
  const candidate: StoryArchitecture = {
    id: randomUUID(), projectId, title: requiredString(input.title, 'title'),
    frameworkMode: enumValue(input.frameworkMode, STORY_ARCHITECTURE_FRAMEWORK_MODES, 'frameworkMode', 'freeform'),
    customFrameworkNotes: optionalString(input.customFrameworkNotes),
    canonMode: enumValue(input.canonMode, STORY_ARCHITECTURE_CANON_MODES, 'canonMode', 'respect_current_canon'),
    notes: optionalString(input.notes), revision: 1, threads: [], beats: [], constraints: [], questions: [], relations: [], decisions: [],
  };
  validateStoryArchitecture(candidate);
  return database.$transaction(async tx => {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new StoryArchitecturePersistenceError(404, 'Projectが見つかりません。');
    if (await tx.storyArchitecture.findUnique({ where: { projectId }, select: { id: true } })) throw new StoryArchitecturePersistenceError(409, 'Projectには既にStory Architectureがあります。');
    await tx.storyArchitecture.create({ data: { ...candidate, threads: undefined, beats: undefined, constraints: undefined, questions: undefined, relations: undefined, decisions: undefined } as any });
    return (await load(tx, projectId)).domain;
  });
}

export async function updateStoryArchitecture(value: unknown, database: PrismaClient = db) {
  const input = assertOnlyKeys(value, ['projectId', 'id', 'expectedRevision', 'title', 'frameworkMode', 'customFrameworkNotes', 'canonMode', 'notes']);
  const projectId = requiredString(input.projectId, 'projectId'); const id = requiredString(input.id, 'id');
  const expectedRevision = integer(input.expectedRevision);
  if (expectedRevision === null || expectedRevision < 1) throw new StoryArchitecturePersistenceError(400, 'expectedRevisionが必要です。');
  return database.$transaction(async tx => {
    const { domain } = await load(tx, projectId, id);
    const candidate = validateStoryArchitecture({ ...domain,
      ...(input.title !== undefined && { title: optionalString(input.title) }),
      ...(input.frameworkMode !== undefined && { frameworkMode: enumValue(input.frameworkMode, STORY_ARCHITECTURE_FRAMEWORK_MODES, 'frameworkMode') }),
      ...(input.customFrameworkNotes !== undefined && { customFrameworkNotes: optionalString(input.customFrameworkNotes) }),
      ...(input.canonMode !== undefined && { canonMode: enumValue(input.canonMode, STORY_ARCHITECTURE_CANON_MODES, 'canonMode') }),
      ...(input.notes !== undefined && { notes: optionalString(input.notes) }), revision: expectedRevision + 1,
    });
    const result = await tx.storyArchitecture.updateMany({ where: { id, projectId, revision: expectedRevision }, data: {
      title: candidate.title, frameworkMode: candidate.frameworkMode, customFrameworkNotes: candidate.customFrameworkNotes,
      canonMode: candidate.canonMode, notes: candidate.notes, revision: { increment: 1 },
    } });
    if (!result.count) throw new StoryArchitecturePersistenceError(409, 'revisionが競合しました。再読込してください。');
    return (await load(tx, projectId, id)).domain;
  });
}

const allowedByType: Record<EntityType, readonly string[]> = {
  thread: ['projectId','architectureId','itemType','title','description','threadType','customTypeLabel','status','order'],
  beat: ['projectId','architectureId','itemType','threadId','chapterId','title','summary','intention','storyOrder','presentationOrder','rhythm','customRhythmLabel','status'],
  constraint: ['projectId','architectureId','itemType','title','statement','mode','scope','threadId','beatId','status','order'],
  question: ['projectId','architectureId','itemType','question','notes','state','resolution','scope','threadId','beatId','status','order'],
  relation: ['projectId','architectureId','itemType','fromBeatId','toBeatId','type'],
};

function authorStatus(value: unknown) {
  const status = enumValue(value, STORY_ARCHITECTURE_DESIGN_STATUSES, 'status', 'draft');
  if (status === 'proposed') throw new StoryArchitecturePersistenceError(400, 'proposedはAI提案専用です。');
  return status;
}

function makeItem(input: Input, type: EntityType, architectureId: string): any {
  const base = { id: randomUUID(), architectureId, status: authorStatus(input.status), provenance: 'author', revision: 1 };
  if (type === 'thread') return { ...base, title: requiredString(input.title,'title'), description: optionalString(input.description), threadType: requiredString(input.threadType,'threadType'), customTypeLabel: nullableString(input.customTypeLabel), order: integer(input.order,0) };
  if (type === 'beat') return { ...base, threadId: nullableString(input.threadId), chapterId: nullableString(input.chapterId), title: requiredString(input.title,'title'), summary: optionalString(input.summary), intention: optionalString(input.intention), storyOrder: integer(input.storyOrder), presentationOrder: integer(input.presentationOrder), rhythm: nullableString(input.rhythm), customRhythmLabel: nullableString(input.customRhythmLabel) };
  if (type === 'constraint') return { ...base, title: requiredString(input.title,'title'), statement: requiredString(input.statement,'statement'), mode: requiredString(input.mode,'mode'), scope: requiredString(input.scope,'scope'), threadId: nullableString(input.threadId), beatId: nullableString(input.beatId), order: integer(input.order,0) };
  if (type === 'question') return { ...base, question: requiredString(input.question,'question'), notes: optionalString(input.notes), state: optionalString(input.state,'open'), resolution: nullableString(input.resolution), scope: requiredString(input.scope,'scope'), threadId: nullableString(input.threadId), beatId: nullableString(input.beatId), order: integer(input.order,0) };
  return { id: randomUUID(), architectureId, fromBeatId: requiredString(input.fromBeatId,'fromBeatId'), toBeatId: requiredString(input.toBeatId,'toBeatId'), type: requiredString(input.type,'type') };
}

const collection: Record<EntityType, keyof StoryArchitecture> = { thread:'threads', beat:'beats', constraint:'constraints', question:'questions', relation:'relations' };
const delegate = (database: any, type: EntityType) => database[`storyArchitecture${type === 'relation' ? 'BeatRelation' : type[0].toUpperCase() + type.slice(1)}`];

async function assertBeatChapter(database: Database, projectId: string, chapterId: string | null) {
  if (chapterId && !await database.chapter.findFirst({ where: { id: chapterId, projectId }, select: { id: true } })) throw new StoryArchitecturePersistenceError(400, 'Chapterは同じProjectから指定してください。');
}

export async function createStoryArchitectureItem(value: unknown, database: PrismaClient = db) {
  const seed = asStoryArchitectureInput(value); const type = requiredString(seed.itemType,'itemType') as EntityType;
  if (!Object.hasOwn(allowedByType, type)) throw new StoryArchitecturePersistenceError(400, 'itemTypeが不正です。');
  const input = assertOnlyKeys(seed, allowedByType[type]);
  const projectId = requiredString(input.projectId,'projectId'); const architectureId = requiredString(input.architectureId,'architectureId');
  return database.$transaction(async tx => {
    const { domain } = await load(tx, projectId, architectureId); const item = makeItem(input, type, architectureId);
    if (type === 'beat') await assertBeatChapter(tx, projectId, item.chapterId);
    const candidate = { ...domain, [collection[type]]: [...(domain[collection[type]] as any[]), item] } as StoryArchitecture;
    validateStoryArchitecture(candidate);
    await delegate(tx, type).create({ data: type === 'relation' ? item : { ...item, proposalRunId: null } });
    return item;
  });
}

export async function updateStoryArchitectureItem(value: unknown, database: PrismaClient = db) {
  const seed = asStoryArchitectureInput(value); const type = requiredString(seed.itemType,'itemType') as EntityType;
  if (type === 'relation') throw new StoryArchitecturePersistenceError(400, 'Relationは削除後に再作成してください。');
  if (!Object.hasOwn(allowedByType, type)) throw new StoryArchitecturePersistenceError(400, 'itemTypeが不正です。');
  const input = assertOnlyKeys(seed, [...allowedByType[type], 'id', 'expectedRevision']);
  const projectId = requiredString(input.projectId,'projectId'); const architectureId = requiredString(input.architectureId,'architectureId'); const id = requiredString(input.id,'id');
  const expectedRevision = integer(input.expectedRevision); if (!expectedRevision || expectedRevision < 1) throw new StoryArchitecturePersistenceError(400,'expectedRevisionが必要です。');
  return database.$transaction(async tx => {
    const { domain } = await load(tx, projectId, architectureId); const items = domain[collection[type]] as any[];
    const previous = items.find(item => item.id === id); if (!previous) throw new StoryArchitecturePersistenceError(404,'Itemが見つかりません。');
    if (previous.provenance !== 'author') throw new StoryArchitecturePersistenceError(409,'AI提案・import項目は作者CRUDで変更できません。');
    const patch = makeItem({ ...previous, ...input }, type, architectureId); const item = { ...previous, ...patch, id, revision: expectedRevision + 1 };
    validateStoryArchitecture({ ...domain, [collection[type]]: items.map(current => current.id === id ? item : current) } as StoryArchitecture);
    if (type === 'beat') await assertBeatChapter(tx, projectId, item.chapterId);
    const { id: _id, architectureId: _architecture, provenance: _provenance, revision: _revision, ...data } = item;
    const result = await delegate(tx,type).updateMany({ where: { id, architectureId, provenance:'author', proposalRunId:null, revision: expectedRevision }, data: { ...data, revision: { increment: 1 } } });
    if (!result.count) throw new StoryArchitecturePersistenceError(409,'revisionが競合しました。再読込してください。');
    return item;
  });
}

export async function deleteStoryArchitectureItem(projectId: string, architectureId: string, type: EntityType, id: string, database: PrismaClient = db) {
  if (!Object.hasOwn(allowedByType,type)) throw new StoryArchitecturePersistenceError(400,'itemTypeが不正です。');
  return database.$transaction(async tx => {
    await load(tx, projectId, architectureId);
    if (type === 'thread') {
      const count = await tx.storyArchitectureConstraint.count({ where:{ architectureId, threadId:id } }) + await tx.storyArchitectureQuestion.count({ where:{ architectureId, threadId:id } });
      if (count) throw new StoryArchitecturePersistenceError(409,'参照中のThreadは削除できません。');
    }
    if (type === 'beat') {
      const counts = await Promise.all([tx.storyArchitectureConstraint.count({where:{architectureId,beatId:id}}),tx.storyArchitectureQuestion.count({where:{architectureId,beatId:id}}),tx.storyArchitectureBeatRelation.count({where:{architectureId,OR:[{fromBeatId:id},{toBeatId:id}]}})]);
      if (counts.some(Boolean)) throw new StoryArchitecturePersistenceError(409,'参照中のBeatは削除できません。');
    }
    if (type !== 'relation') {
      const existing = await delegate(tx,type).findFirst({ where:{id,architectureId}, select:{provenance:true} });
      if (!existing) throw new StoryArchitecturePersistenceError(404,'Itemが見つかりません。');
      if (existing.provenance !== 'author') throw new StoryArchitecturePersistenceError(409,'AI提案・import項目は作者CRUDで削除できません。');
    }
    const result = await delegate(tx,type).deleteMany({ where:{id,architectureId} });
    if (!result.count) throw new StoryArchitecturePersistenceError(404,'Itemが見つかりません。');
    return { success:true };
  });
}

export async function reorderStoryArchitectureItems(value: unknown, database: PrismaClient = db) {
  const input=assertOnlyKeys(value,['projectId','architectureId','itemType','orderedIds']);
  const projectId=requiredString(input.projectId,'projectId'), architectureId=requiredString(input.architectureId,'architectureId');
  const type=requiredString(input.itemType,'itemType') as 'thread'|'constraint'|'question';
  if (!['thread','constraint','question'].includes(type)) throw new StoryArchitecturePersistenceError(400,'並び替え可能なitemTypeではありません。');
  if (!Array.isArray(input.orderedIds) || !input.orderedIds.every(id=>typeof id==='string')) throw new StoryArchitecturePersistenceError(400,'orderedIdsはID配列で指定してください。');
  return database.$transaction(async tx=>{
    const {domain}=await load(tx,projectId,architectureId); const items=(domain[collection[type]] as any[]).filter(item=>item.provenance==='author');
    let reordered: any[];
    try { reordered=reorderIntegerPositions(items,input.orderedIds as string[]); }
    catch (error) { throw new StoryArchitecturePersistenceError(400,error instanceof Error ? error.message : '並び順が不正です。'); }
    const candidate={...domain,[collection[type]]:(domain[collection[type]] as any[]).map(item=>reordered.find(next=>next.id===item.id) ?? item)} as StoryArchitecture;
    validateStoryArchitecture(candidate);
    await Promise.all(reordered.map(item=>delegate(tx,type).update({where:{id:item.id},data:{order:item.order,revision:{increment:1}}})));
    return reordered.map(({id,order,revision})=>({id,order,revision:revision+1}));
  });
}

export async function createStoryArchitectureProposalRun(input: {
  projectId:string; architectureId:string; request?:string; canonMode:'respect_current_canon'|'revise_canon'; scopeType?:string|null; scopeId?:string|null;
}, database: PrismaClient = db) {
  await load(database,input.projectId,input.architectureId);
  return database.storyArchitectureProposalRun.create({ data:{ ...input, request:input.request ?? '', scopeType:input.scopeType ?? null, scopeId:input.scopeId ?? null, contextVersion:null, promptVersion:null, contextFingerprint:null, sourceManifest:null, status:'pending' } });
}

export async function appendStoryArchitectureDecision(value: unknown, database: PrismaClient = db) {
  const input = assertOnlyKeys(value,['projectId','architectureId','itemType','itemId','decision','note']);
  const projectId=requiredString(input.projectId,'projectId'), architectureId=requiredString(input.architectureId,'architectureId');
  const itemType=enumValue(input.itemType,STORY_ARCHITECTURE_ITEM_TYPES,'itemType'), itemId=requiredString(input.itemId,'itemId');
  const decision=enumValue(input.decision,STORY_ARCHITECTURE_DECISIONS,'decision'); const note=optionalString(input.note);
  return database.$transaction(async tx => {
    await load(tx,projectId,architectureId); const item=await delegate(tx,itemType).findFirst({where:{id:itemId,architectureId}});
    if (!item) throw new StoryArchitecturePersistenceError(404,'Decision対象が見つかりません。');
    if (item.provenance !== 'ai_proposal' || !item.proposalRunId) throw new StoryArchitecturePersistenceError(409,'DecisionはAI提案項目にのみ追加できます。');
    const status = designStatusForDecision(decision);
    const created=await tx.storyArchitectureDecision.create({data:{projectId,architectureId,proposalRunId:item.proposalRunId,itemType,itemId,decision,note}});
    await delegate(tx,itemType).update({where:{id:itemId},data:{status,revision:{increment:1}}});
    return { id:created.id, architectureId, itemType, itemId, decision, note, createdAt:created.createdAt.toISOString() };
  });
}

export async function listStoryArchitectureDecisions(projectId:string, architectureId:string, database:Database=db) {
  await load(database,projectId,architectureId);
  const rows=await database.storyArchitectureDecision.findMany({where:{projectId,architectureId},orderBy:[{createdAt:'desc'},{id:'desc'}]});
  return rows.map(({projectId:_project,proposalRunId:_run,...row})=>({...row,createdAt:row.createdAt.toISOString()}));
}
