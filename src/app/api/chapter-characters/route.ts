import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isChapterCastOrder, isChapterParticipation } from '@/lib/chapter-cast';

export async function GET(request: NextRequest) {
  const chapterId = new URL(request.url).searchParams.get('chapterId');
  if (!chapterId) return NextResponse.json({ error: 'chapterId is required' }, { status: 400 });
  try {
    const cast = await db.chapterCharacter.findMany({
      where: { chapterId },
      include: { character: true },
      orderBy: [{ order: 'asc' }, { character: { createdAt: 'asc' } }],
    });
    return NextResponse.json(cast);
  } catch (error) {
    console.error('Get chapter characters error:', error);
    return NextResponse.json({ error: 'Failed to fetch chapter characters' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chapterId, characterId } = body;
    const participation = body.participation ?? 'present';
    if (!chapterId || !characterId) return NextResponse.json({ error: 'chapterId and characterId are required' }, { status: 400 });
    if (!isChapterParticipation(participation)) return NextResponse.json({ error: 'participation must be present or mentioned' }, { status: 400 });
    if (body.order !== undefined && !isChapterCastOrder(body.order)) return NextResponse.json({ error: 'order must be a non-negative integer' }, { status: 400 });

    const [chapter, character, duplicate] = await Promise.all([
      db.chapter.findUnique({ where: { id: chapterId }, select: { projectId: true } }),
      db.character.findUnique({ where: { id: characterId }, select: { projectId: true } }),
      db.chapterCharacter.findUnique({ where: { chapterId_characterId: { chapterId, characterId } }, select: { chapterId: true } }),
    ]);
    if (!chapter || !character) return NextResponse.json({ error: 'Chapter or Character not found' }, { status: 404 });
    if (chapter.projectId !== character.projectId) return NextResponse.json({ error: 'Character must belong to the same project as Chapter' }, { status: 400 });
    if (duplicate) return NextResponse.json({ error: 'Character is already registered for this chapter' }, { status: 409 });

    let order = body.order;
    if (order === undefined) {
      const aggregate = await db.chapterCharacter.aggregate({ where: { chapterId }, _max: { order: true } });
      order = (aggregate._max.order ?? -1) + 1;
    }
    const entry = await db.chapterCharacter.create({
      data: { chapterId, characterId, participation, notes: body.notes || '', order },
      include: { character: true },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('Create chapter character error:', error);
    return NextResponse.json({ error: 'Failed to create chapter character' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { chapterId, characterId } = body;
    if (!chapterId || !characterId) return NextResponse.json({ error: 'chapterId and characterId are required' }, { status: 400 });
    if (body.participation !== undefined && !isChapterParticipation(body.participation)) return NextResponse.json({ error: 'participation must be present or mentioned' }, { status: 400 });
    if (body.order !== undefined && !isChapterCastOrder(body.order)) return NextResponse.json({ error: 'order must be a non-negative integer' }, { status: 400 });
    const entry = await db.chapterCharacter.update({
      where: { chapterId_characterId: { chapterId, characterId } },
      data: {
        ...(body.participation !== undefined && { participation: body.participation }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.order !== undefined && { order: body.order }),
      },
      include: { character: true },
    });
    return NextResponse.json(entry);
  } catch (error) {
    console.error('Update chapter character error:', error);
    return NextResponse.json({ error: 'Failed to update chapter character' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const chapterId = searchParams.get('chapterId');
    const characterId = searchParams.get('characterId');
    if (!chapterId || !characterId) return NextResponse.json({ error: 'chapterId and characterId are required' }, { status: 400 });
    await db.chapterCharacter.delete({ where: { chapterId_characterId: { chapterId, characterId } } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete chapter character error:', error);
    return NextResponse.json({ error: 'Failed to delete chapter character' }, { status: 500 });
  }
}
