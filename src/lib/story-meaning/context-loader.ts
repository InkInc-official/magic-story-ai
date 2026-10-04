import { db } from '../db';
import { CREATIVE_TECHNIQUE_BY_KEY, type ProjectCreativeRule } from '../creative-rules';
import { classifyStoryFact, type StoryFactValue } from '../story-facts';
import { deriveCharacterKnowledgeState, type CharacterKnowledgeEvent } from '../character-knowledge';
import { buildChapterMeaningContext } from './context';
import { buildStoryMeaningSourceManifest } from './persistence';
import type { BuildChapterMeaningContextInput, MeaningContextCreativeRule, MeaningReaderState } from './types';

type MeaningDatabase = typeof db;
type MeaningCreativeRuleLoader = (projectId: string) => Promise<{ rules: ProjectCreativeRule[]; excluded: Array<{ id: string; reason: string }> }>;

const loadCreativeRuleRuntime: MeaningCreativeRuleLoader = async projectId => {
  const service = await import('../creative-rule-service.js');
  return service.loadProjectCreativeRuleRuntime(projectId);
};

export class StoryMeaningContextLoadError extends Error {
  constructor(public readonly code: 'not_found' | 'ownership' | 'source_load_failed', message: string) {
    super(message);
    this.name = 'StoryMeaningContextLoadError';
  }
}

function isMeaningRelevantCategory(category: string): boolean {
  return ['structure', 'information', 'tension', 'character', 'reader_experience', 'scene', 'chapter'].includes(category);
}

function includesMeaningfulText(haystack: string, ...needles: string[]) {
  return needles.map(value => value.trim()).filter(value => value.length >= 2).some(value => haystack.includes(value));
}

function readerState(fact: StoryFactValue, chapterId: string, chapterOrder: number): MeaningReaderState {
  if (fact.readerInitiallyKnows || (typeof fact.revealedChapter?.order === 'number' && fact.revealedChapter.order < chapterOrder)) return 'reader_known';
  if (fact.revealedChapterId === chapterId || fact.plannedRevealChapterId === chapterId) return 'reveal_now';
  return 'reader_hidden';
}

function selectCreativeRules(rules: ProjectCreativeRule[]) {
  const selected: MeaningContextCreativeRule[] = [];
  const omitted: string[] = [];
  for (const rule of rules) {
    if (!rule.active || rule.mode === 'off') continue;
    if (rule.kind === 'builtin') {
      const definition = CREATIVE_TECHNIQUE_BY_KEY.get(rule.techniqueKey as never);
      if (!definition || !isMeaningRelevantCategory(definition.category)) { omitted.push(rule.id); continue; }
      const mode = rule.mode as 'reference' | 'required' | 'forbidden';
      selected.push({
        id: rule.id, title: definition.label, guidance: definition.guidance[mode], mode,
        authorAdjustment: rule.authorAdjustment || '',
      });
      continue;
    }
    if (isMeaningRelevantCategory(rule.category)) {
      selected.push({ id: rule.id, title: rule.title, guidance: rule.instruction, mode: rule.mode });
    } else omitted.push(rule.id);
  }
  return { selected, omitted };
}

export interface MeaningContextLoaderDiagnostics {
  code: 'relationship_history_unavailable' | 'creative_rule_no_meaning_surface' | 'optional_source_omitted';
  sourceIds?: string[];
  message: string;
}

export async function loadChapterMeaningContext(
  projectId: string,
  chapterId: string,
  dependencies: { database?: MeaningDatabase; loadCreativeRules?: MeaningCreativeRuleLoader } = {},
) {
  const database = dependencies.database || db;
  const loadCreativeRules = dependencies.loadCreativeRules || loadCreativeRuleRuntime;
  const chapter = await database.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: {
      id: true, projectId: true, order: true, title: true, content: true, outlineContent: true, summary: true,
      purpose: true, povCharacterId: true, narratorId: true, targetWordCount: true, endingNotes: true,
      chapterCharacters: { select: { characterId: true, participation: true, notes: true, order: true }, orderBy: [{ order: 'asc' }, { characterId: 'asc' }] },
    },
  });
  if (!chapter) throw new StoryMeaningContextLoadError('ownership', '同じProjectの保存済みChapterが見つかりません。');
  const project = await database.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, title: true, genre: true, authorIntent: true, genreGuidanceMode: true, genreGuidanceNotes: true,
      narrativePerspective: true, defaultPovCharacterId: true, defaultNarratorId: true, povNotes: true,
      writingStyleNotes: true, formattingNotes: true,
    },
  });
  if (!project) throw new StoryMeaningContextLoadError('not_found', 'Projectが見つかりません。');
  const povCharacterId = chapter.povCharacterId || project.defaultPovCharacterId;
  const narratorId = chapter.narratorId || project.defaultNarratorId;
  const narrator = narratorId ? await database.narratorProfile.findFirst({ where: { id: narratorId, projectId } }) : null;
  if (narratorId && !narrator) throw new StoryMeaningContextLoadError('ownership', 'NarratorがProjectに属していません。');
  const characterIds = [...new Set([
    ...(povCharacterId ? [povCharacterId] : []),
    ...(narrator?.linkedCharacterId ? [narrator.linkedCharacterId] : []),
    ...chapter.chapterCharacters.map(value => value.characterId),
  ])];

  let loaded;
  try {
    loaded = await Promise.all([
      database.character.findMany({ where: { projectId, id: { in: characterIds } }, orderBy: { id: 'asc' } }),
      database.storyFact.findMany({
        where: { projectId },
        include: { plannedRevealChapter: { select: { id: true, order: true, title: true } }, revealedChapter: { select: { id: true, order: true, title: true } } },
        orderBy: { id: 'asc' },
      }),
      characterIds.length ? database.characterKnowledge.findMany({
        where: {
          characterId: { in: characterIds }, fact: { projectId },
          OR: [{ effectiveChapterId: null }, { effectiveChapter: { order: { lte: chapter.order } } }],
        },
        include: { effectiveChapter: { select: { id: true, order: true, title: true } } },
        orderBy: [{ characterId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }) : Promise.resolve([]),
      characterIds.length ? database.characterRelationship.findMany({
        where: { projectId, OR: [{ fromCharacterId: { in: characterIds } }, { toCharacterId: { in: characterIds } }] }, orderBy: { id: 'asc' },
      }) : Promise.resolve([]),
      database.plot.findMany({ where: { projectId, status: { in: ['planned', 'active'] } }, orderBy: [{ priority: 'desc' }, { order: 'asc' }, { id: 'asc' }] }),
      database.foreshadowing.findMany({ where: { projectId, status: { not: 'resolved' } }, orderBy: { id: 'asc' } }),
      loadCreativeRules(projectId),
    ]);
  } catch (error) {
    throw new StoryMeaningContextLoadError('source_load_failed', error instanceof Error ? `Meaning sourceの読込に失敗しました: ${error.message}` : 'Meaning sourceの読込に失敗しました。');
  }
  const [characters, allFacts, allKnowledge, relationships, plots, foreshadowings, creativeRuntime] = loaded;
  if (characters.length !== characterIds.length) throw new StoryMeaningContextLoadError('ownership', 'Chapter CastまたはPOV人物がProjectに属していません。');

  const chapterReferenceText = `${chapter.title}\n${chapter.outlineContent}\n${chapter.summary}\n${chapter.purpose}\n${chapter.content}`;
  const currentKnowledgeFactIds = new Set<string>(allKnowledge.filter(value => value.effectiveChapterId === chapter.id).map(value => value.factId));
  if (narrator?.identityFactId) currentKnowledgeFactIds.add(narrator.identityFactId);
  const factContext = { chapterId: chapter.id, chapterOrder: chapter.order, chapterText: chapterReferenceText, forceRelevantFactIds: currentKnowledgeFactIds };
  const selectedFacts = allFacts.filter(fact => classifyStoryFact(fact, factContext) !== 'excluded');
  const selectedFactIds = new Set(selectedFacts.map(value => value.id));
  const selectedKnowledge = allKnowledge.filter(value => selectedFactIds.has(value.factId));
  const knowledgeByFactAndCharacter = new Map<string, typeof selectedKnowledge>();
  for (const value of selectedKnowledge) {
    const key = `${value.factId}:${value.characterId}`;
    knowledgeByFactAndCharacter.set(key, [...(knowledgeByFactAndCharacter.get(key) || []), value]);
  }
  const knowledge = selectedFacts.flatMap(fact => characters.flatMap(character => {
    const state = deriveCharacterKnowledgeState((knowledgeByFactAndCharacter.get(`${fact.id}:${character.id}`) || []) as CharacterKnowledgeEvent[], chapter.id, chapter.order);
    const starting = state.startingState
      ? [{ ...state.startingState, phase: 'before_chapter' as const }]
      : [{ id: `derived-unknown:${fact.id}:${character.id}`, factId: fact.id, characterId: character.id, status: 'unknown' as const, phase: 'before_chapter' as const, notes: '章開始時点の明示的な認識設定なし。' }];
    const current = state.currentChapterChange ? [{ ...state.currentChapterChange, phase: 'during_chapter' as const }] : [];
    return [...starting, ...current].map(value => ({
      id: value.id, factId: value.factId, characterId: value.characterId,
      status: value.status as 'unknown' | 'suspects' | 'believes_false' | 'knows', phase: value.phase,
      beliefNotes: ('beliefNotes' in value ? value.beliefNotes : '') || '', notes: value.notes || '',
    }));
  }));
  const relevantPlots = plots.filter(value => value.status === 'active' || includesMeaningfulText(chapterReferenceText, value.name, value.description));
  const relevantForeshadowings = foreshadowings.filter(value => value.chapterId === chapter.id
    || value.expectedResolveChapter === chapter.order || value.expectedResolveChapter === chapter.order + 1
    || includesMeaningfulText(chapterReferenceText, value.content));
  const creative = selectCreativeRules(creativeRuntime.rules);
  const input: BuildChapterMeaningContextInput = {
    project,
    chapter: {
      id: chapter.id, projectId: chapter.projectId, order: chapter.order, title: chapter.title, content: chapter.content,
      purpose: chapter.purpose, povCharacterId, narratorId, targetWordCount: chapter.targetWordCount, endingNotes: chapter.endingNotes,
    },
    characters: characters.map(value => ({
      id: value.id, name: value.name, role: value.role, personality: value.personality, background: value.background,
      arc: value.arc, firstPerson: value.firstPerson, defaultSecondPerson: value.defaultSecondPerson,
      speechRegister: value.speechRegister, speechStyleNotes: value.speechStyleNotes, narrationVoiceNotes: value.narrationVoiceNotes,
    })),
    narrators: narrator ? [{
      id: narrator.id, name: narrator.name, description: narrator.description, voiceNotes: narrator.voiceNotes,
      linkedCharacterId: narrator.linkedCharacterId, identityFactId: narrator.identityFactId,
      identityDisclosureMode: narrator.identityDisclosureMode, notes: narrator.notes,
    }] : [],
    cast: chapter.chapterCharacters.map(value => ({ characterId: value.characterId, participation: value.participation, notes: value.notes })),
    facts: selectedFacts.map(fact => ({ id: fact.id, content: fact.content, readerState: readerState(fact, chapter.id, chapter.order), importance: fact.importance })),
    knowledge,
    relationships: relationships.map(value => ({
      id: value.id, sourceCharacterId: value.fromCharacterId, targetCharacterId: value.toCharacterId,
      relationship: value.type, notes: [value.description, value.addressTerm && `呼称:${value.addressTerm}`, value.speechRegister && `話し方:${value.speechRegister}`, value.speechStyleNotes].filter(Boolean).join(' / '),
    })),
    plots: relevantPlots.map(value => ({ id: value.id, title: value.name, content: value.description, status: value.status })),
    foreshadowings: relevantForeshadowings.map(value => ({ id: value.id, title: `伏線 ${value.id}`, content: value.content, status: value.status })),
    creativeRules: creative.selected,
  };
  const context = buildChapterMeaningContext(input);
  const diagnostics: MeaningContextLoaderDiagnostics[] = [
    { code: 'relationship_history_unavailable', message: '人物関係は現在値であり、過去時点の履歴を表すものではありません。' },
    { code: 'creative_rule_no_meaning_surface', sourceIds: [...creativeRuntime.excluded.map(value => value.id), ...creative.omitted], message: 'Meaning専用surfaceがないため、正本Catalogのcategory metadataから関連する明示設定だけをInterpretive Lensとして選択しました。' },
    ...(context.manifest.omitted.length ? [{ code: 'optional_source_omitted' as const, sourceIds: context.manifest.omitted, message: '補助コンテキスト予算によりoptional sectionを省略しました。' }] : []),
  ];
  return {
    context,
    diagnostics,
    sourceManifest: { ...buildStoryMeaningSourceManifest(context), diagnostics },
  };
}
