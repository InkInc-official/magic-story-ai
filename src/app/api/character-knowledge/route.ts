import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateCharacterKnowledgeInput } from '@/lib/character-knowledge';

const chapterSelect = { id: true, order: true, title: true } as const;
const include = {
  fact: { include: { plannedRevealChapter: { select: chapterSelect }, revealedChapter: { select: chapterSelect } } },
  character: { select: { id: true, name: true } },
  effectiveChapter: { select: chapterSelect },
} as const;

async function validateProjectLinks(projectId: string, factId: string, characterId: string, effectiveChapterId?: string | null) {
  const [fact, character, chapter] = await Promise.all([
    db.storyFact.findFirst({ where: { id: factId, projectId }, select: { id: true } }),
    db.character.findFirst({ where: { id: characterId, projectId }, select: { id: true } }),
    effectiveChapterId ? db.chapter.findFirst({ where: { id: effectiveChapterId, projectId }, select: { id: true } }) : Promise.resolve({ id: 'story-start' }),
  ]);
  return Boolean(fact && character && chapter);
}

async function isDuplicate(factId: string, characterId: string, effectiveChapterId: string | null, excludeId?: string) {
  return Boolean(await db.characterKnowledge.findFirst({ where: {
    factId, characterId, effectiveChapterId,
    ...(excludeId && { id: { not: excludeId } }),
  }, select: { id: true } }));
}

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const projectId = searchParams.get('projectId');
  const factId = searchParams.get('factId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  const events = await db.characterKnowledge.findMany({
    where: { fact: { projectId }, ...(factId && { factId }) }, include,
    orderBy: [{ characterId: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json(events);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || !body.projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const input = { ...body, effectiveChapterId: body.effectiveChapterId || null, beliefNotes: body.beliefNotes ?? '', notes: body.notes ?? '' };
    const error = validateCharacterKnowledgeInput(input);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const factId = body.factId as string;
    const characterId = body.characterId as string;
    const effectiveChapterId = (body.effectiveChapterId as string | null) || null;
    if (!await validateProjectLinks(body.projectId, factId, characterId, effectiveChapterId)) return NextResponse.json({ error: '事実・人物・章は同じプロジェクトから指定してください' }, { status: 400 });
    if (await isDuplicate(factId, characterId, effectiveChapterId)) return NextResponse.json({ error: '同じ人物・事実・時点の認識はすでに存在します' }, { status: 409 });
    const event = await db.characterKnowledge.create({ data: {
      factId, characterId, effectiveChapterId,
      status: body.status as string,
      beliefNotes: typeof body.beliefNotes === 'string' ? body.beliefNotes.trim() : '',
      notes: typeof body.notes === 'string' ? body.notes.trim() : '',
    }, include });
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error('Failed to create character knowledge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.id !== 'string' || typeof body.projectId !== 'string') return NextResponse.json({ error: 'id and projectId are required' }, { status: 400 });
    const existing = await db.characterKnowledge.findFirst({ where: { id: body.id, fact: { projectId: body.projectId } } });
    if (!existing) return NextResponse.json({ error: 'Knowledge event not found' }, { status: 404 });
    const merged = {
      factId: body.factId ?? existing.factId,
      characterId: body.characterId ?? existing.characterId,
      status: body.status ?? existing.status,
      effectiveChapterId: body.effectiveChapterId === undefined ? existing.effectiveChapterId : body.effectiveChapterId || null,
      beliefNotes: body.beliefNotes ?? existing.beliefNotes,
      notes: body.notes ?? existing.notes,
    };
    const error = validateCharacterKnowledgeInput(merged);
    if (error) return NextResponse.json({ error }, { status: 400 });
    if (!await validateProjectLinks(body.projectId, merged.factId as string, merged.characterId as string, merged.effectiveChapterId as string | null)) return NextResponse.json({ error: '事実・人物・章は同じプロジェクトから指定してください' }, { status: 400 });
    if (await isDuplicate(merged.factId as string, merged.characterId as string, merged.effectiveChapterId as string | null, existing.id)) return NextResponse.json({ error: '同じ人物・事実・時点の認識はすでに存在します' }, { status: 409 });
    const event = await db.characterKnowledge.update({ where: { id: existing.id }, data: {
      factId: merged.factId as string, characterId: merged.characterId as string, status: merged.status as string,
      effectiveChapterId: merged.effectiveChapterId as string | null,
      beliefNotes: (merged.beliefNotes as string).trim(), notes: (merged.notes as string).trim(),
    }, include });
    return NextResponse.json(event);
  } catch (error) {
    console.error('Failed to update character knowledge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const projectId = searchParams.get('projectId');
  if (!id || !projectId) return NextResponse.json({ error: 'id and projectId are required' }, { status: 400 });
  const existing = await db.characterKnowledge.findFirst({ where: { id, fact: { projectId } }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Knowledge event not found' }, { status: 404 });
  await db.characterKnowledge.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
