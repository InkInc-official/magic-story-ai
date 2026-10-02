import { NextRequest, NextResponse } from 'next/server';
import { InspectorContextBudgetError, InspectorContextInputError } from '@/lib/inspector-context';
import { NarrativeInspectorError } from '@/lib/narrative-inspector';
import { runNarrativeInspector } from '@/lib/narrative-inspector-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || !body.projectId || typeof body.chapterId !== 'string' || !body.chapterId) {
      return NextResponse.json({ error: 'projectId and chapterId are required' }, { status: 400 });
    }
    const result = await runNarrativeInspector({
      projectId: body.projectId,
      chapterId: body.chapterId,
      ...(body.startOffset !== undefined && { startOffset: body.startOffset as number }),
      ...(body.endOffset !== undefined && { endOffset: body.endOffset as number }),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InspectorContextInputError) return NextResponse.json({ error: error.message, code: 'invalid_context' }, { status: 400 });
    if (error instanceof InspectorContextBudgetError) return NextResponse.json({ error: error.message, code: 'context_too_large' }, { status: 422 });
    if (error instanceof NarrativeInspectorError) {
      const status = error.code === 'ai_failure' || error.code === 'empty_response' ? 502 : 422;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error('Narrative inspector error:', error);
    return NextResponse.json({ error: '叙述検査に失敗しました', code: 'internal_error' }, { status: 500 });
  }
}
