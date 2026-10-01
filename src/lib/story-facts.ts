import type { ContextEntry } from '@/lib/prompts/ja/context-budget';

export const STORY_FACT_IMPORTANCE = ['low', 'medium', 'high'] as const;
export type StoryFactImportance = typeof STORY_FACT_IMPORTANCE[number];
export type StoryFactAudience = 'reader-known' | 'reveal-now' | 'hidden-relevant' | 'excluded';

export const STORY_FACT_REVIEW_GUIDANCE = `作者専用の事実が予定より早く直接開示されていないか確認する。
開示予定の事実は本文で確認できるかを示すが、未開示を機械的に誤りと断定しない。
読者に開示済みの事実は、読者が知らない前提で扱われていないか確認する。`;

export interface StoryFactChapterRef { id: string; order: number; title?: string }
export interface StoryFactValue {
  id: string;
  content: string;
  importance: string;
  readerInitiallyKnows: boolean;
  plannedRevealChapterId?: string | null;
  revealedChapterId?: string | null;
  notes?: string;
  plannedRevealChapter?: StoryFactChapterRef | null;
  revealedChapter?: StoryFactChapterRef | null;
}

export interface StoryFactContext {
  chapterId: string;
  chapterOrder: number;
  chapterText: string;
}

export function validateStoryFactInput(value: Record<string, unknown>, partial = false): string | null {
  if (!partial || value.content !== undefined) {
    if (typeof value.content !== 'string' || !value.content.trim()) return '事実の内容を入力してください';
  }
  if (!partial || value.importance !== undefined) {
    if (!STORY_FACT_IMPORTANCE.includes(value.importance as StoryFactImportance)) return '重要度が不正です';
  }
  if (!partial || value.readerInitiallyKnows !== undefined) {
    if (typeof value.readerInitiallyKnows !== 'boolean') return '読者の初期認識は真偽値で指定してください';
  }
  for (const key of ['plannedRevealChapterId', 'revealedChapterId'] as const) {
    if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'string') return `${key}が不正です`;
  }
  if (value.notes !== undefined && typeof value.notes !== 'string') return 'メモが不正です';
  return null;
}

function relevanceTerms(text: string): string[] {
  return [...new Set(text
    .split(/[\s、。！？「」『』（）・,:：;；]|(?:から|まで|として|による|は|が|を|に|で|と|の|へ|も)/)
    .map(value => value.trim())
    .filter(value => value.length >= 2))];
}

export function isStoryFactRelevant(fact: StoryFactValue, chapterText: string): boolean {
  const normalizedChapter = chapterText.trim();
  if (!normalizedChapter) return false;
  const terms = relevanceTerms(`${fact.content}\n${fact.notes || ''}`);
  return terms.some(term => normalizedChapter.includes(term));
}

export function classifyStoryFact(fact: StoryFactValue, context: StoryFactContext): StoryFactAudience {
  if (fact.readerInitiallyKnows) return isStoryFactRelevant(fact, context.chapterText) ? 'reader-known' : 'excluded';
  const revealedOrder = fact.revealedChapter?.order;
  if (typeof revealedOrder === 'number' && revealedOrder < context.chapterOrder) {
    return isStoryFactRelevant(fact, context.chapterText) || revealedOrder === context.chapterOrder - 1 ? 'reader-known' : 'excluded';
  }
  if (fact.revealedChapterId === context.chapterId || fact.plannedRevealChapterId === context.chapterId) return 'reveal-now';

  const relevantByText = isStoryFactRelevant(fact, context.chapterText);
  const plannedOrder = fact.plannedRevealChapter?.order;
  const nearPlannedReveal = typeof plannedOrder === 'number'
    && plannedOrder > context.chapterOrder
    && plannedOrder <= context.chapterOrder + 1;
  return relevantByText || nearPlannedReveal ? 'hidden-relevant' : 'excluded';
}

export function buildStoryFactContextEntries(facts: StoryFactValue[], context: StoryFactContext): ContextEntry[] {
  const groups = new Map<Exclude<StoryFactAudience, 'excluded'>, StoryFactValue[]>([
    ['reader-known', []], ['reveal-now', []], ['hidden-relevant', []],
  ]);
  for (const fact of facts) {
    const audience = classifyStoryFact(fact, context);
    if (audience !== 'excluded') groups.get(audience)?.push(fact);
  }
  const definitions = {
    'reveal-now': { title: '【この章で読者へ開示してよい事実】', tier: 1 as const, relevance: 145, suffix: '開示予定であり、必ず開示する絶対条件ではない。' },
    'reader-known': { title: '【読者に開示済みの重要事実】', tier: 2 as const, relevance: 130, suffix: '読者がすでに知っている前提と矛盾させない。' },
    'hidden-relevant': { title: '【作者専用：この章では直接明かさない事実】', tier: 2 as const, relevance: 140, suffix: '本文で直接明かさず、矛盾防止や伏線の整合性にのみ利用する。' },
  };
  return (['reveal-now', 'reader-known', 'hidden-relevant'] as const).flatMap(audience => {
    const definition = definitions[audience];
    return (groups.get(audience) || []).map((fact, index) => ({
      id: `story-fact:${audience}:${fact.id}`,
      tier: definition.tier,
      relevance: definition.relevance - index,
      full: `${definition.title}\n- ${fact.content}${fact.notes ? `\n  作者メモ：${fact.notes}` : ''}\n  ${definition.suffix}`,
      compact: `${definition.title}\n- ${fact.content}\n  ${definition.suffix}`,
      minimum: `${definition.title}\n- ${fact.content}`,
    }));
  });
}
