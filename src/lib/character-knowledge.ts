import type { ContextEntry } from '@/lib/prompts/ja/context-budget';
import { classifyStoryFact, type StoryFactContext, type StoryFactValue } from '@/lib/story-facts';

export const CHARACTER_KNOWLEDGE_STATUSES = ['knows', 'suspects', 'believes_false'] as const;
export type CharacterKnowledgeStatus = typeof CHARACTER_KNOWLEDGE_STATUSES[number];

export interface KnowledgeCharacter { id: string; name: string }
export interface CharacterKnowledgeEvent {
  id: string;
  factId: string;
  characterId: string;
  status: string;
  effectiveChapterId?: string | null;
  beliefNotes?: string;
  notes?: string;
  effectiveChapter?: { id: string; order: number; title?: string } | null;
  character?: KnowledgeCharacter;
  fact?: StoryFactValue;
}

export interface CharacterKnowledgeState {
  startingState: CharacterKnowledgeEvent | null;
  currentChapterChange: CharacterKnowledgeEvent | null;
}

export const CHARACTER_KNOWLEDGE_REVIEW_GUIDANCE = `POV人物が章開始時点で知らない作者専用の真実を、内面で確定していないか確認する。
疑いを確定知識として扱っていないか、誤認している人物が理由なく真実を前提にしていないか確認する。
現在章の認識変化より前に新しい認識を使っていないか、非POV人物の台詞や行動から秘密が不自然に漏れていないか確認する。
本文だけで変化の瞬間を特定できない場合は、誤りと断定せず確認事項として示す。`;

export function validateCharacterKnowledgeInput(value: Record<string, unknown>, partial = false): string | null {
  if (!partial || value.factId !== undefined) if (typeof value.factId !== 'string' || !value.factId) return 'factId is required';
  if (!partial || value.characterId !== undefined) if (typeof value.characterId !== 'string' || !value.characterId) return 'characterId is required';
  if (!partial || value.status !== undefined) {
    if (!CHARACTER_KNOWLEDGE_STATUSES.includes(value.status as CharacterKnowledgeStatus)) return '認識状態が不正です';
    if (value.status === 'believes_false' && (typeof value.beliefNotes !== 'string' || !value.beliefNotes.trim())) return '誤認内容を入力してください';
  }
  if (value.effectiveChapterId !== undefined && value.effectiveChapterId !== null && typeof value.effectiveChapterId !== 'string') return 'effectiveChapterIdが不正です';
  if (value.beliefNotes !== undefined && typeof value.beliefNotes !== 'string') return '認識内容が不正です';
  if (value.notes !== undefined && typeof value.notes !== 'string') return '作者メモが不正です';
  return null;
}

export function deriveCharacterKnowledgeState(events: CharacterKnowledgeEvent[], chapterId: string, chapterOrder: number): CharacterKnowledgeState {
  const eligible = events.filter(event => event.effectiveChapterId === null || event.effectiveChapterId === undefined || typeof event.effectiveChapter?.order === 'number');
  const startEvents = eligible.filter(event => event.effectiveChapterId === null || event.effectiveChapterId === undefined);
  const pastEvents = eligible.filter(event => typeof event.effectiveChapter?.order === 'number' && event.effectiveChapter.order < chapterOrder)
    .sort((a, b) => (b.effectiveChapter?.order || 0) - (a.effectiveChapter?.order || 0));
  const currentChapterChange = eligible.find(event => event.effectiveChapterId === chapterId) || null;
  return { startingState: pastEvents[0] || startEvents[0] || null, currentChapterChange };
}

function stateText(event: CharacterKnowledgeEvent | null, fact: StoryFactValue, hidden: boolean): string {
  if (!event) return hidden
    ? `この作者専用の真実を知っている設定はない。内面や台詞で確定事実として扱わない（本文に「知らない」と説明する必要はない）。`
    : '明示的な認識設定なし。';
  if (event.status === 'knows') return `真実として知っている：${fact.content}${event.beliefNotes ? `（${event.beliefNotes}）` : ''}`;
  if (event.status === 'suspects') return `確定していない疑いとして扱う：${fact.content}${event.beliefNotes ? `（${event.beliefNotes}）` : ''}`;
  return `作者の真実「${fact.content}」とは異なり、「${event.beliefNotes}」と信じている。作者の真実を人物の認識へ漏らさない。`;
}

export function buildCharacterKnowledgeContextEntries(args: {
  facts: StoryFactValue[];
  events: CharacterKnowledgeEvent[];
  characters: KnowledgeCharacter[];
  factContext: StoryFactContext;
  povCharacterId?: string | null;
  perspective?: string | null;
}): ContextEntry[] {
  const currentChangeFactIds = new Set(args.events.filter(event => event.effectiveChapterId === args.factContext.chapterId).map(event => event.factId));
  const relevantFacts = args.facts.filter(fact => classifyStoryFact(fact, { ...args.factContext, forceRelevantFactIds: currentChangeFactIds }) !== 'excluded');
  const strongPov = ['first_person', 'third_person_limited', 'third_person_multiple'].includes(args.perspective || '');
  const objective = args.perspective === 'third_person_objective';
  const entries: ContextEntry[] = [];
  for (const fact of relevantFacts) {
    const audience = classifyStoryFact(fact, { ...args.factContext, forceRelevantFactIds: currentChangeFactIds });
    const hidden = audience === 'hidden-relevant';
    for (const [index, character] of args.characters.entries()) {
      const state = deriveCharacterKnowledgeState(args.events.filter(event => event.factId === fact.id && event.characterId === character.id), args.factContext.chapterId, args.factContext.chapterOrder);
      const isPov = character.id === args.povCharacterId;
      if (!state.startingState && !state.currentChapterChange && !(isPov && hidden)) continue;
      const scope = isPov ? 'POV人物' : '登場人物';
      const narrationRule = isPov && strongPov ? 'POVの内面・地の文にこの認識境界を強く適用する。' : objective ? '台詞・行動・反応・情報漏洩の整合性に使用し、客観描写へ内面を追加しない。' : '台詞・行動・反応の整合性に使用する。';
      const startingAuthorNote = state.startingState?.notes ? `\n- 作者向け運用メモ：${state.startingState.notes}` : '';
      entries.push({
        id: `knowledge:start:${fact.id}:${character.id}`, tier: isPov ? 1 : 2, relevance: isPov ? 144 : 125 - index,
        full: `【${scope}の章開始時点の認識】\n${character.name}\n- ${stateText(state.startingState, fact, hidden)}${startingAuthorNote}\n- ${narrationRule}`,
        compact: `【${scope}の章開始時点の認識】\n${character.name}：${stateText(state.startingState, fact, hidden)}`,
        minimum: `【人物認識】${character.name}：${stateText(state.startingState, fact, hidden)}`,
      });
      if (state.currentChapterChange) entries.push({
        id: `knowledge:change:${fact.id}:${character.id}`, tier: isPov ? 1 : 2, relevance: isPov ? 145 : 130 - index,
        full: `【この章で予定されている認識変化】\n${character.name}\n- ${stateText(state.currentChapterChange, fact, false)}${state.currentChapterChange.notes ? `\n- 作者向け運用メモ：${state.currentChapterChange.notes}` : ''}\n- この認識は章開始時点ではなく、章中の変化後にのみ使用する。`,
        compact: `【この章での認識変化】${character.name}：${stateText(state.currentChapterChange, fact, false)}（章中の変化後から有効）`,
        minimum: `【認識変化】${character.name}：章中に${state.currentChapterChange.status}へ変化`,
      });
    }
  }
  return entries;
}
