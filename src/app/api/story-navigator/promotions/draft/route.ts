import { NextRequest, NextResponse } from 'next/server';
import { createPromotionDraft, PROMOTION_SOURCE_TYPES, PromotionError } from '@/lib/story-navigator/promotion';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || typeof body.sourceId !== 'string') throw new PromotionError('projectId and sourceId are required');
    if (!PROMOTION_SOURCE_TYPES.includes(body.sourceType as typeof PROMOTION_SOURCE_TYPES[number])) throw new PromotionError('sourceTypeが不正です');
    return NextResponse.json(await createPromotionDraft({ projectId: body.projectId, sourceId: body.sourceId, sourceType: body.sourceType as typeof PROMOTION_SOURCE_TYPES[number] }), { status: 201 });
  } catch (error) {
    const status = error instanceof PromotionError ? error.status : 500;
    console.error('Create Navigator promotion draft error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create promotion draft' }, { status });
  }
}
