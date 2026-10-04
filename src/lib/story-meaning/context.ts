import { buildContextWithinBudget, type ContextEntry } from '../prompts/ja/context-budget';
import { computeMeaningContentHash, computeMeaningContextFingerprint } from './fingerprint';
import {
  STORY_MEANING_CONTEXT_VERSION,
  type BuildChapterMeaningContextInput,
  type ChapterMeaningContext,
  type MeaningSemanticPayload,
} from './types';

export const MEANING_SUPPLEMENTAL_CONTEXT_HARD_CAP = 12_000;

function visible<T extends { relevant?: boolean }>(values: T[] | undefined): T[] {
  return (values || []).filter(value => value.relevant !== false);
}

function withoutSelectionFlag<T extends { relevant?: boolean }>(value: T): Omit<T, 'relevant'> {
  const { relevant: _relevant, ...semantic } = value;
  return semantic;
}

function clean<T extends { relevant?: boolean } & ({ id: string } | { characterId: string })>(values: T[]): Array<Omit<T, 'relevant'>> {
  const sortKey = (value: T) => 'id' in value ? value.id : value.characterId;
  return [...values].sort((left, right) => sortKey(left).localeCompare(sortKey(right))).map(withoutSelectionFlag);
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function entry(id: string, heading: string, value: unknown, tier: ContextEntry['tier'], required = false): ContextEntry {
  return {
    id,
    tier,
    required,
    full: `${heading}\n${json(value)}`,
    minimum: `${heading}\n${json(value)}`,
  };
}

export class MeaningContextBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MeaningContextBudgetError';
  }
}

export function buildMeaningSemanticPayload(input: BuildChapterMeaningContextInput): MeaningSemanticPayload {
  const { content: _content, ...target } = input.chapter;
  return {
    version: STORY_MEANING_CONTEXT_VERSION,
    target: { ...target, projectTitle: input.project.title },
    actualCanonical: {
      characters: clean(visible(input.characters)),
      narrators: clean(visible(input.narrators)),
      cast: clean(visible(input.cast)),
      facts: clean(visible(input.facts)),
      knowledge: clean(visible(input.knowledge)),
      relationships: clean(visible(input.relationships)),
    },
    planned: {
      plots: clean(visible(input.plots)),
      foreshadowings: clean(visible(input.foreshadowings)),
    },
    authorIntent: input.project.authorIntent?.trim() || '',
    interpretiveLens: {
      genre: input.project.genre?.trim() || '',
      creativeRules: clean(visible(input.creativeRules)),
    },
  };
}

export function buildChapterMeaningContext(
  input: BuildChapterMeaningContextInput,
  options: { maxSupplementalCharacters?: number } = {},
): ChapterMeaningContext {
  if (input.chapter.projectId !== input.project.id) throw new Error('対象章とProjectが一致しません。');
  const maxCharacters = options.maxSupplementalCharacters ?? MEANING_SUPPLEMENTAL_CONTEXT_HARD_CAP;
  if (!Number.isInteger(maxCharacters) || maxCharacters <= 0 || maxCharacters > MEANING_SUPPLEMENTAL_CONTEXT_HARD_CAP) {
    throw new RangeError(`補助コンテキスト上限は1〜${MEANING_SUPPLEMENTAL_CONTEXT_HARD_CAP}文字で指定してください。`);
  }
  const payload = buildMeaningSemanticPayload(input);
  const entries: ContextEntry[] = [
    entry('target-metadata', '[TARGET CHAPTER METADATA / ACTUAL]', payload.target, 0, true),
    entry('roles', '[POV / NARRATOR / CHAPTER CAST / CANONICAL]', {
      characters: payload.actualCanonical.characters,
      narrators: payload.actualCanonical.narrators,
      cast: payload.actualCanonical.cast,
    }, 0, true),
    entry('knowledge-boundary', '[AUTHOR TRUTH / READER & CHARACTER KNOWLEDGE / CANONICAL]', {
      facts: payload.actualCanonical.facts,
      knowledge: payload.actualCanonical.knowledge,
    }, 0, true),
  ];
  if (payload.actualCanonical.relationships.length) entries.push(entry('relationships', '[CURRENT RELATIONSHIPS / CANONICAL]', payload.actualCanonical.relationships, 1));
  if (payload.planned.plots.length || payload.planned.foreshadowings.length) entries.push(entry('planned', '[PLANNED — NOT ACTUAL]', payload.planned, 2));
  if (payload.authorIntent) entries.push(entry('author-intent', '[AUTHOR INTENT — NOT TEXTUAL FACT]', payload.authorIntent, 3));
  if (payload.interpretiveLens.genre || payload.interpretiveLens.creativeRules.length) entries.push(entry('interpretive-lens', '[INTERPRETIVE / AUTHOR TECHNIQUE CONTEXT — NOT ACTUAL MEANING]', payload.interpretiveLens, 4));

  const budget = buildContextWithinBudget(entries, maxCharacters);
  const requiredIds = new Set(entries.filter(value => value.required).map(value => value.id));
  const unsafe = budget.included.some(value => requiredIds.has(value.id) && value.representation === 'truncated')
    || budget.omitted.some(id => requiredIds.has(id));
  if (unsafe) throw new MeaningContextBudgetError('必須の意味解析コンテキストを欠落なく収容できません。');

  // Only semantic inputs that were actually supplied to the analyzer participate in freshness.
  const included = new Set(budget.included.map(value => value.id));
  const suppliedPayload: MeaningSemanticPayload = {
    ...payload,
    actualCanonical: {
      ...payload.actualCanonical,
      relationships: included.has('relationships') ? payload.actualCanonical.relationships : [],
    },
    planned: included.has('planned') ? payload.planned : { plots: [], foreshadowings: [] },
    authorIntent: included.has('author-intent') ? payload.authorIntent : '',
    interpretiveLens: included.has('interpretive-lens') ? payload.interpretiveLens : { genre: '', creativeRules: [] },
  };
  return {
    version: STORY_MEANING_CONTEXT_VERSION,
    targetChapterId: input.chapter.id,
    targetChapterText: input.chapter.content,
    supplementalContext: budget.text,
    semanticPayload: suppliedPayload,
    contentHash: computeMeaningContentHash(input.chapter.content),
    contextFingerprint: computeMeaningContextFingerprint(suppliedPayload),
    manifest: { included: budget.included.map(value => value.id), omitted: budget.omitted },
  };
}
