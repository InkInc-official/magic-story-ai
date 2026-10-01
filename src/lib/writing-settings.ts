export const NARRATIVE_PERSPECTIVES = [
  'first_person', 'third_person_limited', 'third_person_multiple',
  'third_person_objective', 'custom',
] as const;

export const CHAPTER_LENGTH_POLICIES = ['guide', 'strict'] as const;
export const DEFAULT_CHAPTER_TARGET = 3000;

export type NarrativePerspective = typeof NARRATIVE_PERSPECTIVES[number];
export type ChapterLengthPolicy = typeof CHAPTER_LENGTH_POLICIES[number];

export function isNarrativePerspective(value: unknown): value is NarrativePerspective {
  return typeof value === 'string' && NARRATIVE_PERSPECTIVES.includes(value as NarrativePerspective);
}

export function isChapterLengthPolicy(value: unknown): value is ChapterLengthPolicy {
  return typeof value === 'string' && CHAPTER_LENGTH_POLICIES.includes(value as ChapterLengthPolicy);
}

export function optionalPositiveInteger(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}
