import { NextRequest, NextResponse } from 'next/server';
import { NarrativeLearningError } from '@/lib/narrative-learning';
import { requestLearningHint } from '@/lib/narrative-learning-service';

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params; const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || !body.projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    return NextResponse.json({ session: await requestLearningHint(sessionId, body.projectId) });
  } catch (error) {
    if (error instanceof NarrativeLearningError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === 'not_found' ? 404 : 400 });
    console.error('Narrative learning hint error:', error);
    return NextResponse.json({ error: 'ヒント生成に失敗しました', code: 'internal_error' }, { status: 500 });
  }
}
