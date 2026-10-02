import { db } from '@/lib/db';
import { createChatCompletion } from '@/lib/ai-client';
import { buildStoryNavigatorContext } from './context';
import { STORY_NAVIGATOR_SYSTEM_PROMPT } from '@/lib/prompts/ja/story-navigator';
import { buildContextWithinBudget, safeContextExcerpt } from '@/lib/prompts/ja/context-budget';
import { extractJsonObject } from './json-extraction';

export const EXPLORATION_PROMPT_VERSION = '3b4-v1';
export const EXPLORATION_BATCH_HARD_CAP = 12_000;
export type ExplorationRangeMode = 'all' | 'recent' | 'range';
export interface ExplorationChapter { id: string; order: number; title: string; content: string }
export interface ExplorationInput { projectId: string; anchorChapterId: string; rangeMode: ExplorationRangeMode; recentCount?: number; startChapterId?: string; endChapterId?: string }
export interface ObservationDraft { observationKey: string; sourceChapterId: string; excerpt: string; elementSummary: string; reasonInteresting: string }
export interface CandidateDraft { observationKey: string; possibleUses: string[]; currentStoryRelation: string; authorIntentRelation: string; risks: string[]; relevance: 'high' | 'medium' | 'low' }

const nonEmpty = (value: unknown, max = 4000): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const strings = (value: unknown, maxItems = 20, maxString = 1000): value is string[] => Array.isArray(value) && value.length <= maxItems && value.every(item => nonEmpty(item, maxString));

export function selectExplorationChapters(chapters: ExplorationChapter[], anchorOrder: number, input: Pick<ExplorationInput, 'rangeMode' | 'recentCount' | 'startChapterId' | 'endChapterId'>): ExplorationChapter[] {
  const eligible = chapters.filter(chapter => chapter.order <= anchorOrder && chapter.content.trim()).sort((a, b) => a.order - b.order);
  if (input.rangeMode === 'recent') return eligible.slice(-Math.max(1, Math.min(50, input.recentCount || 5)));
  if (input.rangeMode === 'range') {
    const start = eligible.find(chapter => chapter.id === input.startChapterId);
    const end = eligible.find(chapter => chapter.id === input.endChapterId);
    if (!start || !end) throw new Error('探索範囲の章が同一Projectのanchor以前に存在しません');
    const [min, max] = start.order <= end.order ? [start.order, end.order] : [end.order, start.order];
    return eligible.filter(chapter => chapter.order >= min && chapter.order <= max);
  }
  return eligible;
}

export function splitChapterForExploration(chapter: ExplorationChapter, maxCharacters = 7_000): Array<ExplorationChapter & { part: number }> {
  const paragraphs = chapter.content.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  const push = () => { if (current) chunks.push(current); current = ''; };
  for (const paragraph of paragraphs.length ? paragraphs : [chapter.content]) {
    if (paragraph.length > maxCharacters) {
      push();
      for (let offset = 0; offset < paragraph.length; offset += maxCharacters) chunks.push(paragraph.slice(offset, offset + maxCharacters));
    } else if (!current || current.length + 2 + paragraph.length <= maxCharacters) current += `${current ? '\n\n' : ''}${paragraph}`;
    else { push(); current = paragraph; }
  }
  push();
  return chunks.map((content, part) => ({ ...chapter, content, part }));
}

export function parseExplorationObservations(raw: string, allowedChapterId: string): Omit<ObservationDraft, 'observationKey'>[] {
  const value = extractJsonObject(raw) as Record<string, unknown>;
  if (value.schemaVersion !== 1 || !Array.isArray(value.observations) || value.observations.length > 50) throw new Error('Malformed exploration observations');
  return value.observations.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Malformed observation ${index}`);
    const row = item as Record<string, unknown>;
    if (row.sourceChapterId !== allowedChapterId || !nonEmpty(row.excerpt, 1200) || !nonEmpty(row.elementSummary, 500) || !nonEmpty(row.reasonInteresting, 1200)) throw new Error(`Malformed observation ${index}`);
    return { sourceChapterId: row.sourceChapterId, excerpt: row.excerpt.trim(), elementSummary: row.elementSummary.trim(), reasonInteresting: row.reasonInteresting.trim() };
  });
}

export function parseExplorationCandidates(raw: string, keys: Set<string>): CandidateDraft[] {
  const value = extractJsonObject(raw) as Record<string, unknown>;
  if (value.schemaVersion !== 1 || !Array.isArray(value.candidates) || value.candidates.length > keys.size || value.candidates.length > 200) throw new Error('Malformed exploration candidates');
  const seen = new Set<string>();
  return value.candidates.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Malformed candidate ${index}`);
    const row = item as Record<string, unknown>;
    if (!nonEmpty(row.observationKey, 200) || !keys.has(row.observationKey) || !strings(row.possibleUses) || !nonEmpty(row.currentStoryRelation, 2000) || !nonEmpty(row.authorIntentRelation, 2000) || !strings(row.risks) || !['high', 'medium', 'low'].includes(String(row.relevance))) throw new Error(`Malformed candidate ${index}`);
    if (seen.has(row.observationKey)) throw new Error(`Duplicate candidate ${row.observationKey}`);
    seen.add(row.observationKey);
    return row as unknown as CandidateDraft;
  });
}

function normalized(value: string) { return value.normalize('NFKC').toLowerCase().replace(/[\s、。！？「」『』（）・,.:;；：]/g, ''); }
export function dedupeObservations(values: ObservationDraft[]): ObservationDraft[] {
  const seenExcerpts = new Map<string, string[]>();
  const seenSummaries = new Set<string>();
  return values.filter(value => {
    const excerpt = normalized(value.excerpt);
    const summary = normalized(value.elementSummary);
    const chapterExcerpts = seenExcerpts.get(value.sourceChapterId) || [];
    const summaryKey = `${value.sourceChapterId}:${summary}`;
    const similar = seenSummaries.has(summaryKey) || chapterExcerpts.some(existing => existing === excerpt || existing.includes(excerpt) || excerpt.includes(existing));
    if (similar) return false;
    seenExcerpts.set(value.sourceChapterId, [...chapterExcerpts, excerpt]);
    seenSummaries.add(summaryKey);
    return true;
  });
}

export function assertObservationProvenance(observation: Pick<ObservationDraft, 'sourceChapterId' | 'excerpt'>, chapters: ExplorationChapter[]): void {
  const chapter = chapters.find(value => value.id === observation.sourceChapterId);
  if (!chapter || !chapter.content.includes(observation.excerpt)) throw new Error('AIが返したsource excerptはChapter本文に存在しません');
}

export async function generateExplorationRun(input: ExplorationInput, dependencies: { database?: typeof db; complete?: typeof createChatCompletion; buildContext?: typeof buildStoryNavigatorContext } = {}) {
  const database = dependencies.database || db;
  const complete = dependencies.complete || createChatCompletion;
  const anchor = await database.chapter.findFirst({ where: { id: input.anchorChapterId, projectId: input.projectId }, select: { id: true, order: true } });
  if (!anchor) throw new Error('探索anchorが同一Projectに存在しません');
  const all = await database.chapter.findMany({ where: { projectId: input.projectId, order: { lte: anchor.order } }, select: { id: true, order: true, title: true, content: true }, orderBy: { order: 'asc' } });
  const chapters = selectExplorationChapters(all, anchor.order, input);
  if (!chapters.length) throw new Error('探索できる本文がありません');
  const batches = chapters.flatMap(chapter => splitChapterForExploration(chapter));
  const run = await database.storyNavigatorExplorationRun.create({ data: { projectId: input.projectId, anchorChapterId: input.anchorChapterId, rangeMode: input.rangeMode, startChapterId: input.startChapterId || null, endChapterId: input.endChapterId || null, recentCount: input.recentCount || null, promptVersion: EXPLORATION_PROMPT_VERSION, sourceManifest: JSON.stringify({ chapterIds: chapters.map(item => item.id), batches: batches.map(item => ({ chapterId: item.id, part: item.part, length: item.content.length })) }), totalBatches: batches.length } });
  try {
    const observations: ObservationDraft[] = [];
    for (const [batchIndex, batch] of batches.entries()) {
      const task = `過去本文から、後で意味を与えられる可能性がある具体的要素を0件以上抽出する。伏線だったと断定せず、作者の意図を推測せず、本文を書き換えない。\nJSONのみ：{"schemaVersion":1,"observations":[{"sourceChapterId":"${batch.id}","excerpt":"本文に完全一致する短い引用","elementSummary":"要素","reasonInteresting":"活用可能性"}]}`;
      const prompt = buildContextWithinBudget([{ id: 'task', tier: 0, required: true, full: task }, { id: 'source', tier: 0, required: true, full: `【出典】第${batch.order + 1}章「${batch.title}」 part ${batch.part + 1}\n${batch.content}`, compact: `【出典】${batch.content}`, minimum: safeContextExcerpt(batch.content, 3000) }], EXPLORATION_BATCH_HARD_CAP).text;
      const raw = await complete({ messages: [{ role: 'system', content: STORY_NAVIGATOR_SYSTEM_PROMPT }, { role: 'user', content: prompt }], temperature: 0.3, max_tokens: 2500 });
      for (const item of parseExplorationObservations(raw, batch.id)) {
        assertObservationProvenance(item, chapters);
        observations.push({ ...item, observationKey: `${item.sourceChapterId}:${observations.length}` });
      }
      await database.storyNavigatorExplorationRun.update({ where: { id: run.id }, data: { processedBatches: batchIndex + 1 } });
    }
    const unique = dedupeObservations(observations);
    if (!unique.length) return await database.storyNavigatorExplorationRun.update({ where: { id: run.id }, data: { status: 'completed', completedAt: new Date(), processedBatches: batches.length }, include: { observations: true } });
    const context = await (dependencies.buildContext || buildStoryNavigatorContext)({ projectId: input.projectId, anchorChapterId: input.anchorChapterId });
    const observationText = unique.map(item => `- key=${item.observationKey}／第${chapters.find(ch => ch.id === item.sourceChapterId)!.order + 1}章／${item.elementSummary}／引用：${item.excerpt}`).join('\n');
    const task = `次の過去要素を現在地と照合し、活用可能性として整理する。過去要素を伏線・Canonと断定しない。JSONのみ：{"schemaVersion":1,"candidates":[{"observationKey":"key","possibleUses":["可能性"],"currentStoryRelation":"現在地との関係","authorIntentRelation":"作者意図との関係","risks":["後付け等の危険"],"relevance":"high|medium|low"}]}`;
    const stage2 = buildContextWithinBudget([{ id: 'task', tier: 0, required: true, full: task }, { id: 'current', tier: 0, required: true, full: context.context, compact: safeContextExcerpt(context.context, 9000), minimum: safeContextExcerpt(context.context, 4500) }, { id: 'observations', tier: 0, required: true, full: observationText, compact: safeContextExcerpt(observationText, 5000), minimum: safeContextExcerpt(observationText, 2500) }], 18_000).text;
    const candidates = parseExplorationCandidates(await complete({ messages: [{ role: 'system', content: STORY_NAVIGATOR_SYSTEM_PROMPT }, { role: 'user', content: stage2 }], temperature: 0.5, max_tokens: 3500 }), new Set(unique.map(item => item.observationKey)));
    const byKey = new Map(unique.map(item => [item.observationKey, item]));
    return await database.$transaction(async transaction => {
      await transaction.storyNavigatorObservation.createMany({ data: candidates.map(candidate => { const observation = byKey.get(candidate.observationKey)!; const chapter = chapters.find(item => item.id === observation.sourceChapterId)!; return { runId: run.id, projectId: input.projectId, sourceChapterId: chapter.id, sourceChapterOrder: chapter.order, sourceChapterTitle: chapter.title, sourceExcerpt: observation.excerpt, elementSummary: observation.elementSummary, reasonInteresting: observation.reasonInteresting, possibleUses: JSON.stringify(candidate.possibleUses), currentStoryRelation: candidate.currentStoryRelation, authorIntentRelation: candidate.authorIntentRelation, risks: JSON.stringify(candidate.risks), relevance: candidate.relevance, decisionStatus: 'undecided' }; }) });
      return transaction.storyNavigatorExplorationRun.update({ where: { id: run.id }, data: { status: 'completed', completedAt: new Date(), processedBatches: batches.length }, include: { observations: { orderBy: { createdAt: 'asc' } } } });
    });
  } catch (error) {
    await database.storyNavigatorExplorationRun.update({ where: { id: run.id }, data: { status: 'failed', error: error instanceof Error ? error.message : 'Exploration failed', completedAt: new Date() } });
    throw error;
  }
}
