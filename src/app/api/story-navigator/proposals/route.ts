import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isStoryNavigatorDecisionStatus } from '@/lib/story-navigator/structured-output';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || typeof body.proposalId !== 'string') return NextResponse.json({ error: 'projectId and proposalId are required' }, { status: 400 });
    if (!isStoryNavigatorDecisionStatus(body.decisionStatus)) return NextResponse.json({ error: 'decisionStatus is invalid' }, { status: 400 });
    const proposal = await db.storyNavigatorProposal.findFirst({ where: { id: body.proposalId, run: { projectId: body.projectId } }, select: { id: true } });
    if (!proposal) return NextResponse.json({ error: 'Navigator proposal not found' }, { status: 404 });
    const updated = await db.storyNavigatorProposal.update({ where: { id: proposal.id }, data: {
      decisionStatus: body.decisionStatus,
      decidedAt: body.decisionStatus === 'undecided' ? null : new Date(),
    } });
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update Navigator proposal decision error:', error);
    return NextResponse.json({ error: 'Failed to update proposal decision' }, { status: 500 });
  }
}
