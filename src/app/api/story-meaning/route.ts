import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  analyzeChapterMeaning, listStoryMeaningRuns, loadChapterMeaningContext,
  MeaningContextBudgetError, StoryMeaningContextLoadError, StoryMeaningRuntimeError,
} from '@/lib/story-meaning';
import { resolveStoryMeaningUiState, STORY_MEANING_HISTORY_LIMIT, toStoryMeaningRunDto } from '@/lib/story-meaning/author-ui';

function required(value: string | null): value is string { return typeof value === 'string' && value.length > 0; }

async function entityNames(runs: Array<Record<string, unknown>>, projectId: string) {
  const refs = runs.flatMap(run => (Array.isArray(run.events) ? run.events : []) as Array<Record<string, unknown>>).flatMap(event => [
    ...((Array.isArray(event.actorRefs) ? event.actorRefs : []) as Array<Record<string, unknown>>),
    ...((Array.isArray(event.claims) ? event.claims : []) as Array<Record<string, unknown>>).flatMap(claim => (Array.isArray(claim.relatedEntityRefs) ? claim.relatedEntityRefs : []) as Array<Record<string, unknown>>),
  ]);
  const ids = (type: string) => [...new Set(refs.filter(ref => ref.type === type && typeof ref.id === 'string').map(ref => ref.id as string))];
  const [characters, facts, relationships, plots, foreshadowings] = await Promise.all([
    db.character.findMany({ where: { projectId, id: { in: ids('character') } }, select: { id: true, name: true } }),
    db.storyFact.findMany({ where: { projectId, id: { in: ids('story_fact') } }, select: { id: true } }),
    db.characterRelationship.findMany({ where: { projectId, id: { in: ids('relationship') } }, select: { id: true, type: true } }),
    db.plot.findMany({ where: { projectId, id: { in: ids('plot') } }, select: { id: true, name: true } }),
    db.foreshadowing.findMany({ where: { projectId, id: { in: ids('foreshadowing') } }, select: { id: true } }),
  ]);
  return {
    character: new Map(characters.map(value => [value.id, value.name])),
    story_fact: new Map(facts.map(value => [value.id, '作者設定（参照）'])),
    relationship: new Map(relationships.map(value => [value.id, `人物関係：${value.type}`])),
    plot: new Map(plots.map(value => [value.id, value.name])),
    foreshadowing: new Map(foreshadowings.map(value => [value.id, '伏線（参照）'])),
  };
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('projectId');
  const chapterId = request.nextUrl.searchParams.get('chapterId');
  if (!required(projectId) || !required(chapterId)) return NextResponse.json({ error: 'projectIdとchapterIdが必要です。', code: 'invalid_request' }, { status: 400 });
  try {
    const { context } = await loadChapterMeaningContext(projectId, chapterId);
    const runs = await listStoryMeaningRuns(projectId, chapterId, context, db, STORY_MEANING_HISTORY_LIMIT) as unknown as Array<Record<string, unknown>>;
    const names = await entityNames(runs, projectId);
    const dto = runs.map(run => toStoryMeaningRunDto(run, names));
    const state = resolveStoryMeaningUiState(dto);
    return NextResponse.json({ state, runs: dto, historyLimit: STORY_MEANING_HISTORY_LIMIT });
  } catch (error) {
    if (error instanceof StoryMeaningContextLoadError) return NextResponse.json({ error: '意味解析の現在状態を確認できません。', code: error.code }, { status: error.code === 'ownership' ? 404 : 422 });
    if (error instanceof MeaningContextBudgetError) return NextResponse.json({ error: '意味解析に必要な設定情報が技術上限を超えています。', code: 'context_too_large' }, { status: 422 });
    console.error('Story meaning state error:', error);
    return NextResponse.json({ error: '物語意味解析の履歴を取得できませんでした。', code: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || !body.projectId || typeof body.chapterId !== 'string' || !body.chapterId || (body.force !== undefined && typeof body.force !== 'boolean')) {
      return NextResponse.json({ error: '解析対象が不正です。', code: 'invalid_request' }, { status: 400 });
    }
    const result = await analyzeChapterMeaning({ projectId: body.projectId, chapterId: body.chapterId, force: body.force === true });
    const run = result.run as unknown as Record<string, unknown>;
    return NextResponse.json({ outcome: result.outcome, runId: String(run.id || ''), status: String(run.status || result.outcome) });
  } catch (error) {
    if (error instanceof StoryMeaningRuntimeError) {
      const status = error.code === 'empty_chapter' ? 422 : error.code === 'oversized_chapter' ? 413 : error.code === 'model_failed' ? 502 : 422;
      return NextResponse.json({ error: error.code === 'empty_chapter' ? '本文がないため解析できません。' : error.code === 'oversized_chapter' ? 'この章は現在の意味解析で一度に扱える技術上限を超えています。' : '物語意味解析に失敗しました。', code: error.code }, { status });
    }
    if (error instanceof StoryMeaningContextLoadError) return NextResponse.json({ error: '解析対象を確認できません。', code: error.code }, { status: error.code === 'ownership' ? 404 : 422 });
    if (error instanceof MeaningContextBudgetError) return NextResponse.json({ error: '意味解析に必要な設定情報が技術上限を超えています。', code: 'context_too_large' }, { status: 422 });
    console.error('Story meaning analysis error:', error);
    return NextResponse.json({ error: '物語意味解析に失敗しました。', code: 'internal_error' }, { status: 500 });
  }
}
