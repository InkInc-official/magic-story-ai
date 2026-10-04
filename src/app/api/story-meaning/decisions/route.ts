import { NextRequest, NextResponse } from 'next/server';
import { appendStoryMeaningDecision, StoryMeaningPersistenceError, STORY_MEANING_DECISIONS } from '@/lib/story-meaning';
import { validateStoryMeaningDecisionDraft } from '@/lib/story-meaning/author-ui';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const decision = typeof body.decision === 'string' ? body.decision : '';
    if (typeof body.projectId !== 'string' || !body.projectId || typeof body.chapterId !== 'string' || !body.chapterId
      || typeof body.runId !== 'string' || !body.runId || typeof body.claimId !== 'string' || !body.claimId
      || !STORY_MEANING_DECISIONS.includes(decision as never) || (body.authorInterpretation !== undefined && typeof body.authorInterpretation !== 'string')) {
      return NextResponse.json({ error: '作者判断の入力が不正です。', code: 'invalid_request' }, { status: 400 });
    }
    const authorInterpretation = typeof body.authorInterpretation === 'string' ? body.authorInterpretation : '';
    const validationError = validateStoryMeaningDecisionDraft(decision, authorInterpretation);
    if (validationError) return NextResponse.json({ error: validationError, code: 'invalid_interpretation' }, { status: 400 });
    const result = await appendStoryMeaningDecision({
      projectId: body.projectId, chapterId: body.chapterId, runId: body.runId, claimId: body.claimId,
      decision: decision as Parameters<typeof appendStoryMeaningDecision>[0]['decision'], authorInterpretation,
    });
    return NextResponse.json({ id: result.id, decision: result.decision, authorInterpretation: result.authorInterpretation, createdAt: result.createdAt });
  } catch (error) {
    if (error instanceof StoryMeaningPersistenceError) return NextResponse.json({ error: error.code === 'invalid_input' ? '作者判断の入力が不正です。' : '対象の解析結果を確認できません。', code: error.code }, { status: error.code === 'invalid_input' ? 400 : 404 });
    console.error('Story meaning decision error:', error);
    return NextResponse.json({ error: '作者判断を保存できませんでした。', code: 'internal_error' }, { status: 500 });
  }
}
