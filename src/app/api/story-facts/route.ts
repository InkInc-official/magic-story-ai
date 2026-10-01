import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateStoryFactInput } from '@/lib/story-facts';

const chapterSelect = { id: true, order: true, title: true } as const;
const factInclude = { plannedRevealChapter: { select: chapterSelect }, revealedChapter: { select: chapterSelect } } as const;

async function validateChapters(projectId: string, ids: Array<string | null | undefined>) {
  const chapterIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (chapterIds.length === 0) return true;
  const count = await db.chapter.count({ where: { projectId, id: { in: chapterIds } } });
  return count === chapterIds.length;
}

export async function GET(request: NextRequest) {
  const projectId = new URL(request.url).searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  const facts = await db.storyFact.findMany({ where: { projectId }, include: factInclude, orderBy: [{ importance: 'desc' }, { createdAt: 'asc' }] });
  return NextResponse.json(facts);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || !body.projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const input = { ...body, importance: body.importance ?? 'medium', readerInitiallyKnows: body.readerInitiallyKnows ?? false };
    const error = validateStoryFactInput(input);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const project = await db.project.findUnique({ where: { id: body.projectId }, select: { id: true } });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (!await validateChapters(body.projectId, [body.plannedRevealChapterId as string | null, body.revealedChapterId as string | null])) {
      return NextResponse.json({ error: '公開章は同じプロジェクトの章を指定してください' }, { status: 400 });
    }
    const fact = await db.storyFact.create({ data: {
      projectId: body.projectId,
      content: (body.content as string).trim(),
      importance: input.importance as string,
      readerInitiallyKnows: input.readerInitiallyKnows as boolean,
      plannedRevealChapterId: (body.plannedRevealChapterId as string | null) || null,
      revealedChapterId: (body.revealedChapterId as string | null) || null,
      notes: typeof body.notes === 'string' ? body.notes.trim() : '',
    }, include: factInclude });
    return NextResponse.json(fact, { status: 201 });
  } catch (error) {
    console.error('Failed to create story fact:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.id !== 'string' || typeof body.projectId !== 'string') return NextResponse.json({ error: 'id and projectId are required' }, { status: 400 });
    const existing = await db.storyFact.findFirst({ where: { id: body.id, projectId: body.projectId } });
    if (!existing) return NextResponse.json({ error: 'Story fact not found' }, { status: 404 });
    const error = validateStoryFactInput(body, true);
    if (error) return NextResponse.json({ error }, { status: 400 });
    if (!await validateChapters(existing.projectId, [body.plannedRevealChapterId as string | null, body.revealedChapterId as string | null])) {
      return NextResponse.json({ error: '公開章は同じプロジェクトの章を指定してください' }, { status: 400 });
    }
    const fact = await db.storyFact.update({ where: { id: existing.id }, data: {
      ...(body.content !== undefined && { content: (body.content as string).trim() }),
      ...(body.importance !== undefined && { importance: body.importance as string }),
      ...(body.readerInitiallyKnows !== undefined && { readerInitiallyKnows: body.readerInitiallyKnows as boolean }),
      ...(body.plannedRevealChapterId !== undefined && { plannedRevealChapterId: (body.plannedRevealChapterId as string | null) || null }),
      ...(body.revealedChapterId !== undefined && { revealedChapterId: (body.revealedChapterId as string | null) || null }),
      ...(body.notes !== undefined && { notes: (body.notes as string).trim() }),
    }, include: factInclude });
    return NextResponse.json(fact);
  } catch (error) {
    console.error('Failed to update story fact:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get('id');
  const projectId = searchParams.get('projectId');
  if (!id || !projectId) return NextResponse.json({ error: 'id and projectId are required' }, { status: 400 });
  const deleted = await db.storyFact.deleteMany({ where: { id, projectId } });
  if (deleted.count === 0) return NextResponse.json({ error: 'Story fact not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
