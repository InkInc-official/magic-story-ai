import { NextRequest, NextResponse } from 'next/server';
import { generateStoryNavigatorRun } from '@/lib/story-navigator/service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || !body.projectId || typeof body.anchorChapterId !== 'string' || !body.anchorChapterId) {
      return NextResponse.json({ error: 'projectId and anchorChapterId are required' }, { status: 400 });
    }
    if (body.request !== undefined && typeof body.request !== 'string') return NextResponse.json({ error: 'request must be a string' }, { status: 400 });
    const run = await generateStoryNavigatorRun({ projectId: body.projectId, anchorChapterId: body.anchorChapterId, request: body.request as string | undefined });
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Navigator generation failed';
    const invalidBoundary = message.includes('not found in the project') || message.includes('project was not found');
    return NextResponse.json({ error: message }, { status: invalidBoundary ? 404 : 500 });
  }
}
