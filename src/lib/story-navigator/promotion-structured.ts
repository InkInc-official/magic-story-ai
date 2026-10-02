export const PROMOTION_SOURCE_TYPES = ['navigator_proposal', 'navigator_observation'] as const;
export const PROMOTION_TARGET_TYPES = ['plot', 'foreshadowing'] as const;
export const PROMOTION_REVIEW_STATUSES = ['approved', 'rejected'] as const;
export type PromotionSourceType = typeof PROMOTION_SOURCE_TYPES[number];
export type PromotionTargetType = typeof PROMOTION_TARGET_TYPES[number];
const PLOT_TYPES = ['main', 'sub', 'task', 'dungeon', 'scene', 'event'] as const;
const IMPORTANCE = ['low', 'medium', 'high'] as const;
const text = (value: unknown, max = 4000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const integer = (value: unknown, fallback = 0) => Number.isInteger(value) ? value as number : fallback;

export class PromotionError extends Error { constructor(message: string, public status = 400) { super(message); } }
export interface PlotPromotionPayload { name: string; description: string; plotType: typeof PLOT_TYPES[number]; priority: number; status: 'planned'; tags: string[]; order: number }
export interface ForeshadowingPromotionPayload { chapterId: string; content: string; expectedResolveChapter: number; status: 'planted'; importance: typeof IMPORTANCE[number] }
export type PromotionDraftAction = { targetType: 'plot'; operation: 'create'; reason: string; payload: PlotPromotionPayload } | { targetType: 'foreshadowing'; operation: 'create'; reason: string; payload: ForeshadowingPromotionPayload };

export function validatePromotionDraft(value: unknown, chapterIds: ReadonlySet<string>): PromotionDraftAction[] {
  if (!value || typeof value !== 'object') throw new PromotionError('昇格案の形式が不正です');
  const actions = (value as Record<string, unknown>).actions;
  if (!Array.isArray(actions) || actions.length > 8) throw new PromotionError('昇格Actionは0〜8件で指定してください');
  return actions.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new PromotionError(`Action ${index + 1}の形式が不正です`);
    const item = raw as Record<string, unknown>;
    if (!PROMOTION_TARGET_TYPES.includes(item.targetType as PromotionTargetType)) throw new PromotionError(`Action ${index + 1}のtargetTypeは許可されていません`);
    if (item.operation !== 'create') throw new PromotionError('Phase 3B-5ではcreateのみ許可されています');
    if (!item.payload || typeof item.payload !== 'object') throw new PromotionError(`Action ${index + 1}のpayloadが不正です`);
    const payload = item.payload as Record<string, unknown>; const reason = text(item.reason, 1000);
    if (!reason) throw new PromotionError(`Action ${index + 1}のreasonが必要です`);
    if (item.targetType === 'plot') {
      const name = text(payload.name, 200); if (!name) throw new PromotionError('Plot名が必要です');
      if (!PLOT_TYPES.includes(payload.plotType as typeof PLOT_TYPES[number]) || payload.status !== 'planned' || !Number.isInteger(payload.priority) || !Number.isInteger(payload.order)) throw new PromotionError('Plot payloadのenumまたは数値が不正です');
      if (!Array.isArray(payload.tags) || payload.tags.length > 20 || !payload.tags.every(tag => typeof tag === 'string' && tag.trim() && tag.length <= 100)) throw new PromotionError('Plot tagsが不正です');
      const plotType = payload.plotType as typeof PLOT_TYPES[number];
      const tags = payload.tags.map(tag => text(tag, 100));
      return { targetType: 'plot', operation: 'create', reason, payload: { name, description: text(payload.description), plotType, priority: Math.max(0, Math.min(100, integer(payload.priority))), status: 'planned', tags, order: Math.max(0, integer(payload.order)) } };
    }
    const chapterId = text(payload.chapterId, 200); const content = text(payload.content);
    if (!chapterId || !chapterIds.has(chapterId)) throw new PromotionError('伏線の章がこのProjectに存在しません');
    if (!content) throw new PromotionError('伏線内容が必要です');
    if (payload.status !== 'planted' || !IMPORTANCE.includes(payload.importance as typeof IMPORTANCE[number]) || !Number.isInteger(payload.expectedResolveChapter)) throw new PromotionError('伏線payloadのenumまたは数値が不正です');
    const importance = payload.importance as typeof IMPORTANCE[number];
    return { targetType: 'foreshadowing', operation: 'create', reason, payload: { chapterId, content, expectedResolveChapter: Math.max(0, integer(payload.expectedResolveChapter)), status: 'planted', importance } };
  });
}

export function extractPromotionDraft(raw: string, chapterIds: ReadonlySet<string>) {
  const content = raw.trim(); const fenced = [...content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1]);
  const first = content.indexOf('{'); const last = content.lastIndexOf('}');
  for (const candidate of [content, ...fenced, first >= 0 && last > first ? content.slice(first, last + 1) : '']) {
    try { return validatePromotionDraft(JSON.parse(candidate), chapterIds); } catch { /* try next */ }
  }
  throw new PromotionError('AIの昇格案を検証できませんでした', 502);
}
