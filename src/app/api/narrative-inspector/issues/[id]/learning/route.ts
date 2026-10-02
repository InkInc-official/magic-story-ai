import { NextRequest, NextResponse } from 'next/server';
import { NarrativeLearningError } from '@/lib/narrative-learning';
import { getLearningSession, startLearningSession } from '@/lib/narrative-learning-service';

function learningError(error: unknown) {
  if (error instanceof NarrativeLearningError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === 'not_found' ? 404 : 400 });
  console.error('Narrative learning error:', error);
  return NextResponse.json({ error: '学習モードの処理に失敗しました', code: 'internal_error' }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    return NextResponse.json({ session: await getLearningSession(id, projectId) });
  } catch (error) { return learningError(error); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || !body.projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    return NextResponse.json({ session: await startLearningSession(id, body.projectId) });
  } catch (error) { return learningError(error); }
}
