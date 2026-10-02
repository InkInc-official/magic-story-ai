import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { referencesBelongToProject, validateNarratorInput } from '@/lib/narrative-foundation';

const include = {
  linkedCharacter: { select: { id: true, name: true } },
  identityFact: { select: { id: true, content: true, readerInitiallyKnows: true, revealedChapterId: true } },
} as const;

async function validateLinks(projectId: string, linkedCharacterId: string | null, identityFactId: string | null) {
  const [project, character, fact] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true } }),
    linkedCharacterId ? db.character.findUnique({ where: { id: linkedCharacterId }, select: { projectId: true } }) : Promise.resolve(null),
    identityFactId ? db.storyFact.findUnique({ where: { id: identityFactId }, select: { projectId: true } }) : Promise.resolve(null),
  ]);
  if (!project || (linkedCharacterId && !character) || (identityFactId && !fact)) return false;
  return referencesBelongToProject(projectId, [character, fact]);
}

export async function GET(request: NextRequest) {
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  const narrators = await db.narratorProfile.findMany({ where: { projectId }, include, orderBy: [{ createdAt: 'asc' }] });
  return NextResponse.json(narrators);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || !body.projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const input = { ...body, identityDisclosureMode: body.identityDisclosureMode ?? 'normal' };
    const error = validateNarratorInput(input);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const linkedCharacterId = typeof body.linkedCharacterId === 'string' && body.linkedCharacterId ? body.linkedCharacterId : null;
    const identityFactId = typeof body.identityFactId === 'string' && body.identityFactId ? body.identityFactId : null;
    if (!await validateLinks(body.projectId, linkedCharacterId, identityFactId)) return NextResponse.json({ error: '語り手・人物・正体の事実は同じプロジェクトから指定してください' }, { status: 400 });
    const narrator = await db.narratorProfile.create({ data: {
      projectId: body.projectId,
      name: (body.name as string).trim(),
      description: typeof body.description === 'string' ? body.description.trim() : '',
      voiceNotes: typeof body.voiceNotes === 'string' ? body.voiceNotes.trim() : '',
      linkedCharacterId, identityFactId,
      identityDisclosureMode: input.identityDisclosureMode as string,
      notes: typeof body.notes === 'string' ? body.notes.trim() : '',
    }, include });
    return NextResponse.json(narrator, { status: 201 });
  } catch (error) {
    console.error('Create narrator error:', error);
    return NextResponse.json({ error: 'Failed to create narrator' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.id !== 'string' || typeof body.projectId !== 'string') return NextResponse.json({ error: 'id and projectId are required' }, { status: 400 });
    const existing = await db.narratorProfile.findFirst({ where: { id: body.id, projectId: body.projectId } });
    if (!existing) return NextResponse.json({ error: 'Narrator not found' }, { status: 404 });
    const merged = { ...existing, ...body };
    const error = validateNarratorInput(merged);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const linkedCharacterId = merged.linkedCharacterId || null;
    const identityFactId = merged.identityFactId || null;
    if (!await validateLinks(body.projectId, linkedCharacterId, identityFactId)) return NextResponse.json({ error: '語り手・人物・正体の事実は同じプロジェクトから指定してください' }, { status: 400 });
    const narrator = await db.narratorProfile.update({ where: { id: existing.id }, data: {
      name: (merged.name as string).trim(), description: (merged.description as string).trim(), voiceNotes: (merged.voiceNotes as string).trim(),
      linkedCharacterId, identityFactId, identityDisclosureMode: merged.identityDisclosureMode as string, notes: (merged.notes as string).trim(),
    }, include });
    return NextResponse.json(narrator);
  } catch (error) {
    console.error('Update narrator error:', error);
    return NextResponse.json({ error: 'Failed to update narrator' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id'); const projectId = searchParams.get('projectId');
  if (!id || !projectId) return NextResponse.json({ error: 'id and projectId are required' }, { status: 400 });
  const existing = await db.narratorProfile.findFirst({ where: { id, projectId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Narrator not found' }, { status: 404 });
  await db.narratorProfile.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
