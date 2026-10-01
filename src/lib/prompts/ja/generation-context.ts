import { formatSemanticLabel } from './semantic-labels';
import { DEFAULT_CHAPTER_TARGET } from '@/lib/writing-settings';
import { displayLabel, NARRATIVE_PERSPECTIVE_LABELS, SPEECH_REGISTER_LABELS } from '@/lib/i18n';
import { resolveDirectedVoice, shouldUseNarrationVoice } from '@/lib/character-voice';

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
  worldSettings: GenerationWorldSetting[];
  scenes: GenerationScene[];
  foreshadowings: GenerationForeshadowing[];
  storyStates: GenerationStoryState[];
  plots: GenerationPlot[];
  storyNodes: GenerationStoryNode[];
  storyEdges: GenerationStoryEdge[];
}

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

export function buildChapterGenerationContext(source: ChapterGenerationSource): string {
  const chapterText = `${source.title}\n${source.outline}\n${source.summary}`;
  const namedCharacters = source.characters.filter(character => chapterText.includes(character.name));
  const mainCharacters = source.characters.filter(character => ['主角', '女主'].includes(character.role));
  const resolvedPov = resolveChapterWritingSettings(source).povCharacter;
  const selectedCharacters = [...new Map([...namedCharacters, ...(resolvedPov ? [resolvedPov] : []), ...mainCharacters].map(character => [character.id, character])).values()].slice(0, 8);
  const selectedIds = new Set(selectedCharacters.map(character => character.id));
  const selectedRelationships = source.relationships
    .filter(relation => selectedIds.has(relation.fromCharacterId) && selectedIds.has(relation.toCharacterId))
    .slice(0, 12);

  const selectedWorld = source.worldSettings
    .filter(setting => includesAny(chapterText, [setting.name, ...(safeStringArray(setting.tags))]))
    .slice(0, 5);
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

  const sections: string[] = [];
  if (source.project) {
    sections.push(`【プロジェクト】\n作品名：${source.project.title}\nジャンル：${formatSemanticLabel('genre', source.project.genre)}\n作品概要：${compact(source.project.description) || '未設定'}`);
  }
  const writingInstructions = buildChapterWritingInstructions(source);
  if (writingInstructions) sections.push(`【作品・章の執筆設定】\n${writingInstructions}`);
  if (source.latestOutline) sections.push(`【全体プロット】\n${compact(source.latestOutline, 3000)}`);
  if (source.previousChapter) {
    sections.push(`【直前の章】\nタイトル：${source.previousChapter.title}\n要約：${compact(source.previousChapter.summary, 800) || '未設定'}\n末尾：${compact(source.previousChapter.content.slice(-1800), 1800) || '本文なし'}`);
  }
  if (selectedCharacters.length > 0) {
    sections.push(`【関連人物】\n${selectedCharacters.map(character =>
      `- ${character.name}（${formatSemanticLabel('characterRole', character.role)}）` +
      `${character.age ? `／年齢：${character.age}` : ''}` +
      `${character.personality ? `\n  性格・話し方の手掛かり：${compact(character.personality, 500)}` : ''}` +
      `${character.background ? `\n  背景：${compact(character.background, 500)}` : ''}` +
      `${character.arc ? `\n  人物の変化：${compact(character.arc, 400)}` : ''}`
    ).join('\n')}`);
  }
  if (selectedRelationships.length > 0) {
    sections.push(`【人物関係】\n${selectedRelationships.map(relation =>
      `- ${relation.fromCharacter?.name || relation.fromCharacterId} → ${relation.toCharacter?.name || relation.toCharacterId}：${formatSemanticLabel('relationship', relation.type)}${relation.description ? `。${compact(relation.description, 400)}` : ''}`
    ).join('\n')}`);
  }
  const voiceContext = buildCharacterVoiceContext(
    selectedCharacters,
    selectedRelationships,
    source.project?.narrativePerspective,
    resolvedPov?.id,
  );
  if (voiceContext) sections.push(voiceContext);
  if (worldFallback.length > 0) {
    sections.push(`【関連世界設定】\n${worldFallback.map(setting =>
      `- ${setting.name}：${compact(setting.description, 700)}${setting.rules ? `\n  規則・制約：${compact(setting.rules, 500)}` : ''}`
    ).join('\n')}`);
  }
  if (selectedScenes.length > 0) {
    sections.push(`【関連シーン設定】\n${selectedScenes.map(scene => {
      const atmosphere = scene.atmosphere ? formatSemanticLabel('atmosphere', scene.atmosphere) : '未設定';
      const time = scene.timeOfDay ? formatSemanticLabel('timeOfDay', scene.timeOfDay) : '未設定';
      return `- ${scene.name}（場所：${scene.location || '未設定'}／時間帯：${time}／雰囲気：${atmosphere}）：${compact(scene.description, 500)}`;
    }).join('\n')}`);
  }
  if (selectedPlots.length > 0) sections.push(`【進行中・関連プロット】\n${selectedPlots.map(plot => `- ${plot.name}：${compact(plot.description, 700)}`).join('\n')}`);
  if (activeForeshadowings.length > 0) sections.push(`【未回収・関連伏線】\n${activeForeshadowings.map(item => `- ${compact(item.content, 500)}（重要度：${item.importance}／想定回収章：${item.expectedResolveChapter || '未定'}）`).join('\n')}`);
  if (selectedStates.length > 0) sections.push(`【直近の物語状態】\n${selectedStates.map(state => `- ${state.type}：${compact(state.data, 700)}`).join('\n')}`);
  if (selectedNodes.length > 0) sections.push(`【関連タイムライン／物語ノード】\n${selectedNodes.map(node => `- ${node.title}：${compact(node.description, 500)}`).join('\n')}`);
  if (selectedEdges.length > 0) sections.push(`【ノード間関係】\n${selectedEdges.map(edge => `- ${edge.sourceNode?.title || edge.sourceId} → ${edge.targetNode?.title || edge.targetId}（${edge.edgeType}${edge.label ? `：${edge.label}` : ''}）`).join('\n')}`);

  const context = sections.join('\n\n');
  const maxContextCharacters = 18000;
  return context.length > maxContextCharacters
    ? `${context.slice(0, maxContextCharacters)}\n（関連コンテキストは上限に達したため、以降を省略）`
    : context;
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
