import { createHash } from 'node:crypto';
import { buildInspectorTextStructure } from './inspector-text-structure';
import { scanPairedSymbolRegions } from './japanese-text';
import { buildInspectorSymbolSemantics, inspectorSymbolContextEntry, type InspectorSymbolSources } from './inspector-symbol-semantics';
import { buildRuntimeSymbolPairDefinitions } from './symbol-dictionary/runtime-definitions';
import { resolveNarrativeRoles, resolveProjectNarrativeRules, type NarrativeRuleValue, type NarratorValue } from './narrative-foundation';
import { buildContextWithinBudget, safeContextExcerpt, type ContextBudgetResult, type ContextEntry } from './prompts/ja/context-budget';

export const INSPECTOR_CONTEXT_BUILDER_VERSION = '4b2-v1';
export const INSPECTOR_CONTEXT_HARD_CAP = 14_000;
const MAX_INSPECTED_TEXT = 7_000;
const SURROUNDING_WINDOW = 900;

export interface InspectorCharacter {
  id: string; projectId: string; name: string; firstPerson?: string; defaultSecondPerson?: string;
  speechRegister?: string; speechStyleNotes?: string; narrationVoiceNotes?: string; updatedAt?: Date | string;
}
export interface InspectorRelationship {
  id: string; projectId: string; fromCharacterId: string; toCharacterId: string; type: string;
  addressTerm?: string; speechRegister?: string; speechStyleNotes?: string;
}
export interface InspectorCast { chapterId: string; characterId: string; participation: string; notes?: string; order: number }
export interface InspectorChapterRef { id: string; projectId?: string; order: number; title?: string }
export interface InspectorStoryFact {
  id: string; projectId: string; content: string; importance: string; readerInitiallyKnows: boolean;
  plannedRevealChapterId?: string | null; revealedChapterId?: string | null; notes?: string; updatedAt?: Date | string;
  plannedRevealChapter?: InspectorChapterRef | null; revealedChapter?: InspectorChapterRef | null;
}
export interface InspectorKnowledgeEvent {
  id: string; factId: string; characterId: string; status: string; effectiveChapterId?: string | null;
  beliefNotes?: string; notes?: string; updatedAt?: Date | string; effectiveChapter?: InspectorChapterRef | null;
}
export interface InspectorSources {
  project: { id: string; narrativePerspective?: string | null; defaultPovCharacterId?: string | null; defaultNarratorId?: string | null };
  chapter: { id: string; projectId: string; order: number; title: string; content: string; povCharacterId?: string | null; narratorId?: string | null; updatedAt?: Date | string | null };
  characters: InspectorCharacter[];
  narrators: NarratorValue[];
  cast: InspectorCast[];
  narrativeRules: Array<NarrativeRuleValue & { updatedAt?: Date | string }>;
  storyFacts: InspectorStoryFact[];
  characterKnowledge: InspectorKnowledgeEvent[];
  relationships: InspectorRelationship[];
  symbolDictionary?: InspectorSymbolSources;
}

export type ReaderKnowledgePhase = 'known_before' | 'revealed_during' | 'hidden_at_start' | 'future_reveal';

export interface ReaderKnowledgeResolution {
  phase: ReaderKnowledgePhase;
  knownBeforeChapter: boolean;
  revealedDuringChapter: boolean;
  hiddenAtChapterStart: boolean;
  futureReveal: boolean;
  plannedDuringChapter: boolean;
}

export function resolveReaderKnowledgeAtChapter(fact: InspectorStoryFact, chapterId: string, chapterOrder: number): ReaderKnowledgeResolution {
  const actualOrder = fact.revealedChapter?.order;
  const plannedOrder = fact.plannedRevealChapter?.order;
  if (fact.readerInitiallyKnows || (typeof actualOrder === 'number' && actualOrder < chapterOrder)) {
    return { phase: 'known_before', knownBeforeChapter: true, revealedDuringChapter: false, hiddenAtChapterStart: false, futureReveal: false, plannedDuringChapter: false };
  }
  if (fact.revealedChapterId === chapterId || actualOrder === chapterOrder) {
    return { phase: 'revealed_during', knownBeforeChapter: false, revealedDuringChapter: true, hiddenAtChapterStart: true, futureReveal: false, plannedDuringChapter: fact.plannedRevealChapterId === chapterId };
  }
  const future = (typeof actualOrder === 'number' && actualOrder > chapterOrder)
    || (!fact.revealedChapterId && typeof plannedOrder === 'number' && plannedOrder > chapterOrder);
  if (future) return { phase: 'future_reveal', knownBeforeChapter: false, revealedDuringChapter: false, hiddenAtChapterStart: true, futureReveal: true, plannedDuringChapter: false };
  return { phase: 'hidden_at_start', knownBeforeChapter: false, revealedDuringChapter: false, hiddenAtChapterStart: true, futureReveal: false, plannedDuringChapter: fact.plannedRevealChapterId === chapterId };
}

export interface InspectorCharacterTimeline {
  beforeChapter: InspectorKnowledgeEvent | null;
  changesDuringChapter: InspectorKnowledgeEvent[];
  future: InspectorKnowledgeEvent[];
}

export function resolveInspectorCharacterTimeline(events: InspectorKnowledgeEvent[], chapterId: string, chapterOrder: number): InspectorCharacterTimeline {
  const baseline = events.filter(event => !event.effectiveChapterId).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
  const past = events.filter(event => typeof event.effectiveChapter?.order === 'number' && event.effectiveChapter.order < chapterOrder)
    .sort((a, b) => (b.effectiveChapter?.order || 0) - (a.effectiveChapter?.order || 0));
  const changesDuringChapter = events.filter(event => event.effectiveChapterId === chapterId);
  const future = events.filter(event => typeof event.effectiveChapter?.order === 'number' && event.effectiveChapter.order > chapterOrder)
    .sort((a, b) => (a.effectiveChapter?.order || 0) - (b.effectiveChapter?.order || 0));
  return { beforeChapter: past[0] || baseline, changesDuringChapter, future };
}

export interface InspectorRange { start: number; end: number }
export interface InspectorContextOptions { range?: InspectorRange; maxCharacters?: number }

export class InspectorContextInputError extends Error {}
export class InspectorContextBudgetError extends Error {}

function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function iso(value?: Date | string | null) { return value ? new Date(value).toISOString() : null; }
function surroundingEntry(before: string, after: string, legacy = false): ContextEntry | null {
  if (!before && !after) return null;
  return {
    id: 'surrounding-text', tier: 1, relevance: 140,
    full: `${legacy ? '【前後の本文：暫定文字window】' : '【前後の参考文脈】'}\n前：${before || 'なし'}\n後：${after || 'なし'}`,
    compact: `${legacy ? '【前後の本文】' : '【前後の参考文脈】'}\n前：${safeContextExcerpt(before, 350, true) || 'なし'}\n後：${safeContextExcerpt(after, 350) || 'なし'}`,
  };
}
function validateRange(content: string, range?: InspectorRange) {
  const requested = range || { start: 0, end: content.length };
  if (!Number.isInteger(requested.start) || !Number.isInteger(requested.end) || requested.start < 0 || requested.end < requested.start || requested.end > content.length) {
    throw new InspectorContextInputError('本文rangeが不正です');
  }
  const end = Math.min(requested.end, requested.start + MAX_INSPECTED_TEXT);
  return { requested, inspected: { start: requested.start, end }, truncated: end < requested.end };
}

function relevanceTerms(text: string) {
  return [...new Set(text.split(/[\s、。！？「」『』（）・,:：;；]/).map(value => value.trim()).filter(value => value.length >= 2))];
}

function factRelevant(fact: InspectorStoryFact, text: string, forcedIds: ReadonlySet<string>, chapterOrder: number) {
  if (forcedIds.has(fact.id)) return true;
  if (relevanceTerms(`${fact.content}\n${fact.notes || ''}`).some(term => text.includes(term))) return true;
  const planned = fact.plannedRevealChapter?.order;
  const revealed = fact.revealedChapter?.order;
  return planned === chapterOrder || revealed === chapterOrder || (fact.importance === 'high' && (planned === chapterOrder + 1 || revealed === chapterOrder - 1));
}

function knowledgeText(event: InspectorKnowledgeEvent | null) {
  if (!event) return '明示設定なし';
  if (event.status === 'believes_false') return `誤認：${event.beliefNotes || '内容未設定'}`;
  if (event.status === 'suspects') return `疑っている：${event.beliefNotes || '事実内容を疑っている'}`;
  return `知っている${event.beliefNotes ? `：${event.beliefNotes}` : ''}`;
}

function assertProjectBoundary(source: InspectorSources) {
  const projectId = source.project.id;
  if (source.chapter.projectId !== projectId) throw new InspectorContextInputError('Chapterが別Projectに属しています');
  const invalid = [
    ...source.characters.map(value => ['Character', value.projectId] as const),
    ...source.narrators.map(value => ['Narrator', value.projectId] as const),
    ...source.narrativeRules.map(value => ['NarrativeRule', value.projectId] as const),
    ...source.storyFacts.map(value => ['StoryFact', value.projectId] as const),
    ...source.relationships.map(value => ['Relationship', value.projectId] as const),
    ...(source.symbolDictionary?.definitions || []).map(value => ['SymbolDefinition', value.projectId] as const),
    ...(source.symbolDictionary?.usageRules || []).map(value => ['SymbolUsageRule', value.projectId] as const),
    ...(source.symbolDictionary?.overrides || []).map(value => ['SymbolOccurrenceOverride', value.projectId] as const),
  ].find(([, owner]) => owner !== projectId);
  if (invalid) throw new InspectorContextInputError(`${invalid[0]}が別Projectに属しています`);
  const characterIds = new Set(source.characters.map(character => character.id));
  const factIds = new Set(source.storyFacts.map(fact => fact.id));
  const narratorIds = new Set(source.narrators.map(narrator => narrator.id));
  if ((source.project.defaultPovCharacterId && !characterIds.has(source.project.defaultPovCharacterId)) || (source.chapter.povCharacterId && !characterIds.has(source.chapter.povCharacterId))) throw new InspectorContextInputError('POV CharacterのProject境界が不正です');
  if ((source.project.defaultNarratorId && !narratorIds.has(source.project.defaultNarratorId)) || (source.chapter.narratorId && !narratorIds.has(source.chapter.narratorId))) throw new InspectorContextInputError('NarratorのProject境界が不正です');
  if (source.cast.some(entry => entry.chapterId !== source.chapter.id || !characterIds.has(entry.characterId))) throw new InspectorContextInputError('CastのProject境界が不正です');
  if (source.characterKnowledge.some(event => !characterIds.has(event.characterId) || !factIds.has(event.factId))) throw new InspectorContextInputError('CharacterKnowledgeのProject境界が不正です');
  if (source.relationships.some(relation => !characterIds.has(relation.fromCharacterId) || !characterIds.has(relation.toCharacterId))) throw new InspectorContextInputError('RelationshipのProject境界が不正です');
  if (source.symbolDictionary?.usageRules.some(rule => rule.fixedSpeakerId && !characterIds.has(rule.fixedSpeakerId))) throw new InspectorContextInputError('Symbol fixed speakerのProject境界が不正です');
  if (source.narrators.some(narrator => (narrator.linkedCharacterId && !characterIds.has(narrator.linkedCharacterId)) || (narrator.identityFactId && !factIds.has(narrator.identityFactId)))) throw new InspectorContextInputError('Narrator linkのProject境界が不正です');
  if (source.storyFacts.some(fact => (fact.plannedRevealChapter?.projectId && fact.plannedRevealChapter.projectId !== projectId) || (fact.revealedChapter?.projectId && fact.revealedChapter.projectId !== projectId))) throw new InspectorContextInputError('StoryFact Chapter参照のProject境界が不正です');
  if (source.characterKnowledge.some(event => event.effectiveChapter?.projectId && event.effectiveChapter.projectId !== projectId)) throw new InspectorContextInputError('CharacterKnowledge Chapter参照のProject境界が不正です');
  if (source.symbolDictionary?.overrides.some(value => value.chapterId !== source.chapter.id)) throw new InspectorContextInputError('SymbolOccurrenceOverrideのChapter境界が不正です');
}

export function buildInspectorContext(source: InspectorSources, options: InspectorContextOptions = {}) {
  assertProjectBoundary(source);
  const maxCharacters = options.maxCharacters ?? INSPECTOR_CONTEXT_HARD_CAP;
  if (maxCharacters > INSPECTOR_CONTEXT_HARD_CAP || maxCharacters < 2_000) throw new InspectorContextInputError('Inspector Context上限が不正です');
  const range = validateRange(source.chapter.content, options.range);
  const excerpt = source.chapter.content.slice(range.inspected.start, range.inspected.end);
  const legacyBefore = source.chapter.content.slice(Math.max(0, range.inspected.start - SURROUNDING_WINDOW), range.inspected.start);
  const legacyAfter = source.chapter.content.slice(range.inspected.end, Math.min(source.chapter.content.length, range.inspected.end + SURROUNDING_WINDOW));
  const symbolDictionary = source.symbolDictionary || { definitions: [], usageRules: [], overrides: [] };
  const runtimeSymbolPairs = buildRuntimeSymbolPairDefinitions(symbolDictionary.definitions);
  const structuralContext = buildInspectorTextStructure({
    content: source.chapter.content,
    requestedRange: { startOffset: range.requested.start, endOffset: range.requested.end },
    inspectedRange: { startOffset: range.inspected.start, endOffset: range.inspected.end },
  }, { maxBefore: SURROUNDING_WINDOW, maxAfter: SURROUNDING_WINDOW });
  // Keep the Inspector structural parse frozen for semantic-v2 compatibility.
  // Custom Project pairs need only the Text Engine's symbol scanner, not a
  // second full document parse.
  const symbolRegions = scanPairedSymbolRegions(source.chapter.content, { pairedSymbols: runtimeSymbolPairs }).regions;
  const textStructure = { ...structuralContext, symbolRegions };
  const before = textStructure.surroundingBefore;
  const after = textStructure.surroundingAfter;
  const roles = resolveNarrativeRoles({ project: source.project, chapter: source.chapter, characters: source.characters, narrators: source.narrators, cast: source.cast });
  const rules = resolveProjectNarrativeRules(source.narrativeRules);
  const relevantCharacterIds = new Set([roles.pov?.id, roles.narrator?.linkedCharacterId, ...source.cast.map(entry => entry.characterId)].filter((id): id is string => Boolean(id)));
  const relevantCharacters = source.characters.filter(character => relevantCharacterIds.has(character.id));
  const relationships = source.relationships.filter(relation => relevantCharacterIds.has(relation.fromCharacterId) && relevantCharacterIds.has(relation.toCharacterId));
  const forcedFactIds = new Set(source.characterKnowledge.filter(event => relevantCharacterIds.has(event.characterId) && event.effectiveChapterId === source.chapter.id).map(event => event.factId));
  if (roles.narrator?.identityFactId) forcedFactIds.add(roles.narrator.identityFactId);
  const storyFacts = source.storyFacts.filter(fact => factRelevant(fact, `${source.chapter.title}\n${excerpt}`, forcedFactIds, source.chapter.order));
  const readerKnowledge = storyFacts.map(fact => ({ factId: fact.id, ...resolveReaderKnowledgeAtChapter(fact, source.chapter.id, source.chapter.order) }));
  const characterKnowledge = relevantCharacters.flatMap(character => storyFacts.map(fact => {
    const events = source.characterKnowledge.filter(event => event.characterId === character.id && event.factId === fact.id);
    if (events.length === 0 && character.id !== roles.pov?.id && character.id !== roles.narrator?.linkedCharacterId) return null;
    return { characterId: character.id, factId: fact.id, ...resolveInspectorCharacterTimeline(events, source.chapter.id, source.chapter.order) };
  }).filter((value): value is NonNullable<typeof value> => Boolean(value)));
  const narratorKnowledgeSource = roles.narrator?.linkedCharacterId ? {
    type: 'linked_character_default' as const, characterId: roles.narrator.linkedCharacterId,
  } : { type: 'unspecified' as const, characterId: null };
  const identityReaderState = roles.narrator?.identityFactId
    ? readerKnowledge.find(value => value.factId === roles.narrator?.identityFactId) || null
    : null;
  const symbolSemantics = buildInspectorSymbolSemantics({
    projectId: source.project.id,
    chapterId: source.chapter.id,
    content: source.chapter.content,
    targetRange: { startOffset: range.inspected.start, endOffset: range.inspected.end },
    beforeRange: textStructure.beforeRange,
    afterRange: textStructure.afterRange,
    regions: textStructure.symbolRegions,
    symbols: symbolDictionary,
    characterNames: new Map(source.characters.map(character => [character.id, character.name])),
  });

  const entries: ContextEntry[] = [
    { id: 'inspected-text', tier: 0, required: true, full: `【検査対象本文】\n範囲：${range.inspected.start}-${range.inspected.end}\n${excerpt || '（空）'}`, compact: `【検査対象本文】\n${safeContextExcerpt(excerpt || '（空）', 5000)}`, minimum: `【検査対象本文】\n${safeContextExcerpt(excerpt || '（空）', 3000)}` },
    { id: 'roles', tier: 0, required: true, full: `【叙述役割】\nPerspective：${roles.perspective || '未指定'}\nNarrator：${roles.narrator?.name || '未指定'}${roles.narrator?.identityDisclosureMode === 'concealed' ? '（作者用の正体は秘匿設定）' : ''}\nPOV：${roles.pov?.name || '未指定'}\nCast：${source.cast.map(entry => source.characters.find(character => character.id === entry.characterId)?.name).filter(Boolean).join('、') || 'なし'}` },
    { id: 'knowledge-boundary', tier: 0, required: true, full: '【Authoritative Knowledge Boundary】\nAuthor Truth、Reader Knowledge、人物認識、Narratorの知識源を統合せず、別々の根拠として扱う。章中の開示・認識変化を章開始時点の既知情報にしない。' },
  ];
  for (const rule of rules) entries.push({ id: `rule:${rule.id}`, tier: 0, required: true,
    full: `【Project Narrative Rule】\nID：${rule.id}\n名称：${rule.title}\n分類：${rule.category}\n種別：${rule.mode}\n優先度：${rule.priority}\n由来：${rule.source}\nmachineKey：${rule.machineKey || 'なし'}\n上書き：${rule.overridable ? '可' : '不可'}\n本文：${safeContextExcerpt(rule.description, 1800)}`,
    compact: `【Project Narrative Rule】${rule.title}（${rule.mode}／優先度${rule.priority}）\n${safeContextExcerpt(rule.description, 700)}`,
    minimum: `【Project Narrative Rule】${rule.title}（${rule.mode}）\n${safeContextExcerpt(rule.description, 220)}` });
  const surroundingIndex = entries.length;
  const structuralSurrounding = surroundingEntry(before, after);
  if (structuralSurrounding) entries.push(structuralSurrounding);
  if (roles.narrator) entries.push({ id: `narrator:${roles.narrator.id}`, tier: 0, required: true, full: `【Narrator Author-side Profile】\nID：${roles.narrator.id}\n作者用名：${roles.narrator.name}\n説明：${roles.narrator.description || '未設定'}\nNarrator voice：${roles.narrator.voiceNotes || '未設定'}\nlinked Character：${roles.narrator.linkedCharacterId || 'なし'}\nidentityFact：${roles.narrator.identityFactId || 'なし'}\nidentity disclosure：${roles.narrator.identityDisclosureMode}\nKnowledge source：${narratorKnowledgeSource.type}`,
    compact: `【Narrator】${roles.narrator.name}\nvoice：${safeContextExcerpt(roles.narrator.voiceNotes || '未設定', 500)}\nidentity：${roles.narrator.identityDisclosureMode}／Knowledge source：${narratorKnowledgeSource.type}`,
    minimum: `【Narrator】${roles.narrator.name}／identity：${roles.narrator.identityDisclosureMode}／Knowledge：${narratorKnowledgeSource.type}` });
  if (roles.pov) entries.push({ id: `pov:${roles.pov.id}`, tier: 0, required: true, full: `【POV Author-side Profile】\nID：${roles.pov.id}\n名前：${roles.pov.name}\nPOV narration voice：${roles.pov.narrationVoiceNotes || '未設定'}`, minimum: `【POV】${roles.pov.name}／地の文：${safeContextExcerpt(roles.pov.narrationVoiceNotes || '未設定', 250)}` });
  storyFacts.forEach(fact => {
    const reader = readerKnowledge.find(value => value.factId === fact.id)!;
    entries.push({ id: `fact:${fact.id}`, tier: roles.narrator?.identityFactId === fact.id ? 0 : 1, required: roles.narrator?.identityFactId === fact.id, relevance: fact.importance === 'high' ? 145 : 110,
      full: `【Author Truth／Reader State】\nFact ID：${fact.id}\nAuthor Truth：${fact.content}\n重要度：${fact.importance}\nReader state：${reader.phase}\n章前既知：${reader.knownBeforeChapter}\n章中開示：${reader.revealedDuringChapter}\n章開始時hidden：${reader.hiddenAtChapterStart}\n将来開示：${reader.futureReveal}\n章中公開予定：${reader.plannedDuringChapter}\nplanned：${fact.plannedRevealChapterId || 'なし'}／actual：${fact.revealedChapterId || 'なし'}`,
      compact: `【Author Truth】${fact.content}\nReader：${reader.phase}（before=${reader.knownBeforeChapter}, during=${reader.revealedDuringChapter}）`,
      minimum: `【Fact ${fact.id}】Reader=${reader.phase}／${safeContextExcerpt(fact.content, 180)}` });
  });
  characterKnowledge.forEach(item => {
    const character = source.characters.find(value => value.id === item.characterId)!;
    entries.push({ id: `knowledge:${item.characterId}:${item.factId}`, tier: item.characterId === roles.pov?.id || item.characterId === roles.narrator?.linkedCharacterId ? 0 : 1, required: item.characterId === roles.pov?.id || item.characterId === roles.narrator?.linkedCharacterId,
      full: `【Character Perception】\n人物：${character.name}\nFact ID：${item.factId}\n章開始時：${knowledgeText(item.beforeChapter)}\n章中変化：${item.changesDuringChapter.map(knowledgeText).join('／') || 'なし'}\n未来event：${item.future.map(event => `${event.effectiveChapterId}:${knowledgeText(event)}`).join('／') || 'なし'}`,
      compact: `【人物認識】${character.name}／${item.factId}\nbefore：${knowledgeText(item.beforeChapter)}\nduring：${item.changesDuringChapter.map(knowledgeText).join('／') || 'なし'}`,
      minimum: `【人物認識】${character.name}／${item.factId}：before=${knowledgeText(item.beforeChapter)}／during=${item.changesDuringChapter.length}` });
  });
  relevantCharacters.forEach(character => entries.push({ id: `voice:${character.id}`, tier: 1, relevance: character.id === roles.pov?.id ? 135 : 90,
    full: `【Character Voice】${character.name}\n一人称：${character.firstPerson || '未設定'}\n基本二人称：${character.defaultSecondPerson || '未設定'}\n話し方：${character.speechRegister || '未設定'}\n台詞：${character.speechStyleNotes || '未設定'}\nPOV narration voice：${character.narrationVoiceNotes || '未設定'}`,
    compact: `【Voice】${character.name}：${[character.firstPerson, character.defaultSecondPerson, character.speechRegister, character.speechStyleNotes].filter(Boolean).join('／') || '未設定'}` }));
  relationships.forEach(relation => entries.push({ id: `relationship:${relation.id}`, tier: 1, relevance: 80,
    full: `【Relationship Voice】${relation.fromCharacterId}→${relation.toCharacterId}\n呼称：${relation.addressTerm || '基本設定'}\n話し方：${relation.speechRegister || '基本設定'}\nメモ：${relation.speechStyleNotes || 'なし'}` }));
  symbolSemantics.forEach(value => entries.push(inspectorSymbolContextEntry(value)));

  const minimumRequiredLength = entries.filter(entry => entry.required).reduce((sum, entry, index) => sum + (entry.minimum || entry.compact || entry.full).trim().length + (index ? 2 : 0), 0);
  if (minimumRequiredLength > maxCharacters) throw new InspectorContextBudgetError(`Required Inspector Contextが上限を超えています（${minimumRequiredLength}/${maxCharacters}）`);
  const budget = buildContextWithinBudget(entries, maxCharacters);
  if (budget.included.some(item => item.representation === 'truncated')) throw new InspectorContextBudgetError('Required semantic blockを安全に保持できません');
  // semantic-v2 and legacy-v1 are frozen contracts. Dictionary rollout must not
  // alter their budget selection even when a v3 symbol entry competes for space.
  const semanticV2Entries = entries.filter(entry => !entry.id.startsWith('symbol:'));
  const semanticV2Budget = buildContextWithinBudget(semanticV2Entries, maxCharacters);
  const legacyEntries = semanticV2Entries.filter(entry => entry.id !== 'surrounding-text');
  const legacySurrounding = surroundingEntry(legacyBefore, legacyAfter, true);
  if (legacySurrounding) legacyEntries.splice(surroundingIndex, 0, legacySurrounding);
  const legacyBudget = buildContextWithinBudget(legacyEntries, maxCharacters);
  const contentHash = hash(source.chapter.content);
  const buildManifest = (selectedBudget: ContextBudgetResult, legacy: boolean) => {
    const includedIds = new Set(selectedBudget.included.map(item => item.id));
    return {
      builderVersion: INSPECTOR_CONTEXT_BUILDER_VERSION, projectId: source.project.id, chapterId: source.chapter.id,
      chapterUpdatedAt: iso(source.chapter.updatedAt), contentHash,
      requestedRange: range.requested, inspectedRange: range.inspected,
      perspectiveSource: source.project.narrativePerspective ? 'project' : 'unspecified',
      narratorSource: source.chapter.narratorId ? 'chapter' : source.project.defaultNarratorId ? 'project' : 'unspecified',
      povSource: source.chapter.povCharacterId ? 'chapter' : source.project.defaultPovCharacterId ? 'project' : 'unspecified',
      narrativeRules: rules.map(rule => ({ id: rule.id, updatedAt: iso(source.narrativeRules.find(value => value.id === rule.id)?.updatedAt), included: includedIds.has(`rule:${rule.id}`) })),
      storyFacts: storyFacts.map(fact => ({ id: fact.id, updatedAt: iso(fact.updatedAt), readerState: readerKnowledge.find(value => value.factId === fact.id)?.phase, included: includedIds.has(`fact:${fact.id}`) })),
      characterKnowledge: source.characterKnowledge.filter(event => storyFacts.some(fact => fact.id === event.factId) && relevantCharacterIds.has(event.characterId)).map(event => ({ id: event.id, updatedAt: iso(event.updatedAt) })),
      characterIds: relevantCharacters.map(character => character.id), relationshipIds: relationships.map(relation => relation.id),
      narrator: roles.narrator ? { id: roles.narrator.id, source: source.chapter.narratorId ? 'chapter' : 'project', linkedCharacterId: roles.narrator.linkedCharacterId || null, identityFactId: roles.narrator.identityFactId || null, identityReaderState: identityReaderState?.phase || null } : null,
      pov: roles.pov ? { id: roles.pov.id, source: source.chapter.povCharacterId ? 'chapter' : 'project' } : null,
      omittedCategories: [...new Set(selectedBudget.omitted.map(id => id.split(':')[0]))],
      truncation: { inspectedText: range.truncated, requestedCharacters: range.requested.end - range.requested.start, includedCharacters: excerpt.length, contextCharacters: selectedBudget.text.length, hardCap: maxCharacters },
      adapters: { surroundingText: legacy ? 'temporary-character-window-v1' : textStructure.adapterVersion, semanticSpans: legacy ? 'not-provided' : 'symbol-dictionary-v1' },
      ...(!legacy && { textStructure: {
        parserVersion: textStructure.parserVersion,
        adapterVersion: textStructure.adapterVersion,
        expansionMode: textStructure.expansionMode,
        fallbackReason: textStructure.fallbackReason,
        diagnosticCodes: textStructure.diagnosticCodes,
        beforeRange: textStructure.beforeRange,
        afterRange: textStructure.afterRange,
        overlappingSentenceCount: textStructure.overlappingSentenceIds.length,
        overlappingParagraphCount: textStructure.overlappingParagraphIds.length,
        sectionCount: textStructure.sectionIds.length,
      }, symbolSemantics: {
        includedIds: symbolSemantics.filter(value => includedIds.has(`symbol:${value.id}`)).map(value => value.id),
        omittedIds: symbolSemantics.filter(value => !includedIds.has(`symbol:${value.id}`)).map(value => value.id),
        parseCount: textStructure.parseCount,
      } }),
    };
  };
  const manifest = buildManifest(budget, false);
  const legacyManifest = buildManifest(legacyBudget, true);
  const includedIds = new Set(budget.included.map(item => item.id));
  const includedSymbolSemantics = symbolSemantics.filter(value => includedIds.has(`symbol:${value.id}`));
  return {
    text: budget.text,
    inspectedText: { requestedRange: range.requested, startOffset: range.inspected.start, endOffset: range.inspected.end, excerpt, contentHash, truncated: range.truncated, surroundingBefore: before, surroundingAfter: after },
    roles: { ...roles, narratorIdentity: roles.narrator?.identityFactId ? { factId: roles.narrator.identityFactId, authorSide: true as const, disclosureMode: roles.narrator.identityDisclosureMode, readerState: identityReaderState } : null },
    ruleResolution: { precedence: ['explicit_inspection_condition', 'author_confirmed_symbol_dictionary', 'project_narrative_rule', 'general_convention'] as const, projectRules: rules, generalConventionIncluded: false },
    rules, knowledge: { authorTruth: storyFacts, reader: readerKnowledge, characters: characterKnowledge, narratorKnowledgeSource },
    voices: { characters: relevantCharacters, relationships, narratorVoiceNotes: roles.narrator?.voiceNotes || '', povNarrationVoiceNotes: roles.pov?.narrationVoiceNotes || '' },
    symbolSemantics: includedSymbolSemantics,
    budget, semanticV2Budget, textStructure,
    manifest,
    // Compatibility bridge: actual structural context is provenance, not a reason
    // to invalidate author decisions or Learning sessions after adapter rollout.
    legacyFreshnessPayload: { manifest: legacyManifest, semanticContext: legacyBudget.text },
  };
}

export type InspectorBuiltContext = ReturnType<typeof buildInspectorContext>;
