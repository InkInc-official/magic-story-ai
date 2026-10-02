import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { PROMOTION_REVIEW_STATUSES, PromotionError } from '@/lib/story-navigator/promotion';

export async function GET(request: NextRequest) {
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  return NextResponse.json(await db.storyNavigatorPromotionAction.findMany({
    where: { projectId },
    include: {
      sourceProposal: { select: { id: true, title: true, summary: true } },
      sourceObservation: { select: { id: true, elementSummary: true, sourceExcerpt: true, sourceChapterId: true, sourceChapterOrder: true, sourceChapterTitle: true } },
    },
    orderBy: { createdAt: 'desc' },
  }));
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || typeof body.actionId !== 'string') throw new PromotionError('projectId and actionId are required');
    if (!PROMOTION_REVIEW_STATUSES.includes(body.status as typeof PROMOTION_REVIEW_STATUSES[number])) throw new PromotionError('statusはapprovedまたはrejectedのみ指定できます');
    const action = await db.storyNavigatorPromotionAction.findFirst({ where: { id: body.actionId, projectId: body.projectId } });
    if (!action) throw new PromotionError('昇格Actionが見つかりません', 404);
    if (action.status !== 'draft') throw new PromotionError('draft状態のActionだけを審査できます', 409);
    return NextResponse.json(await db.storyNavigatorPromotionAction.update({ where: { id: action.id }, data: { status: body.status as string, reviewedAt: new Date(), error: '' } }));
  } catch (error) {
    const status = error instanceof PromotionError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to review promotion' }, { status });
  }
}
