import { Prisma } from '@prisma/client';
import { createChatCompletion } from '../ai-client';
import { db } from '../db';
import { extractJsonObject } from '../story-navigator/json-extraction';
import { loadChapterMeaningContext } from './context-loader';
import { buildChapterMeaningPrompt } from './prompt';
import {
  completeStoryMeaningRun,
  getLatestFreshStoryMeaningRun,
  getPendingStoryMeaningRun,
  markStoryMeaningRunFailed,
  startStoryMeaningRun,
} from './service';
import { STORY_MEANING_PROMPT_VERSION } from './persistence';
import type { ChapterMeaningContext } from './types';
import type { MeaningContextLoaderDiagnostics } from './context-loader';

export const STORY_MEANING_TARGET_TECHNICAL_LIMIT = 60_000;

export class StoryMeaningRuntimeError extends Error {
  constructor(public readonly code: 'empty_chapter' | 'oversized_chapter' | 'model_failed' | 'invalid_output' | 'persistence_failed', message: string) {
    super(message);
    this.name = 'StoryMeaningRuntimeError';
  }
}

type MeaningDatabase = typeof db;
type MeaningContextLoader = (
  projectId: string,
  chapterId: string,
  dependencies?: { database?: MeaningDatabase },
) => Promise<{ context: ChapterMeaningContext; diagnostics: MeaningContextLoaderDiagnostics[]; sourceManifest: unknown }>;

function persistedError(error: unknown): string {
  if (error instanceof SyntaxError) return 'meaning_response_invalid_json';
  if (error instanceof StoryMeaningRuntimeError) return `meaning_${error.code}`;
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code: unknown }).code);
    if (['invalid_type', 'unknown_key', 'invalid_value', 'invalid_range', 'invalid_utf16_boundary', 'excerpt_mismatch', 'wrong_chapter', 'missing_primary', 'duplicate_key', 'missing_evidence_ref', 'unknown_entity', 'output_bound_exceeded', 'invalid_layer_support', 'invalid_subtype', 'ownership'].includes(code)) return `meaning_validation_${code}`.slice(0, 4000);
  }
  return 'meaning_analysis_failed';
}

export interface AnalyzeChapterMeaningInput {
  projectId: string;
  chapterId: string;
  force?: boolean;
}

export async function analyzeChapterMeaning(
  input: AnalyzeChapterMeaningInput,
  dependencies: {
    database?: MeaningDatabase;
    loadContext?: MeaningContextLoader;
    complete?: typeof createChatCompletion;
    parse?: typeof extractJsonObject;
    maxTargetCharacters?: number;
    getFreshRun?: typeof getLatestFreshStoryMeaningRun;
    getPendingRun?: typeof getPendingStoryMeaningRun;
    startRun?: typeof startStoryMeaningRun;
    completeRun?: typeof completeStoryMeaningRun;
    markFailed?: typeof markStoryMeaningRunFailed;
  } = {},
) {
  const database = dependencies.database || db;
  const loadContext = dependencies.loadContext || loadChapterMeaningContext;
  const complete = dependencies.complete || createChatCompletion;
  const parse = dependencies.parse || extractJsonObject;
  const getFreshRun = dependencies.getFreshRun || getLatestFreshStoryMeaningRun;
  const getPendingRun = dependencies.getPendingRun || getPendingStoryMeaningRun;
  const startRun = dependencies.startRun || startStoryMeaningRun;
  const completeRun = dependencies.completeRun || completeStoryMeaningRun;
  const markFailed = dependencies.markFailed || markStoryMeaningRunFailed;
  const loaded = await loadContext(input.projectId, input.chapterId, { database });
  const { context } = loaded;
  if (!context.targetChapterText.trim()) throw new StoryMeaningRuntimeError('empty_chapter', '空または空白だけのChapterは意味解析できません。');
  const maxTargetCharacters = dependencies.maxTargetCharacters ?? STORY_MEANING_TARGET_TECHNICAL_LIMIT;
  if (context.targetChapterText.length > maxTargetCharacters) {
    throw new StoryMeaningRuntimeError('oversized_chapter', `Chapter本文が技術上限${maxTargetCharacters} UTF-16 code unitsを超えています。本文は切り詰めず、将来のbatch解析が必要です。`);
  }
  if (!input.force) {
    const fresh = await getFreshRun(input.projectId, input.chapterId, context, database);
    if (fresh) return { outcome: 'reused' as const, run: fresh, diagnostics: loaded.diagnostics };
  }
  const existingPending = await getPendingRun(input.projectId, input.chapterId, context, database);
  if (existingPending) return { outcome: 'pending' as const, run: existingPending, diagnostics: loaded.diagnostics };

  let run;
  try {
    run = await startRun({
      projectId: input.projectId,
      chapterId: input.chapterId,
      context,
      promptVersion: STORY_MEANING_PROMPT_VERSION,
      sourceManifest: loaded.sourceManifest,
    }, database);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const pending = await getPendingRun(input.projectId, input.chapterId, context, database);
      if (pending) return { outcome: 'pending' as const, run: pending, diagnostics: loaded.diagnostics };
    }
    throw error;
  }

  let stage: 'model' | 'parse' | 'persist' = 'model';
  try {
    const prompt = buildChapterMeaningPrompt(context);
    const raw = await complete({
      messages: [{ role: 'system', content: prompt.systemPrompt }, { role: 'user', content: prompt.userMessage }],
      temperature: 0.1,
      max_tokens: 5_000,
    });
    stage = 'parse';
    let parsed: unknown;
    try { parsed = parse(raw); } catch { throw new StoryMeaningRuntimeError('invalid_output', 'AI応答を構造化JSONとして解析できませんでした。'); }
    stage = 'persist';
    const completed = await completeRun({ projectId: input.projectId, runId: run.id, output: parsed }, database);
    return { outcome: 'completed' as const, run: completed, diagnostics: loaded.diagnostics };
  } catch (error) {
    try { await markFailed({ projectId: input.projectId, runId: run.id, error: persistedError(error) }, database); } catch { /* preserve the original failure */ }
    if (error instanceof StoryMeaningRuntimeError) throw error;
    throw new StoryMeaningRuntimeError(
      stage === 'model' ? 'model_failed' : stage === 'persist' && !(error && typeof error === 'object' && 'code' in error) ? 'persistence_failed' : 'invalid_output',
      'Chapter Meaning Analysisに失敗しました。詳細は安全な診断ログを確認してください。',
    );
  }
}
