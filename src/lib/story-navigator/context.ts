import { buildContextWithinBudget, safeContextExcerpt, type ContextEntry } from '@/lib/prompts/ja/context-budget';
import { formatSemanticLabel } from '@/lib/prompts/ja/semantic-labels';
import { displayLabel, NARRATIVE_PERSPECTIVE_LABELS } from '@/lib/i18n';
import { deriveNavigatorCurrentState, loadNavigatorSource } from './current-state';
import {
  STORY_NAVIGATOR_CONTEXT_HARD_CAP, STORY_NAVIGATOR_CONTEXT_VERSION,
  type NavigatorContextInput, type NavigatorContextResult, type NavigatorCurrentState,
  type NavigatorSource, type NavigatorSourceManifest,
} from './types';

const NAVIGATOR_TASK = `【Navigator Task】
anchor章を書き終えた直後の現在地を基準に、物語の次の可能性を検討できる状態を構築する。
Actual、Canonical Current State、Plannedを混同しない。`;

const NON_CANON_RULE = `【Proposalの将来ルール】
Story Navigatorが将来生成する提案はすべて非Canonである。作者が明示的に採用するまで、Actual、正式設定、予定へ昇格させない。`;

const KNOWLEDGE_BOUNDARY = `【Authoritative Knowledge Boundary】
StoryFactはAuthor Truth、StoryFactの開示状態はReader Knowledge、CharacterKnowledgeはCharacter Perceptionであり、互いに独立している。
自由記述に矛盾する記述があっても、開示・認識境界は構造化されたStoryFact／CharacterKnowledgeを優先する。
reader-hiddenを「本文で既に明かされた事実」と扱わず、suspectsを確定知識へ、believes_falseを作者の真実へ変換しない。`;

interface SourceRefs {
  chapters?: NavigatorSourceManifest['chapters']; characterIds?: string[]; storyFactIds?: string[]; characterKnowledgeIds?: string[];
  outlineIds?: string[]; plotIds?: string[]; relationshipIds?: string[]; foreshadowingIds?: string[]; storyStateIds?: string[]; worldSettingIds?: string[];
  sceneIds?: string[]; storyNodeIds?: string[]; storyEdgeIds?: string[];
}

interface NavigatorEntry { entry: ContextEntry; refs?: SourceRefs }

function dateString(value?: Date | string): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : String(value);
}

function chapterRef(chapter: NavigatorSource['chapters'][number]) {
  const updatedAt = dateString(chapter.updatedAt);
  return { id: chapter.id, order: chapter.order, ...(updatedAt && { updatedAt }) };
}

function knowledgeText(state: NavigatorCurrentState['canonical']['characterKnowledge'][number]): string {
  const { event, character, fact } = state;
  if (event.status === 'knows') return `${character.name}：真実「${fact.content}」を知っている`;
  if (event.status === 'suspects') return `${character.name}：「${fact.content}」を疑っている（未確定）${event.beliefNotes ? `／${event.beliefNotes}` : ''}`;
  return `${character.name}：作者の真実とは別に「${event.beliefNotes || '内容未設定'}」と信じている`;
}

function buildEntries(source: NavigatorSource, state: NavigatorCurrentState, authorInstruction = ''): NavigatorEntry[] {
  const anchor = state.actual.anchor;
  const project = state.project;
  const entries: NavigatorEntry[] = [
    { entry: { id: 'navigator-task', tier: 0, required: true, full: NAVIGATOR_TASK } },
    { entry: { id: 'proposal-noncanon', tier: 0, required: true, full: NON_CANON_RULE } },
  ];
  if (authorInstruction.trim()) entries.push({ entry: {
    id: 'author-instruction', tier: 0, required: true,
    full: `【今回の作者指示（最優先）】\n${safeContextExcerpt(authorInstruction, 3500)}`,
    compact: `【今回の作者指示（最優先）】\n${safeContextExcerpt(authorInstruction, 1800)}`,
    minimum: `【今回の作者指示（最優先）】\n${safeContextExcerpt(authorInstruction, 700)}`,
  } });
  entries.push(
    { entry: {
      id: 'author-intent', tier: 0, required: true,
      full: `【作者意図（AI提案より上位）】\n${safeContextExcerpt(project.authorIntent || '未設定', 3000)}`,
      compact: `【作者意図（AI提案より上位）】\n${safeContextExcerpt(project.authorIntent || '未設定', 1500)}`,
      minimum: `【作者意図】${safeContextExcerpt(project.authorIntent || '未設定', 500)}`,
    } },
    { entry: {
      id: 'anchor-position', tier: 0, required: true,
      full: `【現在地：anchor章終了直後】\n第${anchor.order + 1}章「${anchor.title || '無題'}」を書き終えた直後。\n章の目的：${anchor.purpose || '未設定'}\n章末：${anchor.endingNotes || '本文と要約から判断'}`,
      minimum: `【現在地】第${anchor.order + 1}章「${anchor.title || '無題'}」終了直後`,
    }, refs: { chapters: [chapterRef(anchor)] } },
    { entry: { id: 'knowledge-boundary', tier: 0, required: true, full: KNOWLEDGE_BOUNDARY } },
    { entry: {
      id: 'project-settings', tier: 0, required: true,
      full: `【Project設定】\n作品名：${project.title}\n概要：${safeContextExcerpt(project.description || '未設定', 1200)}\n視点：${project.narrativePerspective ? displayLabel(NARRATIVE_PERSPECTIVE_LABELS, project.narrativePerspective) : '未設定'}\n文体：${safeContextExcerpt(project.writingStyleNotes || '未設定', 700)}\n視点運用：${safeContextExcerpt(project.povNotes || '未設定', 500)}\n表記：${safeContextExcerpt(project.formattingNotes || '未設定', 500)}`,
      compact: `【Project設定】\n${project.title}\n概要：${safeContextExcerpt(project.description || '未設定', 500)}\n文体：${safeContextExcerpt(project.writingStyleNotes || '未設定', 300)}`,
      minimum: `【Project設定】${project.title}`,
    } },
  );

  if (project.genreGuidanceMode !== 'off') {
    const required = project.genreGuidanceMode === 'required';
    const stance = required ? '作者が必須条件として指定。ただし今回の作者指示・作者意図を上書きしない。' : '参考情報。作者指示・章設定・作者意図より下位。機械的に型を強制しない。';
    entries.push({ entry: {
      id: 'genre-guidance', tier: required ? 0 : 1, required,
      relevance: required ? 0 : 80,
      full: `【ジャンル指針：${required ? '必須' : '参考'}】\nジャンル：${formatSemanticLabel('genre', project.genre)}\n${project.genreGuidanceNotes ? `作者メモ：${safeContextExcerpt(project.genreGuidanceNotes, 1000)}\n` : ''}${stance}`,
      compact: `【ジャンル指針：${required ? '必須' : '参考'}】${formatSemanticLabel('genre', project.genre)}。${safeContextExcerpt(project.genreGuidanceNotes || stance, 450)}`,
      minimum: `【ジャンル指針：${required ? '必須' : '参考'}】${formatSemanticLabel('genre', project.genre)}`,
    } });
  }

  const chapterIndex = state.actual.chapters.map(chapter => `- 第${chapter.order + 1}章「${chapter.title || '無題'}」：${safeContextExcerpt(chapter.summary || chapter.outlineContent || '要約なし', 240)}`).join('\n');
  entries.push({ entry: {
    id: 'actual-chapter-index', tier: 1, relevance: 120,
    full: `【Actual：anchorまでに実際に書かれた章】\n${chapterIndex}`,
    compact: `【Actual章索引】\n${state.actual.chapters.map(chapter => `第${chapter.order + 1}章 ${chapter.title || '無題'}：${safeContextExcerpt(chapter.summary || '要約なし', 100)}`).join('\n')}`,
    minimum: `【Actual章索引】${state.actual.chapters.map(chapter => `${chapter.order + 1}:${chapter.title || '無題'}`).join('／')}`,
  }, refs: { chapters: state.actual.chapters.map(chapterRef) } });

  state.actual.chapters.slice(-3).reverse().forEach((chapter, index) => entries.push({ entry: {
    id: `actual-chapter-detail:${chapter.id}`, tier: 1, relevance: 150 - index,
    full: `【Actual：直近章】\n第${chapter.order + 1}章「${chapter.title || '無題'}」\n要約：${safeContextExcerpt(chapter.summary || '未設定', 1000)}\n本文抜粋：${safeContextExcerpt(chapter.content || '本文なし', 1800, true)}`,
    compact: `【Actual：直近章】第${chapter.order + 1}章「${chapter.title || '無題'}」\n${safeContextExcerpt(chapter.summary || chapter.content || '内容なし', 700, !chapter.summary)}`,
    minimum: `【Actual】第${chapter.order + 1}章「${chapter.title || '無題'}」：${safeContextExcerpt(chapter.summary || '要約なし', 250)}`,
  }, refs: { chapters: [chapterRef(chapter)] } }));

  const cast = anchor.chapterCharacters || [];
  const pov = source.characters.find(character => character.id === (anchor.povCharacterId || project.defaultPovCharacterId));
  const anchorCharacters = [...new Map([...(pov ? [pov] : []), ...cast.map(item => item.character)].map(character => [character.id, character])).values()];
  if (pov || cast.length > 0) entries.push({ entry: {
    id: 'anchor-cast', tier: 1, relevance: 140,
    full: `【Canonical Current State：anchorの視点・人物】\n視点人物：${pov?.name || '未設定'}\n${anchorCharacters.map(character => {
      const castEntry = cast.find(item => item.characterId === character.id);
      return `- ${character.name}（${formatSemanticLabel('characterRole', character.role)}${castEntry ? `／${castEntry.participation}` : ''}）${character.personality ? `\n  性格：${safeContextExcerpt(character.personality, 350)}` : ''}${character.firstPerson ? `／一人称：${character.firstPerson}` : ''}${character.speechStyleNotes ? `\n  話し方：${safeContextExcerpt(character.speechStyleNotes, 350)}` : ''}${castEntry?.notes ? `\n  anchor章での扱い：${safeContextExcerpt(castEntry.notes, 300)}` : ''}`;
    }).join('\n') || '明示Castなし'}`,
    compact: `【anchorの視点・人物】視点：${pov?.name || '未設定'}／${cast.map(item => item.character.name).join('、') || 'Cast未設定'}`,
  }, refs: { characterIds: anchorCharacters.map(character => character.id) } });

  const anchorCharacterIds = new Set(anchorCharacters.map(character => character.id));
  source.characters.filter(character => !anchorCharacterIds.has(character.id)).forEach((character, index) => entries.push({ entry: {
    id: `surrounding-character:${character.id}`, tier: 3, relevance: -index,
    full: `【周辺人物】\n- ${character.name}（${formatSemanticLabel('characterRole', character.role)}）${character.personality ? `：${safeContextExcerpt(character.personality, 350)}` : ''}`,
    compact: `【周辺人物】${character.name}（${formatSemanticLabel('characterRole', character.role)}）`,
    minimum: character.name,
  }, refs: { characterIds: [character.id] } }));

  state.canonical.facts.forEach((item, index) => entries.push({ entry: {
    id: `canonical-fact:${item.fact.id}`, tier: item.fact.importance === 'high' ? 1 : 2, relevance: 140 - index,
    full: `【Canonical Current State：Author Truth／Reader ${item.readerState === 'reader-known' ? 'Known' : 'Hidden'}】\n- ${item.fact.content}${item.fact.notes ? `\n  作者メモ：${safeContextExcerpt(item.fact.notes, 500)}` : ''}${item.plannedRevealInFuture ? '\n  Planned：anchorより後に開示予定（まだActualではない）' : ''}`,
    compact: `【Author Truth／${item.readerState}】${item.fact.content}${item.plannedRevealInFuture ? '（将来開示予定）' : ''}`,
    minimum: `【${item.readerState}】${safeContextExcerpt(item.fact.content, 220)}`,
  }, refs: { storyFactIds: [item.fact.id] } }));

  state.canonical.characterKnowledge.forEach((item, index) => entries.push({ entry: {
    id: `canonical-knowledge:${item.event.id}`, tier: 1, relevance: 130 - index,
    full: `【Canonical Current State：Character Perception】\n- ${knowledgeText(item)}${item.event.notes ? `\n  作者メモ：${safeContextExcerpt(item.event.notes, 400)}` : ''}`,
    compact: `【Character Perception】${knowledgeText(item)}`,
    minimum: `【人物認識】${item.character.name}：${item.event.status}`,
  }, refs: { storyFactIds: [item.fact.id], characterKnowledgeIds: [item.event.id] } }));

  state.canonical.storyStates.forEach((item, index) => entries.push({ entry: {
    id: `canonical-state:${item.id}`, tier: 1, relevance: 110 - index,
    full: `【Canonical Current State：StoryState】\n- ${item.type}：${safeContextExcerpt(item.data, 900)}（第${item.chapter.order + 1}章時点）`,
    compact: `【StoryState】${item.type}：${safeContextExcerpt(item.data, 400)}`,
    minimum: `【StoryState】${item.type}：${safeContextExcerpt(item.data, 150)}`,
  }, refs: { storyStateIds: [item.id] } }));

  state.canonical.relationships.forEach((item, index) => entries.push({ entry: {
    id: `relationship:${item.id}`, tier: 2, relevance: 80 - index,
    full: `【Canonical Current State：人物関係】\n- ${item.fromCharacter?.name || item.fromCharacterId} → ${item.toCharacter?.name || item.toCharacterId}：${formatSemanticLabel('relationship', item.type)}${item.description ? `。${safeContextExcerpt(item.description, 500)}` : ''}${item.addressTerm ? `／呼称：${item.addressTerm}` : ''}`,
    compact: `【人物関係】${item.fromCharacter?.name || item.fromCharacterId} → ${item.toCharacter?.name || item.toCharacterId}：${formatSemanticLabel('relationship', item.type)}`,
  }, refs: { relationshipIds: [item.id] } }));

  const latestOutline = state.planned.outlines[0];
  if (latestOutline) entries.push({ entry: { id: `planned-outline:${latestOutline.id}`, tier: 2, relevance: 100, full: `【Planned：全体プロット（Actualではない）】\n${safeContextExcerpt(latestOutline.content, 3000)}`, compact: `【Planned：全体プロット】\n${safeContextExcerpt(latestOutline.content, 1200)}`, minimum: `【Planned】${safeContextExcerpt(latestOutline.content, 400)}` }, refs: { outlineIds: [latestOutline.id] } });
  state.planned.plots.forEach((item, index) => entries.push({ entry: { id: `planned-plot:${item.id}`, tier: 2, relevance: 100 + item.priority - index, full: `【Planned：${item.status} Plot（Actualではない）】\n- ${item.name}：${safeContextExcerpt(item.description || '詳細未設定', 900)}`, compact: `【Planned Plot】${item.name}：${safeContextExcerpt(item.description || '未設定', 400)}`, minimum: `【Planned Plot】${item.name}` }, refs: { plotIds: [item.id] } }));
  state.planned.foreshadowings.forEach((item, index) => entries.push({ entry: { id: `planned-foreshadowing:${item.id}`, tier: 2, relevance: 90 - index, full: `【Planned：未回収要素】\n- ${safeContextExcerpt(item.content, 700)}（想定回収章：${item.expectedResolveChapter || '未定'}／${item.importance}）\nこれは正式な未回収設定だが、回収済みのActualではない。`, compact: `【Planned：未回収要素】${safeContextExcerpt(item.content, 350)}`, minimum: `【未回収要素】${safeContextExcerpt(item.content, 160)}` }, refs: { foreshadowingIds: [item.id] } }));
  state.planned.futureKnowledge.forEach((item, index) => entries.push({ entry: { id: `planned-knowledge:${item.event.id}`, tier: 2, relevance: 80 - index, full: `【Planned：将来の人物認識変化（現在状態ではない）】\n- 第${(item.event.effectiveChapter?.order || 0) + 1}章予定：${knowledgeText(item)}`, compact: `【将来の人物認識】${item.character.name}：${item.event.status}`, minimum: `【将来認識】${item.character.name}` }, refs: { storyFactIds: [item.fact.id], characterKnowledgeIds: [item.event.id] } }));
  state.canonical.worldSettings.forEach((item, index) => entries.push({ entry: { id: `world:${item.id}`, tier: 2, relevance: 40 - index, full: `【Canonical Current State：World設定】\n- ${item.name}${item.rules ? `\n  ルール：${safeContextExcerpt(item.rules, 700)}` : ''}${item.description ? `\n  説明：${safeContextExcerpt(item.description, 600)}` : ''}`, compact: `【World設定】${item.name}：${safeContextExcerpt(item.rules || item.description || '', 350)}`, minimum: `【World】${item.name}` }, refs: { worldSettingIds: [item.id] } }));
  state.canonical.scenes.forEach((item, index) => entries.push({ entry: { id: `scene:${item.id}`, tier: 2, relevance: 30 - index, full: `【Canonical Current State：Scene設定】\n- ${item.name}（${item.location || '場所未設定'}）：${safeContextExcerpt(item.description, 500)}`, compact: `【Scene】${item.name}：${item.location || '場所未設定'}`, minimum: `【Scene】${item.name}` }, refs: { sceneIds: [item.id] } }));
  state.planned.storyNodes.forEach((item, index) => entries.push({ entry: { id: `node:${item.id}`, tier: 3, relevance: 20 - index, full: `【Story Node】${item.title}：${safeContextExcerpt(item.description, 500)}`, compact: `【Story Node】${item.title}`, minimum: item.title }, refs: { storyNodeIds: [item.id] } }));
  state.planned.storyEdges.forEach((item, index) => entries.push({ entry: { id: `edge:${item.id}`, tier: 3, relevance: 10 - index, full: `【Story Edge】${item.sourceNode?.title || item.sourceId} → ${item.targetNode?.title || item.targetId}（${item.edgeType}${item.label ? `：${item.label}` : ''}）`, minimum: `【Edge】${item.sourceId}→${item.targetId}` }, refs: { storyEdgeIds: [item.id] } }));
  return entries;
}

function unique(values: string[]): string[] { return [...new Set(values)]; }

export function buildNavigatorContext(source: NavigatorSource, authorInstruction = ''): NavigatorContextResult {
  const currentState = deriveNavigatorCurrentState(source);
  const navigatorEntries = buildEntries(source, currentState, authorInstruction);
  const result = buildContextWithinBudget(navigatorEntries.map(item => item.entry), STORY_NAVIGATOR_CONTEXT_HARD_CAP);
  const included = new Set(result.included.map(item => item.id));
  const refs = navigatorEntries.filter(item => included.has(item.entry.id)).map(item => item.refs || {});
  const manifest: NavigatorSourceManifest = {
    version: STORY_NAVIGATOR_CONTEXT_VERSION,
    anchor: { id: source.anchor.id, order: source.anchor.order },
    chapters: [...new Map(refs.flatMap(item => item.chapters || []).map(item => [item.id, item])).values()],
    characterIds: unique(refs.flatMap(item => item.characterIds || [])),
    storyFactIds: unique(refs.flatMap(item => item.storyFactIds || [])),
    characterKnowledgeIds: unique(refs.flatMap(item => item.characterKnowledgeIds || [])),
    outlineIds: unique(refs.flatMap(item => item.outlineIds || [])),
    plotIds: unique(refs.flatMap(item => item.plotIds || [])),
    relationshipIds: unique(refs.flatMap(item => item.relationshipIds || [])),
    foreshadowingIds: unique(refs.flatMap(item => item.foreshadowingIds || [])),
    storyStateIds: unique(refs.flatMap(item => item.storyStateIds || [])),
    worldSettingIds: unique(refs.flatMap(item => item.worldSettingIds || [])),
    sceneIds: unique(refs.flatMap(item => item.sceneIds || [])),
    storyNodeIds: unique(refs.flatMap(item => item.storyNodeIds || [])),
    storyEdgeIds: unique(refs.flatMap(item => item.storyEdgeIds || [])),
    omittedSections: result.omitted,
    finalContextLength: result.text.length,
  };
  return { context: result.text, manifest, currentState };
}

export async function buildStoryNavigatorContext(input: NavigatorContextInput): Promise<NavigatorContextResult> {
  const source = await loadNavigatorSource(input.projectId, input.anchorChapterId);
  return buildNavigatorContext(source, input.authorInstruction);
}
