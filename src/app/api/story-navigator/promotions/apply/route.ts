import { NextRequest, NextResponse } from 'next/server';
import { applyPromotionAction, PromotionError } from '@/lib/story-navigator/promotion';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || typeof body.actionId !== 'string') throw new PromotionError('projectId and actionId are required');
    return NextResponse.json(await applyPromotionAction(body.projectId, body.actionId));
  } catch (error) {
    const status = error instanceof PromotionError ? error.status : 500;
    console.error('Apply Navigator promotion error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to apply promotion' }, { status });
  }
}
