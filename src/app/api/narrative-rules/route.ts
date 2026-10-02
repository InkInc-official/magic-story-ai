import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateNarrativeRuleInput } from '@/lib/narrative-foundation';

export async function GET(request: NextRequest) {
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  return NextResponse.json(await db.narrativeRule.findMany({ where: { projectId }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || !body.projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const input = { ...body, category: body.category ?? 'custom', mode: body.mode ?? 'guidance', source: body.source ?? 'author', priority: body.priority ?? 0, active: body.active ?? true, overridable: body.overridable ?? false };
    const error = validateNarrativeRuleInput(input);
    if (error) return NextResponse.json({ error }, { status: 400 });
    if (!await db.project.findUnique({ where: { id: body.projectId }, select: { id: true } })) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    const rule = await db.narrativeRule.create({ data: {
      projectId: body.projectId, title: (body.title as string).trim(), description: (body.description as string).trim(),
      category: input.category as string, mode: input.mode as string, source: input.source as string, priority: input.priority as number,
      machineKey: typeof body.machineKey === 'string' && body.machineKey.trim() ? body.machineKey.trim() : null,
      active: input.active as boolean, overridable: input.overridable as boolean,
    } });
    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error('Create narrative rule error:', error);
    return NextResponse.json({ error: 'Failed to create narrative rule' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.id !== 'string' || typeof body.projectId !== 'string') return NextResponse.json({ error: 'id and projectId are required' }, { status: 400 });
    const existing = await db.narrativeRule.findFirst({ where: { id: body.id, projectId: body.projectId } });
    if (!existing) return NextResponse.json({ error: 'Narrative rule not found' }, { status: 404 });
    const merged = { ...existing, ...body };
    const error = validateNarrativeRuleInput(merged);
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json(await db.narrativeRule.update({ where: { id: existing.id }, data: {
      title: (merged.title as string).trim(), description: (merged.description as string).trim(), category: merged.category as string,
      mode: merged.mode as string, priority: merged.priority as number, source: merged.source as string,
      machineKey: typeof merged.machineKey === 'string' && merged.machineKey.trim() ? merged.machineKey.trim() : null,
      active: merged.active as boolean, overridable: merged.overridable as boolean,
    } }));
  } catch (error) {
    console.error('Update narrative rule error:', error);
    return NextResponse.json({ error: 'Failed to update narrative rule' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id'); const projectId = searchParams.get('projectId');
  if (!id || !projectId) return NextResponse.json({ error: 'id and projectId are required' }, { status: 400 });
  const existing = await db.narrativeRule.findFirst({ where: { id, projectId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Narrative rule not found' }, { status: 404 });
  await db.narrativeRule.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
