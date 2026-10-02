import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const include = {
  anchorChapter: { select: { id: true, order: true, title: true } },
  proposals: { orderBy: { routeKey: 'asc' as const } },
} as const;

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const projectId = params.get('projectId');
  const runId = params.get('runId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  if (runId) {
    const run = await db.storyNavigatorRun.findFirst({ where: { id: runId, projectId }, include });
    return run ? NextResponse.json(run) : NextResponse.json({ error: 'Navigator run not found' }, { status: 404 });
  }
  const runs = await db.storyNavigatorRun.findMany({ where: { projectId }, include, orderBy: { createdAt: 'desc' }, take: 30 });
  return NextResponse.json(runs);
}
