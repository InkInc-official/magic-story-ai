import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateExplorationRun, type ExplorationRangeMode } from '@/lib/story-navigator/exploration';

const include = { anchorChapter: { select: { id: true, order: true, title: true } }, observations: { orderBy: { createdAt: 'asc' as const } } } as const;

export async function GET(request: NextRequest) {
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  return NextResponse.json(await db.storyNavigatorExplorationRun.findMany({ where: { projectId }, include, orderBy: { createdAt: 'desc' }, take: 20 }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || typeof body.anchorChapterId !== 'string') return NextResponse.json({ error: 'projectId and anchorChapterId are required' }, { status: 400 });
    if (!['all', 'recent', 'range'].includes(String(body.rangeMode))) return NextResponse.json({ error: 'rangeMode is invalid' }, { status: 400 });
    const run = await generateExplorationRun({ projectId: body.projectId, anchorChapterId: body.anchorChapterId, rangeMode: body.rangeMode as ExplorationRangeMode, recentCount: typeof body.recentCount === 'number' ? body.recentCount : undefined, startChapterId: typeof body.startChapterId === 'string' ? body.startChapterId : undefined, endChapterId: typeof body.endChapterId === 'string' ? body.endChapterId : undefined });
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '探索に失敗しました' }, { status: 500 });
  }
}
