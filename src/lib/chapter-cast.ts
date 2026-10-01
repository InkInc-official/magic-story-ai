export const CHAPTER_PARTICIPATIONS = ['present', 'mentioned'] as const;
export type ChapterParticipation = typeof CHAPTER_PARTICIPATIONS[number];

export function isChapterParticipation(value: unknown): value is ChapterParticipation {
  return typeof value === 'string' && CHAPTER_PARTICIPATIONS.includes(value as ChapterParticipation);
}

export function isChapterCastOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
