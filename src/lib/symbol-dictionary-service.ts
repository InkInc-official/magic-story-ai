import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import {
  buildConfirmedOccurrencePersistence,
  buildSymbolOccurrenceBrowser,
  SymbolOccurrenceSelectionError,
  type SymbolDefinition,
  type SymbolOccurrenceOverrideStatus,
  type SymbolUsageRule,
  validateSymbolDefinitions,
  validateSymbolUsageRules,
} from '@/lib/symbol-dictionary';

export class SymbolDictionaryServiceError extends Error {
  constructor(public code: 'validation' | 'not_found' | 'cross_project' | 'conflict' | 'in_use' | 'stale_range', message: string) {
    super(message);
  }
}

type DefinitionRow = Omit<SymbolDefinition, 'defaultUsageRuleId'> & { defaultUsageRuleId: string | null };
type UsageRow = Omit<SymbolUsageRule, 'semanticKind' | 'speakerMode' | 'provenance'> & {
  semanticKind: string;
  speakerMode: string;
  provenance: string;
};

const definitionDomain = (value: DefinitionRow): SymbolDefinition => ({
  id: value.id, projectId: value.projectId, openSymbol: value.openSymbol, closeSymbol: value.closeSymbol,
  label: value.label, active: value.active, order: value.order, defaultUsageRuleId: value.defaultUsageRuleId,
});

const usageDomain = (value: UsageRow): SymbolUsageRule => ({
  id: value.id, projectId: value.projectId, definitionId: value.definitionId, label: value.label,
  description: value.description, semanticKind: value.semanticKind as SymbolUsageRule['semanticKind'],
  countsAsDialogue: value.countsAsDialogue, countsAsNarration: value.countsAsNarration,
  countsAsInnerVoice: value.countsAsInnerVoice, readerVisible: value.readerVisible, spokenAloud: value.spokenAloud,
  speakerMode: value.speakerMode as SymbolUsageRule['speakerMode'], fixedSpeakerId: value.fixedSpeakerId,
  priority: value.priority, active: value.active, provenance: value.provenance as SymbolUsageRule['provenance'],
});

function failIssues(issues: { message: string }[]) {
  if (issues.length) throw new SymbolDictionaryServiceError('validation', issues.map(value => value.message).join(' '));
}

function stringValue(value: unknown, field: string, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string') throw new SymbolDictionaryServiceError('validation', `${field}が不正です。`);
  return value;
}

function integerValue(value: unknown, field: string, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isInteger(value)) throw new SymbolDictionaryServiceError('validation', `${field}は整数で指定してください。`);
  return value as number;
}

function booleanValue(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new SymbolDictionaryServiceError('validation', `${field}が不正です。`);
  return value;
}

function nullableBoolean(value: unknown, field: string): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') throw new SymbolDictionaryServiceError('validation', `${field}が不正です。`);
  return value;
}

async function requireProject(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new SymbolDictionaryServiceError('not_found', 'Projectが見つかりません。');
}

async function projectDefinitions(projectId: string) {
  return (await db.projectSymbolDefinition.findMany({ where: { projectId } })).map(definitionDomain);
}

export async function listSymbolDictionary(projectId: string) {
  await requireProject(projectId);
  return db.projectSymbolDefinition.findMany({
    where: { projectId }, include: { usageRules: { include: { fixedSpeaker: { select: { id: true, name: true } } }, orderBy: [{ priority: 'desc' }, { id: 'asc' }] } },
    orderBy: [{ order: 'asc' }, { openSymbol: 'asc' }, { closeSymbol: 'asc' }, { id: 'asc' }],
  });
}

export async function createSymbolDefinition(input: Record<string, unknown>) {
  const projectId = stringValue(input.projectId, 'projectId');
  await requireProject(projectId);
  const candidate: SymbolDefinition = {
    id: '__new__', projectId, openSymbol: stringValue(input.openSymbol, 'openSymbol'),
    closeSymbol: stringValue(input.closeSymbol, 'closeSymbol'), label: stringValue(input.label, 'label'),
    active: booleanValue(input.active, 'active', true), order: integerValue(input.order, 'order', 0), defaultUsageRuleId: null,
  };
  failIssues(validateSymbolDefinitions([...(await projectDefinitions(projectId)), candidate]));
  try {
    return await db.projectSymbolDefinition.create({ data: {
      projectId, openSymbol: candidate.openSymbol, closeSymbol: candidate.closeSymbol,
      label: candidate.label.trim(), active: candidate.active, order: candidate.order,
    } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new SymbolDictionaryServiceError('conflict', '同じ記号対はすでに登録されています。');
    throw error;
  }
}

export async function updateSymbolDefinition(input: Record<string, unknown>) {
  const id = stringValue(input.id, 'id'); const projectId = stringValue(input.projectId, 'projectId');
  const existing = await db.projectSymbolDefinition.findFirst({ where: { id, projectId } });
  if (!existing) throw new SymbolDictionaryServiceError('not_found', 'Definitionが見つかりません。');
  if ((input.openSymbol !== undefined && input.openSymbol !== existing.openSymbol) || (input.closeSymbol !== undefined && input.closeSymbol !== existing.closeSymbol)) {
    throw new SymbolDictionaryServiceError('conflict', '記号対は作成後に変更できません。無効化して新しく作成してください。');
  }
  const candidate = definitionDomain({ ...existing,
    label: input.label === undefined ? existing.label : stringValue(input.label, 'label'),
    active: booleanValue(input.active, 'active', existing.active),
    order: input.order === undefined ? existing.order : integerValue(input.order, 'order'),
  });
  const others = (await projectDefinitions(projectId)).filter(value => value.id !== id);
  failIssues(validateSymbolDefinitions([...others, candidate]));
  return db.projectSymbolDefinition.update({ where: { id }, data: { label: candidate.label.trim(), active: candidate.active, order: candidate.order } });
}

export async function deleteSymbolDefinition(projectId: string, id: string) {
  const existing = await db.projectSymbolDefinition.findFirst({ where: { id, projectId }, select: { id: true, _count: { select: { usageRules: true, overrides: true } } } });
  if (!existing) throw new SymbolDictionaryServiceError('not_found', 'Definitionが見つかりません。');
  if (existing._count.usageRules || existing._count.overrides) throw new SymbolDictionaryServiceError('in_use', 'Usage RuleまたはOverrideから参照されているDefinitionは削除できません。');
  await db.projectSymbolDefinition.delete({ where: { id } });
}

export async function createSymbolUsageRule(input: Record<string, unknown>) {
  const projectId = stringValue(input.projectId, 'projectId'); const definitionId = stringValue(input.definitionId, 'definitionId');
  const definition = await db.projectSymbolDefinition.findFirst({ where: { id: definitionId, projectId } });
  if (!definition) throw new SymbolDictionaryServiceError('cross_project', 'Definitionは同じProjectから指定してください。');
  const provenance = stringValue(input.provenance, 'provenance', 'author');
  const candidate: SymbolUsageRule = {
    id: '__new__', projectId, definitionId, label: stringValue(input.label, 'label'), description: stringValue(input.description, 'description', ''),
    semanticKind: stringValue(input.semanticKind, 'semanticKind') as SymbolUsageRule['semanticKind'],
    countsAsDialogue: nullableBoolean(input.countsAsDialogue, 'countsAsDialogue'), countsAsNarration: nullableBoolean(input.countsAsNarration, 'countsAsNarration'),
    countsAsInnerVoice: nullableBoolean(input.countsAsInnerVoice, 'countsAsInnerVoice'), readerVisible: nullableBoolean(input.readerVisible, 'readerVisible'),
    spokenAloud: nullableBoolean(input.spokenAloud, 'spokenAloud'), speakerMode: stringValue(input.speakerMode, 'speakerMode', 'unknown') as SymbolUsageRule['speakerMode'],
    fixedSpeakerId: input.fixedSpeakerId === undefined || input.fixedSpeakerId === null ? null : stringValue(input.fixedSpeakerId, 'fixedSpeakerId'),
    priority: integerValue(input.priority, 'priority', 0), active: booleanValue(input.active, 'active', true), provenance: provenance as SymbolUsageRule['provenance'],
  };
  failIssues(validateSymbolUsageRules([candidate]));
  if (candidate.fixedSpeakerId && !await db.character.findFirst({ where: { id: candidate.fixedSpeakerId, projectId }, select: { id: true } })) {
    throw new SymbolDictionaryServiceError('cross_project', '固定話者は同じProjectから指定してください。');
  }
  return db.symbolUsageRule.create({ data: {
    projectId, definitionId, label: candidate.label.trim(), description: candidate.description,
    semanticKind: candidate.semanticKind, countsAsDialogue: candidate.countsAsDialogue,
    countsAsNarration: candidate.countsAsNarration, countsAsInnerVoice: candidate.countsAsInnerVoice,
    readerVisible: candidate.readerVisible, spokenAloud: candidate.spokenAloud,
    speakerMode: candidate.speakerMode, fixedSpeakerId: candidate.fixedSpeakerId,
    priority: candidate.priority, active: candidate.active, provenance: candidate.provenance,
  } });
}

export async function updateSymbolUsageRule(input: Record<string, unknown>) {
  const id = stringValue(input.id, 'id'); const projectId = stringValue(input.projectId, 'projectId');
  const existing = await db.symbolUsageRule.findFirst({ where: { id, projectId } });
  if (!existing) throw new SymbolDictionaryServiceError('not_found', 'Usage Ruleが見つかりません。');
  if (input.definitionId !== undefined && input.definitionId !== existing.definitionId) throw new SymbolDictionaryServiceError('conflict', 'Usage RuleのDefinitionは変更できません。');
  if (input.provenance !== undefined && input.provenance !== existing.provenance) throw new SymbolDictionaryServiceError('conflict', 'provenanceは作成後に変更できません。');
  const merged = usageDomain({ ...existing,
    label: input.label === undefined ? existing.label : stringValue(input.label, 'label'),
    description: input.description === undefined ? existing.description : stringValue(input.description, 'description'),
    semanticKind: input.semanticKind === undefined ? existing.semanticKind : stringValue(input.semanticKind, 'semanticKind'),
    countsAsDialogue: input.countsAsDialogue === undefined ? existing.countsAsDialogue : nullableBoolean(input.countsAsDialogue, 'countsAsDialogue'),
    countsAsNarration: input.countsAsNarration === undefined ? existing.countsAsNarration : nullableBoolean(input.countsAsNarration, 'countsAsNarration'),
    countsAsInnerVoice: input.countsAsInnerVoice === undefined ? existing.countsAsInnerVoice : nullableBoolean(input.countsAsInnerVoice, 'countsAsInnerVoice'),
    readerVisible: input.readerVisible === undefined ? existing.readerVisible : nullableBoolean(input.readerVisible, 'readerVisible'),
    spokenAloud: input.spokenAloud === undefined ? existing.spokenAloud : nullableBoolean(input.spokenAloud, 'spokenAloud'),
    speakerMode: input.speakerMode === undefined ? existing.speakerMode : stringValue(input.speakerMode, 'speakerMode'),
    fixedSpeakerId: input.fixedSpeakerId === undefined ? existing.fixedSpeakerId : input.fixedSpeakerId === null ? null : stringValue(input.fixedSpeakerId, 'fixedSpeakerId'),
    priority: input.priority === undefined ? existing.priority : integerValue(input.priority, 'priority'),
    active: booleanValue(input.active, 'active', existing.active),
  } as UsageRow);
  failIssues(validateSymbolUsageRules([merged]));
  if (merged.fixedSpeakerId && !await db.character.findFirst({ where: { id: merged.fixedSpeakerId, projectId }, select: { id: true } })) throw new SymbolDictionaryServiceError('cross_project', '固定話者は同じProjectから指定してください。');
  if (!merged.active) {
    const isDefault = await db.projectSymbolDefinition.findFirst({ where: { id: existing.definitionId, defaultUsageRuleId: id }, select: { id: true } });
    if (isDefault) throw new SymbolDictionaryServiceError('conflict', 'defaultのUsage Ruleは先にdefaultを解除してください。');
  }
  return db.symbolUsageRule.update({ where: { id }, data: {
    label: merged.label.trim(), description: merged.description, semanticKind: merged.semanticKind,
    countsAsDialogue: merged.countsAsDialogue, countsAsNarration: merged.countsAsNarration, countsAsInnerVoice: merged.countsAsInnerVoice,
    readerVisible: merged.readerVisible, spokenAloud: merged.spokenAloud, speakerMode: merged.speakerMode,
    fixedSpeakerId: merged.fixedSpeakerId, priority: merged.priority, active: merged.active,
  } });
}

export async function setDefaultSymbolUsage(projectId: string, definitionId: string, usageRuleId: string | null) {
  return db.$transaction(async transaction => {
    const definition = await transaction.projectSymbolDefinition.findFirst({ where: { id: definitionId, projectId } });
    if (!definition) throw new SymbolDictionaryServiceError('not_found', 'Definitionが見つかりません。');
    if (usageRuleId) {
      const rule = await transaction.symbolUsageRule.findFirst({ where: { id: usageRuleId, projectId, definitionId, active: true } });
      if (!rule) throw new SymbolDictionaryServiceError('cross_project', 'defaultには同じDefinitionのactive Usage Ruleを指定してください。');
    }
    return transaction.projectSymbolDefinition.update({ where: { id: definitionId }, data: { defaultUsageRuleId: usageRuleId } });
  });
}

export async function deleteSymbolUsageRule(projectId: string, id: string) {
  const existing = await db.symbolUsageRule.findFirst({ where: { id, projectId }, select: { id: true, _count: { select: { overrides: true, defaultForDefinitions: true } } } });
  if (!existing) throw new SymbolDictionaryServiceError('not_found', 'Usage Ruleが見つかりません。');
  if (existing._count.overrides || existing._count.defaultForDefinitions) throw new SymbolDictionaryServiceError('in_use', 'defaultまたはOverrideから参照されているUsage Ruleは削除できません。');
  await db.symbolUsageRule.delete({ where: { id } });
}

export async function listSymbolOccurrenceOverrides(projectId: string, chapterId: string) {
  const chapter = await db.chapter.findFirst({ where: { id: chapterId, projectId }, select: { id: true } });
  if (!chapter) throw new SymbolDictionaryServiceError('cross_project', 'Chapterは同じProjectから指定してください。');
  return db.symbolOccurrenceOverride.findMany({ where: { projectId, chapterId }, orderBy: [{ startOffset: 'asc' }, { endOffset: 'asc' }, { id: 'asc' }] });
}

export async function analyzeChapterSymbolOccurrences(projectId: string, chapterId: string) {
  const [chapter, definitions, overrides] = await Promise.all([
    db.chapter.findFirst({ where: { id: chapterId, projectId }, select: { id: true, title: true, order: true, content: true } }),
    db.projectSymbolDefinition.findMany({ where: { projectId }, include: { usageRules: { orderBy: [{ priority: 'desc' }, { id: 'asc' }] } }, orderBy: [{ order: 'asc' }, { id: 'asc' }] }),
    db.symbolOccurrenceOverride.findMany({ where: { projectId, chapterId }, orderBy: [{ startOffset: 'asc' }, { endOffset: 'asc' }, { id: 'asc' }] }),
  ]);
  if (!chapter) throw new SymbolDictionaryServiceError('cross_project', 'Chapterは同じProjectから指定してください。');
  const domainDefinitions = definitions.map(definitionDomain);
  const result = buildSymbolOccurrenceBrowser({ projectId, chapterId, content: chapter.content, definitions: domainDefinitions,
    usageRules: definitions.flatMap(value => value.usageRules).map(usageDomain),
    overrides: overrides.map(value => ({ ...value, status: value.status as SymbolOccurrenceOverrideStatus })) });
  const persistedDefinitions = new Map(definitions.map(value => [value.id, value]));
  return { chapter: { id: chapter.id, title: chapter.title, order: chapter.order }, definitions, ...result,
    items: result.items.map(item => ({ ...item, definition: item.definition ? persistedDefinitions.get(item.definition.id) || null : null })) };
}

export async function createSymbolOccurrenceOverride(input: Record<string, unknown>) {
  const projectId = stringValue(input.projectId, 'projectId'); const chapterId = stringValue(input.chapterId, 'chapterId');
  const definitionId = stringValue(input.definitionId, 'definitionId'); const usageRuleId = stringValue(input.usageRuleId, 'usageRuleId');
  const startOffset = integerValue(input.startOffset, 'startOffset'); const endOffset = integerValue(input.endOffset, 'endOffset');
  const [chapter, definition, rule, definitions] = await Promise.all([
    db.chapter.findFirst({ where: { id: chapterId, projectId }, select: { id: true, content: true } }),
    db.projectSymbolDefinition.findFirst({ where: { id: definitionId, projectId, active: true } }),
    db.symbolUsageRule.findFirst({ where: { id: usageRuleId, projectId, definitionId, active: true } }),
    db.projectSymbolDefinition.findMany({ where: { projectId } }),
  ]);
  if (!chapter) throw new SymbolDictionaryServiceError('cross_project', 'Chapterは同じProjectから指定してください。');
  if (!definition) throw new SymbolDictionaryServiceError('cross_project', 'Definitionは同じProjectのactiveな値を指定してください。');
  if (!rule) throw new SymbolDictionaryServiceError('cross_project', 'Usage Ruleは同じDefinitionのactiveな値を指定してください。');
  const domainDefinitions = definitions.map(definitionDomain);
  let anchor;
  try {
    anchor = buildConfirmedOccurrencePersistence({ projectId, chapterId, content: chapter.content,
      definitions: domainDefinitions, definition: definitionDomain(definition), usageRule: usageDomain(rule), startOffset, endOffset }).anchor;
  } catch (error) {
    if (error instanceof SymbolOccurrenceSelectionError) throw new SymbolDictionaryServiceError('stale_range', error.message);
    throw error;
  }
  try {
    return await db.symbolOccurrenceOverride.create({ data: {
      projectId, chapterId, definitionId, usageRuleId, status: 'confirmed', startOffset, endOffset,
      exactExcerpt: anchor.exactExcerpt, anchorBefore: anchor.anchorBefore, anchorAfter: anchor.anchorAfter,
      contentHash: anchor.contentHash, anchorFingerprint: anchor.anchorFingerprint,
    } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new SymbolDictionaryServiceError('conflict', 'このRegionにはすでにOverrideがあります。');
    throw error;
  }
}

export async function updateSymbolOccurrenceOverride(input: Record<string, unknown>) {
  const projectId = stringValue(input.projectId, 'projectId'); const id = stringValue(input.id, 'id');
  const usageRuleId = stringValue(input.usageRuleId, 'usageRuleId');
  const startOffset = integerValue(input.startOffset, 'startOffset'); const endOffset = integerValue(input.endOffset, 'endOffset');
  try {
    return await db.$transaction(async transaction => {
    const existing = await transaction.symbolOccurrenceOverride.findFirst({ where: { id, projectId } });
    if (!existing) throw new SymbolDictionaryServiceError('not_found', 'Overrideが見つかりません。');
    const [chapter, definition, rule, definitions] = await Promise.all([
      transaction.chapter.findFirst({ where: { id: existing.chapterId, projectId }, select: { id: true, content: true } }),
      transaction.projectSymbolDefinition.findFirst({ where: { id: existing.definitionId, projectId, active: true } }),
      transaction.symbolUsageRule.findFirst({ where: { id: usageRuleId, projectId, definitionId: existing.definitionId, active: true } }),
      transaction.projectSymbolDefinition.findMany({ where: { projectId } }),
    ]);
    if (!chapter || !definition || !rule) throw new SymbolDictionaryServiceError('cross_project', 'Chapter・Definition・Usage Ruleの有効な同一Project参照が必要です。');
    let anchor;
    try {
      anchor = buildConfirmedOccurrencePersistence({ projectId, chapterId: chapter.id, content: chapter.content,
        definitions: definitions.map(definitionDomain), definition: definitionDomain(definition), usageRule: usageDomain(rule), startOffset, endOffset }).anchor;
    } catch (error) {
      if (error instanceof SymbolOccurrenceSelectionError) throw new SymbolDictionaryServiceError('stale_range', error.message);
      throw error;
    }
      return transaction.symbolOccurrenceOverride.update({ where: { id }, data: { usageRuleId, status: 'confirmed', startOffset, endOffset,
        exactExcerpt: anchor.exactExcerpt, anchorBefore: anchor.anchorBefore, anchorAfter: anchor.anchorAfter,
        contentHash: anchor.contentHash, anchorFingerprint: anchor.anchorFingerprint } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new SymbolDictionaryServiceError('conflict', 'このRegionにはすでにOverrideがあります。');
    throw error;
  }
}

export async function deleteSymbolOccurrenceOverride(projectId: string, id: string) {
  const result = await db.symbolOccurrenceOverride.deleteMany({ where: { id, projectId } });
  if (!result.count) throw new SymbolDictionaryServiceError('not_found', 'Overrideが見つかりません。');
}

export function symbolServiceErrorStatus(error: unknown): number {
  if (!(error instanceof SymbolDictionaryServiceError)) return 500;
  if (error.code === 'not_found') return 404;
  if (error.code === 'conflict' || error.code === 'in_use') return 409;
  return 400;
}
