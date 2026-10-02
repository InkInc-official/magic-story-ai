import { NextRequest, NextResponse } from 'next/server';
import { InspectorContextBudgetError, InspectorContextInputError } from '@/lib/inspector-context';
import { NarrativeInspectorError } from '@/lib/narrative-inspector';
import { decideNarrativeIssue } from '@/lib/narrative-inspector-service';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || !body.projectId || typeof body.decision !== 'string') {
      return NextResponse.json({ error: 'projectId and decision are required' }, { status: 400 });
    }
    return NextResponse.json(await decideNarrativeIssue(id, body.projectId, body.decision as never, typeof body.authorNote === 'string' ? body.authorNote : ''));
  } catch (error) {
    if (error instanceof InspectorContextInputError) return NextResponse.json({ error: error.message, code: 'invalid_context' }, { status: 400 });
    if (error instanceof InspectorContextBudgetError) return NextResponse.json({ error: error.message, code: 'context_too_large' }, { status: 422 });
    if (error instanceof NarrativeInspectorError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    console.error('Narrative issue decision error:', error);
    return NextResponse.json({ error: '作者判断の保存に失敗しました', code: 'internal_error' }, { status: 500 });
  }
}
