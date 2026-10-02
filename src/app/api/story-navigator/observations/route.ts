import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isStoryNavigatorDecisionStatus } from '@/lib/story-navigator/structured-output';

export async function PUT(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;
  if (typeof body.projectId !== 'string' || typeof body.observationId !== 'string') return NextResponse.json({ error: 'projectId and observationId are required' }, { status: 400 });
  if (!isStoryNavigatorDecisionStatus(body.decisionStatus)) return NextResponse.json({ error: 'decisionStatus is invalid' }, { status: 400 });
  const existing = await db.storyNavigatorObservation.findFirst({ where: { id: body.observationId, projectId: body.projectId, run: { projectId: body.projectId } }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Observation not found' }, { status: 404 });
  return NextResponse.json(await db.storyNavigatorObservation.update({ where: { id: existing.id }, data: { decisionStatus: body.decisionStatus, decidedAt: body.decisionStatus === 'undecided' ? null : new Date() } }));
}
