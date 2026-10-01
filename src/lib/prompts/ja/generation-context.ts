import { formatSemanticLabel } from './semantic-labels';
import { DEFAULT_CHAPTER_TARGET } from '@/lib/writing-settings';
import { displayLabel, NARRATIVE_PERSPECTIVE_LABELS, SPEECH_REGISTER_LABELS } from '@/lib/i18n';
import { resolveDirectedVoice, shouldUseNarrationVoice } from '@/lib/character-voice';
import { buildContextWithinBudget, safeContextExcerpt, type ContextEntry } from './context-budget';
import { buildStoryFactContextEntries, type StoryFactValue } from '@/lib/story-facts';
import { buildCharacterKnowledgeContextEntries, type CharacterKnowledgeEvent } from '@/lib/character-knowledge';

export interface GenerationCharacter {
  id: string;
  name: string;
  age?: string;
  role: string;
  personality?: string;
  appearance?: string;
  background?: string;
  arc?: string;
  firstPerson?: string;
  defaultSecondPerson?: string;
  speechRegister?: string;
  speechStyleNotes?: string;
  narrationVoiceNotes?: string;
}

export interface GenerationRelationship {
  fromCharacterId: string;
  toCharacterId: string;
  type: string;
  description?: string;
  addressTerm?: string;
  speechRegister?: string;
  speechStyleNotes?: string;
  fromCharacter?: { name: string };
  toCharacter?: { name: string };
}

export interface GenerationChapterCharacter {
  characterId: string;
  participation: 'present' | 'mentioned';
  notes?: string;
  order: number;
  character: GenerationCharacter;
}

export function buildCharacterVoiceContext(
  characters: GenerationCharacter[],
  relationships: GenerationRelationship[],
  perspective?: string | null,
  povCharacterId?: string | null,
): string {
  const byId = new Map(characters.map(character => [character.id, character]));
  const characterLines = characters.flatMap(character => {
    const details = [
      character.firstPerson && `一人称：${character.firstPerson}`,
      character.defaultSecondPerson && `基本二人称：${character.defaultSecondPerson}`,
      character.speechRegister && `基本の話し方：${displayLabel(SPEECH_REGISTER_LABELS, character.speechRegister)}`,
      character.speechStyleNotes && `台詞の話し方：${compact(character.speechStyleNotes, 600)}`,
      character.id === povCharacterId && character.narrationVoiceNotes && shouldUseNarrationVoice(perspective)
        ? `視点人物としての地の文：${compact(character.narrationVoiceNotes, 700)}`
        : '',
    ].filter(Boolean);
    return details.length > 0 ? [`- ${character.name}\n  ${details.join('\n  ')}`] : [];
  });
  const relationshipLines = relationships.flatMap(relation => {
    const speaker = byId.get(relation.fromCharacterId);
    const listener = byId.get(relation.toCharacterId);
    if (!speaker || !listener) return [];
    const resolved = resolveDirectedVoice(speaker, relation);
    const hasRelationshipOverride = Boolean(relation.addressTerm || relation.speechRegister || relation.speechStyleNotes);
    const details = [
      resolved.addressTerm && `呼称：${resolved.addressTerm}${relation.addressTerm ? '（相手別設定）' : '（基本設定から継承）'}`,
      resolved.speechRegister && `話し方：${displayLabel(SPEECH_REGISTER_LABELS, resolved.speechRegister)}${relation.speechRegister ? '（相手別設定）' : '（基本設定から継承）'}`,
      resolved.speechStyleNotes && `話し方メモ：${compact(resolved.speechStyleNotes, 500)}${relation.speechStyleNotes ? '（相手別設定）' : '（基本設定から継承）'}`,
    ].filter(Boolean);
    return hasRelationshipOverride && details.length > 0
      ? [`- ${speaker.name} → ${listener.name}\n  ${details.join('\n  ')}`]
      : [];
  });
  return [
    characterLines.length > 0 && `【人物の基本音声】\n${characterLines.join('\n')}`,
    relationshipLines.length > 0 && `【相手別の話し方（矢印の左から右への発話）】\n${relationshipLines.join('\n')}`,
  ].filter(Boolean).join('\n\n');
}

export interface GenerationWorldSetting {
  name: string;
  description?: string;
  rules?: string;
  tags?: string;
}

export interface GenerationScene {
  name: string;
  description?: string;
  location?: string;
  atmosphere?: string;
  timeOfDay?: string;
  tags?: string;
}

export interface GenerationForeshadowing {
  chapterId: string;
  content: string;
  expectedResolveChapter: number;
  status: string;
  importance: string;
}

export interface GenerationStoryState {
  chapterId: string;
  type: string;
  data: string;
}

export interface GenerationPlot {
  name: string;
  description?: string;
  status: string;
  priority: number;
}

export interface GenerationStoryNode {
  id: string;
  title: string;
  description?: string;
  order: number;
}

export interface GenerationStoryEdge {
  sourceId: string;
  targetId: string;
  label?: string;
  edgeType: string;
  sourceNode?: { title: string };
  targetNode?: { title: string };
}

export interface ChapterGenerationSource {
  chapterId: string;
  chapterOrder: number;
  title: string;
  outline: string;
  summary: string;
  emotionTarget: string;
  emotionArc: string;
  hookStart: string;
  hookEnd: string;
  povCharacterId?: string | null;
  purpose?: string;
  targetWordCount?: number | null;
  endingNotes?: string;
  project?: { title: string; genre: string; description: string; narrativePerspective?: string | null; defaultPovCharacterId?: string | null; povNotes?: string; writingStyleNotes?: string; defaultChapterTarget?: number | null; chapterLengthPolicy?: string; formattingNotes?: string };
  previousChapter?: { id: string; title: string; summary: string; content: string };
  latestOutline?: string;
  characters: GenerationCharacter[];
  relationships: GenerationRelationship[];
  chapterCharacters?: GenerationChapterCharacter[];
  worldSettings: GenerationWorldSetting[];
  scenes: GenerationScene[];
  foreshadowings: GenerationForeshadowing[];
  storyStates: GenerationStoryState[];
  plots: GenerationPlot[];
  storyNodes: GenerationStoryNode[];
  storyEdges: GenerationStoryEdge[];
  storyFacts?: StoryFactValue[];
  characterKnowledge?: CharacterKnowledgeEvent[];
}

export const AUTHORITATIVE_KNOWLEDGE_BOUNDARY = `【情報開示・人物認識の優先規則】
StoryFactおよび人物認識履歴で明示された開示状態・認識状態を正規の境界として扱う。
プロット、設定、要約、前章本文などの自由記述に同じ情報や矛盾する情報が含まれていても、StoryFact／人物認識履歴側を優先する。
- hiddenの事実を予定より早く読者へ直接開示しない。
- POV人物が知らない真実を内面の確定知識にしない。
- suspectsを確定知識として扱わない。
- believes_falseを作者の真実へ勝手に修正しない。
- 現在章の認識変化より前に、変更後の認識を使わない。
この規則はStoryFactまたは人物認識履歴に登録された情報だけに適用し、それ以外の一般情報は自由記述に従う。`;

export function resolveChapterWritingSettings(source: ChapterGenerationSource) {
  const povCharacterId = source.povCharacterId || source.project?.defaultPovCharacterId || null;
  return {
    povCharacter: source.characters.find(character => character.id === povCharacterId),
    targetWordCount: source.targetWordCount || source.project?.defaultChapterTarget || DEFAULT_CHAPTER_TARGET,
    lengthPolicy: source.project?.chapterLengthPolicy === 'strict' ? 'strict' as const : 'guide' as const,
    perspective: source.project?.narrativePerspective || '',
    purpose: source.purpose?.trim() || '',
    endingNotes: source.endingNotes?.trim() || '',
  };
}

export function buildChapterWritingInstructions(source: ChapterGenerationSource): string {
  const resolved = resolveChapterWritingSettings(source);
  const lines = [
    resolved.perspective && `視点方式：${displayLabel(NARRATIVE_PERSPECTIVE_LABELS, resolved.perspective)}`,
    resolved.povCharacter && `視点人物：${resolved.povCharacter.name}`,
    source.project?.povNotes && `視点運用：${compact(source.project.povNotes, 800)}`,
    resolved.purpose && `章の目的：${compact(resolved.purpose, 800)}`,
    source.project?.writingStyleNotes && `文体：${compact(source.project.writingStyleNotes, 800)}`,
    source.project?.formattingNotes && `表記・組版：${compact(source.project.formattingNotes, 800)}`,
    resolved.endingNotes && `章末：${compact(resolved.endingNotes, 800)}`,
    `目標文字数：${resolved.targetWordCount}字`,
    resolved.lengthPolicy === 'strict'
      ? '文字数方針：指定文字数へできるだけ近づける。ただし不自然な水増しや唐突な終了は避け、完全一致は要求しない。'
      : '文字数方針：目標は目安とし、場面と章の自然な終了を文字数合わせより優先する。',
  ].filter(Boolean);
  return lines.join('\n');
}

const includesAny = (text: string, values: string[]) => values.some(value => value && text.includes(value));
const compact = (value?: string, limit = 1200) => value?.trim().slice(0, limit) || '';

export function selectChapterCast(source: ChapterGenerationSource) {
  const chapterText = `${source.title}\n${source.outline}\n${source.summary}`;
  const resolvedPov = resolveChapterWritingSettings(source).povCharacter;
  const explicitEntries = source.chapterCharacters || [];
  if (explicitEntries.length === 0) {
    const namedCharacters = source.characters.filter(character => chapterText.includes(character.name));
    const mainCharacters = source.characters.filter(character => ['主角', '女主'].includes(character.role));
    const fullCharacters = [...new Map([...namedCharacters, ...(resolvedPov ? [resolvedPov] : []), ...mainCharacters].map(character => [character.id, character])).values()].slice(0, 8);
    return { explicit: false, resolvedPov, fullCharacters, compactPresent: [] as GenerationChapterCharacter[], mentioned: [] as GenerationChapterCharacter[] };
  }

  const sortEntries = (a: GenerationChapterCharacter, b: GenerationChapterCharacter) => {
    const aNamed = chapterText.includes(a.character.name) ? 1 : 0;
    const bNamed = chapterText.includes(b.character.name) ? 1 : 0;
    return bNamed - aNamed || a.order - b.order;
  };
  const present = explicitEntries.filter(entry => entry.participation === 'present').sort(sortEntries);
  const mentioned = explicitEntries.filter(entry => entry.participation === 'mentioned').sort((a, b) => a.order - b.order);
  const fullCharacters = [...new Map([...(resolvedPov ? [resolvedPov] : []), ...present.map(entry => entry.character)].map(character => [character.id, character])).values()].slice(0, 8);
  const fullIds = new Set(fullCharacters.map(character => character.id));
  return { explicit: true, resolvedPov, fullCharacters, compactPresent: present.filter(entry => !fullIds.has(entry.characterId)), mentioned };
}

export function selectReviewCharacters(
  characters: GenerationCharacter[],
  explicitCast: GenerationChapterCharacter[],
  content: string,
  resolvedPovId?: string | null,
): GenerationCharacter[] {
  const byId = new Map(characters.map(character => [character.id, character]));
  const pov = resolvedPovId ? byId.get(resolvedPovId) : undefined;
  const candidates = explicitCast.length > 0
    ? explicitCast.filter(entry => entry.participation === 'present').sort((a, b) => a.order - b.order).map(entry => byId.get(entry.characterId) || entry.character)
    : characters.filter(character => content.includes(character.name));
  return [...new Map([...(pov ? [pov] : []), ...candidates].map(character => [character.id, character])).values()].slice(0, 8);
}

function buildChapterGenerationContextEntries(source: ChapterGenerationSource): ContextEntry[] {
  const chapterText = `${source.title}\n${source.outline}\n${source.summary}`;
  const cast = selectChapterCast(source);
  const resolvedPov = cast.resolvedPov;
  const selectedCharacters = cast.fullCharacters;
  const selectedIds = new Set(selectedCharacters.map(character => character.id));
  const selectedRelationships = source.relationships
    .filter(relation => selectedIds.has(relation.fromCharacterId) && selectedIds.has(relation.toCharacterId))
    .slice(0, 12);

  const selectedWorld = source.worldSettings
    .filter(setting => includesAny(chapterText, [setting.name, ...(safeStringArray(setting.tags))]))
    .slice(0, 8);
  const worldFallback = selectedWorld.length > 0 ? selectedWorld : source.worldSettings.slice(0, 3);

  const selectedScenes = source.scenes
    .filter(scene => includesAny(chapterText, [scene.name, scene.location || '', ...safeStringArray(scene.tags)]))
    .slice(0, 3);
  const activeForeshadowings = source.foreshadowings
    .filter(item => item.status !== 'resolved' && (
      item.chapterId === source.chapterId ||
      (item.expectedResolveChapter > 0 && item.expectedResolveChapter <= source.chapterOrder + 1) ||
      includesAny(chapterText, item.content.split(/[、。\s]+/).filter(word => word.length >= 2))
    ))
    .slice(0, 6);
  const selectedStates = source.storyStates
    .filter(state => state.chapterId === source.chapterId || state.chapterId === source.previousChapter?.id)
    .slice(0, 5);
  const selectedPlots = source.plots
    .filter(plot => plot.status === 'active' || chapterText.includes(plot.name))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4);
  const selectedNodes = source.storyNodes.filter(node => includesAny(chapterText, [node.title])).slice(0, 5);
  const selectedNodeIds = new Set(selectedNodes.map(node => node.id));
  const selectedEdges = source.storyEdges
    .filter(edge => selectedNodeIds.has(edge.sourceId) || selectedNodeIds.has(edge.targetId))
    .slice(0, 6);

  const entries: ContextEntry[] = [];
  const semanticContext = buildChapterSemanticContext(source);
  entries.push({
    id: 'current-chapter', tier: 0, required: true,
    full: `【現在章】\nタイトル：${source.title || '未設定'}\n詳細プロット：\n${safeContextExcerpt(source.outline || '未設定', 7000)}${source.summary ? `\n既存要約：${safeContextExcerpt(source.summary, 1200)}` : ''}${semanticContext ? `\n${semanticContext}` : ''}`,
    compact: `【現在章】\nタイトル：${source.title || '未設定'}\n詳細プロット：\n${safeContextExcerpt(source.outline || '未設定', 4200)}${semanticContext ? `\n${semanticContext}` : ''}`,
    minimum: `【現在章】\nタイトル：${safeContextExcerpt(source.title || '未設定', 300)}\n詳細プロット：\n${safeContextExcerpt(source.outline || '未設定', 2200)}${semanticContext ? `\n${semanticContext}` : ''}`,
  });
  const writingInstructions = buildChapterWritingInstructions(source);
  if (writingInstructions) entries.push({ id: 'writing-instructions', tier: 0, required: true, full: `【作品・章の執筆設定】\n${writingInstructions}` });
  if ((source.storyFacts?.length || 0) > 0 || (source.characterKnowledge?.length || 0) > 0) {
    entries.push({ id: 'authoritative-knowledge-boundary', tier: 0, required: true, full: AUTHORITATIVE_KNOWLEDGE_BOUNDARY });
  }
  if (source.project) entries.push({
    id: 'project', tier: 0, required: true,
    full: `【プロジェクト】\n作品名：${source.project.title}\nジャンル：${formatSemanticLabel('genre', source.project.genre)}\n作品概要：${safeContextExcerpt(source.project.description || '未設定', 1600)}`,
    compact: `【プロジェクト】\n作品名：${source.project.title}\nジャンル：${formatSemanticLabel('genre', source.project.genre)}\n作品概要：${safeContextExcerpt(source.project.description || '未設定', 700)}`,
    minimum: `【プロジェクト】\n作品名：${source.project.title}\nジャンル：${formatSemanticLabel('genre', source.project.genre)}`,
  });
  if (source.previousChapter) {
    const previousSummary = safeContextExcerpt(source.previousChapter.summary, 1200) || '未設定';
    const previousTail = safeContextExcerpt(source.previousChapter.content, 2200, true) || '本文なし';
    entries.push({
      id: 'previous-chapter', tier: 1, relevance: 100,
      full: `【直前の章（継続性）】\nタイトル：${source.previousChapter.title}\n要約：${previousSummary}\n本文末尾：${previousTail}`,
      compact: `【直前の章（継続性）】\nタイトル：${source.previousChapter.title}\n要約：${safeContextExcerpt(source.previousChapter.summary, 800) || '未設定'}\n本文末尾：${safeContextExcerpt(source.previousChapter.content, 900, true) || '本文なし'}`,
      minimum: `【直前の章（継続性）】\n${source.previousChapter.title}：${safeContextExcerpt(source.previousChapter.summary || source.previousChapter.content, 500, !source.previousChapter.summary) || '内容なし'}`,
    });
  }
  const castById = new Map((source.chapterCharacters || []).map(entry => [entry.characterId, entry]));
  selectedCharacters.forEach((character, index) => {
    const chapterEntry = castById.get(character.id);
    const role = formatSemanticLabel('characterRole', character.role);
    const voice = [
      character.firstPerson && `一人称：${character.firstPerson}`,
      character.defaultSecondPerson && `基本二人称：${character.defaultSecondPerson}`,
      character.speechRegister && `敬語・話し方：${displayLabel(SPEECH_REGISTER_LABELS, character.speechRegister)}`,
      character.speechStyleNotes && `台詞：${safeContextExcerpt(character.speechStyleNotes, 500)}`,
      character.id === resolvedPov?.id && character.narrationVoiceNotes && shouldUseNarrationVoice(source.project?.narrativePerspective)
        ? `地の文：${safeContextExcerpt(character.narrationVoiceNotes, 600)}` : '',
    ].filter(Boolean).join('\n  ');
    const heading = character.id === resolvedPov?.id ? 'POV人物' : '主要登場人物';
    entries.push({
      id: `character:${character.id}`, tier: 1, relevance: character.id === resolvedPov?.id ? 200 : 100 - index,
      full: `【${heading}】\n- ${character.name}（${role}）${character.age ? `／年齢：${character.age}` : ''}${character.personality ? `\n  性格：${safeContextExcerpt(character.personality, 650)}` : ''}${character.background ? `\n  背景：${safeContextExcerpt(character.background, 650)}` : ''}${character.arc ? `\n  変化：${safeContextExcerpt(character.arc, 450)}` : ''}${voice ? `\n  ${voice}` : ''}${chapterEntry?.notes ? `\n  この章での扱い：${safeContextExcerpt(chapterEntry.notes, 500)}` : ''}`,
      compact: `【${heading}】\n- ${character.name}（${role}）${character.personality ? `：${safeContextExcerpt(character.personality, 250)}` : ''}${voice ? `\n  ${voice}` : ''}${chapterEntry?.notes ? `\n  この章：${safeContextExcerpt(chapterEntry.notes, 220)}` : ''}`,
      minimum: `【${heading}】\n- ${character.name}（${role}）${chapterEntry?.notes ? `：${safeContextExcerpt(chapterEntry.notes, 140)}` : ''}${character.firstPerson ? `／一人称：${character.firstPerson}` : ''}${character.speechRegister ? `／話し方：${displayLabel(SPEECH_REGISTER_LABELS, character.speechRegister)}` : ''}`,
    });
  });
  cast.compactPresent.forEach((entry, index) => entries.push({
    id: `present:${entry.characterId}`, tier: 3, relevance: 120 - index,
    full: `【その他の明示登場人物】\n- ${entry.character.name}（${formatSemanticLabel('characterRole', entry.character.role)}）${entry.notes ? `：${safeContextExcerpt(entry.notes, 300)}` : ''}${entry.character.firstPerson ? `／一人称：${entry.character.firstPerson}` : ''}${entry.character.speechRegister ? `／話し方：${displayLabel(SPEECH_REGISTER_LABELS, entry.character.speechRegister)}` : ''}`,
    compact: `【その他の明示登場人物】\n- ${entry.character.name}（${formatSemanticLabel('characterRole', entry.character.role)}）${entry.notes ? `：${safeContextExcerpt(entry.notes, 160)}` : ''}`,
    minimum: `【その他の明示登場人物】\n- ${entry.character.name}（${formatSemanticLabel('characterRole', entry.character.role)}）`,
  }));
  cast.mentioned.forEach((entry, index) => entries.push({
    id: `mentioned:${entry.characterId}`, tier: 3, relevance: -index,
    full: `【言及のみの人物】\n- ${entry.character.name}（${formatSemanticLabel('characterRole', entry.character.role)}）${entry.notes ? `：${safeContextExcerpt(entry.notes, 220)}` : ''}\n  現在場面の参加人物として扱わず、章の文脈に沿って言及する。`,
    compact: `【言及のみの人物】\n- ${entry.character.name}${entry.notes ? `：${safeContextExcerpt(entry.notes, 120)}` : ''}`, minimum: `【言及のみ】${entry.character.name}`,
  }));
  if (selectedRelationships.length > 0) {
    selectedRelationships.forEach((relation, index) => {
      const speaker = selectedCharacters.find(character => character.id === relation.fromCharacterId);
      const resolvedVoice = speaker ? resolveDirectedVoice(speaker, relation) : undefined;
      const base = `${relation.fromCharacter?.name || relation.fromCharacterId} → ${relation.toCharacter?.name || relation.toCharacterId}：${formatSemanticLabel('relationship', relation.type)}`;
      const overrides = [relation.addressTerm && `呼称：${relation.addressTerm}`, relation.speechRegister && `話し方：${displayLabel(SPEECH_REGISTER_LABELS, relation.speechRegister)}`, relation.speechStyleNotes && `話し方メモ：${safeContextExcerpt(relation.speechStyleNotes, 400)}`].filter(Boolean).join('／');
      entries.push({ id: `relationship:${index}`, tier: 1, relevance: 50 - index,
        full: `【人物関係・相手別音声】\n- ${base}${relation.description ? `。${safeContextExcerpt(relation.description, 400)}` : ''}${overrides ? `\n  ${overrides}` : resolvedVoice?.addressTerm ? `\n  基本呼称：${resolvedVoice.addressTerm}` : ''}`,
        compact: `【人物関係・相手別音声】\n- ${base}${overrides ? `／${overrides}` : ''}`, minimum: `【人物関係】${base}` });
    });
  }
  worldFallback.forEach((setting, index) => entries.push({
    id: `world:${setting.name}:${index}`, tier: 2, relevance: selectedWorld.includes(setting) ? 100 - index : -index,
    full: `【関連世界設定】\n- ${setting.name}${setting.rules ? `\n  規則・制約：${safeContextExcerpt(setting.rules, 800)}` : ''}${setting.description ? `\n  説明：${safeContextExcerpt(setting.description, 700)}` : ''}`,
    compact: `【関連世界設定】\n- ${setting.name}${setting.rules ? `／重要規則：${safeContextExcerpt(setting.rules, 420)}` : setting.description ? `：${safeContextExcerpt(setting.description, 350)}` : ''}`,
    minimum: `【関連世界設定】\n- ${setting.name}${setting.rules ? `：${safeContextExcerpt(setting.rules, 180)}` : ''}`,
  }));
  selectedScenes.forEach((scene, index) => {
      const atmosphere = scene.atmosphere ? formatSemanticLabel('atmosphere', scene.atmosphere) : '未設定';
      const time = scene.timeOfDay ? formatSemanticLabel('timeOfDay', scene.timeOfDay) : '未設定';
      entries.push({ id: `scene:${scene.name}:${index}`, tier: 3, relevance: 50 - index,
        full: `【関連シーン設定】\n- ${scene.name}（場所：${scene.location || '未設定'}／時間帯：${time}／雰囲気：${atmosphere}）：${safeContextExcerpt(scene.description || '', 500)}`,
        compact: `【関連シーン設定】\n- ${scene.name}（${scene.location || '場所未設定'}／${time}／${atmosphere}）`, minimum: `【関連シーン】${scene.name}` });
  });
  selectedPlots.forEach((plot, index) => entries.push({ id: `plot:${plot.name}:${index}`, tier: 2, relevance: plot.status === 'active' ? 100 + plot.priority : plot.priority,
    full: `【進行中・関連プロット】\n- ${plot.name}：${safeContextExcerpt(plot.description || '詳細未設定', 900)}`,
    compact: `【進行中・関連プロット】\n- ${plot.name}：${safeContextExcerpt(plot.description || '詳細未設定', 400)}`, minimum: `【関連プロット】${plot.name}` }));
  activeForeshadowings.forEach((item, index) => entries.push({ id: `foreshadowing:${index}`, tier: 2, relevance: item.chapterId === source.chapterId ? 120 - index : 50 - index,
    full: `【未回収・関連伏線】\n- ${safeContextExcerpt(item.content, 600)}（重要度：${item.importance}／想定回収章：${item.expectedResolveChapter || '未定'}）`,
    compact: `【未回収・関連伏線】\n- ${safeContextExcerpt(item.content, 300)}（重要度：${item.importance}）`, minimum: `【関連伏線】${safeContextExcerpt(item.content, 140)}` }));
  selectedStates.forEach((state, index) => entries.push({ id: `state:${state.chapterId}:${index}`, tier: 2, relevance: state.chapterId === source.chapterId ? 120 - index : 80 - index,
    full: `【直近の物語状態】\n- ${state.type}：${safeContextExcerpt(state.data, 900)}`, compact: `【直近の物語状態】\n- ${state.type}：${safeContextExcerpt(state.data, 400)}`, minimum: `【物語状態】${state.type}：${safeContextExcerpt(state.data, 150)}` }));
  const knowledgeEvents = source.characterKnowledge || [];
  const currentKnowledgeFactIds = new Set(knowledgeEvents.filter(event => event.effectiveChapterId === source.chapterId).map(event => event.factId));
  const factContext = {
    chapterId: source.chapterId,
    chapterOrder: source.chapterOrder,
    chapterText,
    forceRelevantFactIds: currentKnowledgeFactIds,
  };
  entries.push(...buildStoryFactContextEntries(source.storyFacts || [], factContext));
  const knowledgeCharacters = [...new Map([
    ...selectedCharacters,
    ...cast.compactPresent.map(entry => entry.character),
    ...cast.mentioned.filter(entry => knowledgeEvents.some(event => event.characterId === entry.characterId && event.effectiveChapterId === source.chapterId)).map(entry => entry.character),
  ].map(character => [character.id, character])).values()];
  entries.push(...buildCharacterKnowledgeContextEntries({
    facts: source.storyFacts || [], events: knowledgeEvents, characters: knowledgeCharacters,
    factContext, povCharacterId: resolvedPov?.id, perspective: source.project?.narrativePerspective,
  }));
  if (source.latestOutline) entries.push({ id: 'overall-plot', tier: 3, relevance: 30, full: `【全体プロット】\n${safeContextExcerpt(source.latestOutline, 3000)}`, compact: `【全体プロット】\n${safeContextExcerpt(source.latestOutline, 1200)}`, minimum: `【全体プロット要点】\n${safeContextExcerpt(source.latestOutline, 400)}` });
  selectedNodes.forEach((node, index) => entries.push({ id: `node:${node.id}`, tier: 3, relevance: 20 - index, full: `【関連タイムライン／物語ノード】\n- ${node.title}：${safeContextExcerpt(node.description || '', 500)}`, compact: `【関連物語ノード】${node.title}：${safeContextExcerpt(node.description || '', 220)}`, minimum: `【関連物語ノード】${node.title}` }));
  selectedEdges.forEach((edge, index) => {
    const relation = `${edge.sourceNode?.title || edge.sourceId} → ${edge.targetNode?.title || edge.targetId}（${edge.edgeType}${edge.label ? `：${edge.label}` : ''}）`;
    entries.push({ id: `edge:${index}`, tier: 4, relevance: -index, full: `【ノード間関係】\n- ${relation}`, minimum: `【物語ノード関係】${relation}` });
  });

  return entries;
}

function withOmissionNote(result: ReturnType<typeof buildContextWithinBudget>): string {
  if (result.omitted.length === 0 || result.text.length > 17_950) return result.text;
  const note = '\n\n（追加の背景設定はコンテキスト上限のため省略）';
  return result.text.length + note.length <= 18_000 ? `${result.text}${note}` : result.text;
}

export function buildChapterGenerationContext(source: ChapterGenerationSource): string {
  return withOmissionNote(buildContextWithinBudget(buildChapterGenerationContextEntries(source)));
}

const SUMMARY_TASK_INSTRUCTION = `【タスク】
以下のコンテキストに従い、詳細プロットを本文生成に使える章要約へ整理する。
- 本章の目的、中心となる出来事、人物の選択と変化、必要な会話要点を整理する。
- 視点人物が特定できる場合は、その人物と知識範囲を反映する。
- 前章から持ち越す情報、関連設定、伏線は本章に必要なものだけを含める。
- 感情や章頭・章末の形式は指定の意味を踏まえるが、展開に合わない型を機械的に強制しない。
- 長さは内容を過不足なく本文化できる分量とし、固定文字数に合わせるための水増しをしない。
要約本文だけを日本語で出力する。`;

const FULL_TASK_INSTRUCTION = `【タスク】
以下のコンテキストに従い、章要約と詳細プロットから日本語小説の章本文を書く。
- 章要約を中心に、詳細プロットと既存設定に矛盾しない本文へ展開する。
- 視点人物の知識範囲、人物の性格、関係性、呼称、話し方を守る。
- 前章の状態を自然に引き継ぎ、未回収伏線や時系列は本章に関連する場合だけ反映する。
- 説明、描写、心理、行動、台詞は場面の目的と速度に応じて選ぶ。
- 章末は指定があればその意味を踏まえ、なければ章の役割に合う形を選ぶ。
- 目標文字数と文字数方針を適用する。
前置きや解説を付けず、章本文だけを日本語で出力する。`;

function buildWriterUserMessage(source: ChapterGenerationSource, task: string): string {
  const entries: ContextEntry[] = [
    { id: 'writer-task', tier: 0, required: true, full: task },
    ...buildChapterGenerationContextEntries(source),
  ];
  return withOmissionNote(buildContextWithinBudget(entries));
}

export function buildChapterSummaryUserMessage(source: ChapterGenerationSource): string {
  return buildWriterUserMessage(source, SUMMARY_TASK_INSTRUCTION);
}

export function buildChapterFullUserMessage(source: ChapterGenerationSource): string {
  return buildWriterUserMessage(source, FULL_TASK_INSTRUCTION);
}

export function buildChapterSemanticContext(values: Pick<ChapterGenerationSource, 'emotionTarget' | 'emotionArc' | 'hookStart' | 'hookEnd'>): string {
  return [
    values.emotionTarget && `感情効果：${formatSemanticLabel('emotion', values.emotionTarget)}`,
    values.emotionArc && `感情の流れ：${formatSemanticLabel('emotionArc', values.emotionArc)}`,
    values.hookStart && `章頭の形式：${formatSemanticLabel('hook', values.hookStart)}`,
    values.hookEnd && `章末の形式：${formatSemanticLabel('hook', values.hookEnd)}`,
  ].filter(Boolean).join('\n');
}

function safeStringArray(value?: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
