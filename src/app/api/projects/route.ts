import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isChapterLengthPolicy, isGenreGuidanceMode, isNarrativePerspective, optionalPositiveInteger } from '@/lib/writing-settings';

export async function GET() {
  try {
    const projects = await db.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { chapters: true, characters: true, worldSettings: true } },
      },
    });
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Get projects error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, genre, description } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const target = optionalPositiveInteger(body.defaultChapterTarget);
    if (body.defaultChapterTarget !== undefined && target === undefined) {
      return NextResponse.json({ error: '標準章目標文字数は正の整数で指定してください' }, { status: 400 });
    }
    if (body.narrativePerspective != null && body.narrativePerspective !== '' && !isNarrativePerspective(body.narrativePerspective)) {
      return NextResponse.json({ error: '基本視点の値が不正です' }, { status: 400 });
    }
    if (body.chapterLengthPolicy !== undefined && !isChapterLengthPolicy(body.chapterLengthPolicy)) {
      return NextResponse.json({ error: '文字数方針の値が不正です' }, { status: 400 });
    }
    if (body.genreGuidanceMode !== undefined && !isGenreGuidanceMode(body.genreGuidanceMode)) {
      return NextResponse.json({ error: 'ジャンル指針の値が不正です' }, { status: 400 });
    }

    const project = await db.project.create({
      data: {
        title,
        genre: genre || '玄幻系统修仙',
        description: description || '',
        narrativePerspective: body.narrativePerspective || null,
        povNotes: body.povNotes || '',
        writingStyleNotes: body.writingStyleNotes || '',
        defaultChapterTarget: target ?? null,
        chapterLengthPolicy: body.chapterLengthPolicy || 'guide',
        formattingNotes: body.formattingNotes || '',
        authorIntent: body.authorIntent || '',
        genreGuidanceMode: body.genreGuidanceMode || 'reference',
        genreGuidanceNotes: body.genreGuidanceNotes || '',
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Create project error:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title, genre, description } = body;

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const target = optionalPositiveInteger(body.defaultChapterTarget);
    if (body.defaultChapterTarget !== undefined && target === undefined) {
      return NextResponse.json({ error: '標準章目標文字数は正の整数で指定してください' }, { status: 400 });
    }
    if (body.narrativePerspective !== undefined && body.narrativePerspective !== null && body.narrativePerspective !== '' && !isNarrativePerspective(body.narrativePerspective)) {
      return NextResponse.json({ error: '基本視点の値が不正です' }, { status: 400 });
    }
    if (body.chapterLengthPolicy !== undefined && !isChapterLengthPolicy(body.chapterLengthPolicy)) {
      return NextResponse.json({ error: '文字数方針の値が不正です' }, { status: 400 });
    }
    if (body.genreGuidanceMode !== undefined && !isGenreGuidanceMode(body.genreGuidanceMode)) {
      return NextResponse.json({ error: 'ジャンル指針の値が不正です' }, { status: 400 });
    }
    const defaultPovCharacterId = body.defaultPovCharacterId === '' ? null : body.defaultPovCharacterId;
    if (defaultPovCharacterId) {
      const character = await db.character.findFirst({ where: { id: defaultPovCharacterId, projectId: id }, select: { id: true } });
      if (!character) return NextResponse.json({ error: '基本視点人物は同じプロジェクトの人物を指定してください' }, { status: 400 });
    }
    const defaultNarratorId = body.defaultNarratorId === '' ? null : body.defaultNarratorId;
    if (defaultNarratorId) {
      const narrator = await db.narratorProfile.findFirst({ where: { id: defaultNarratorId, projectId: id }, select: { id: true } });
      if (!narrator) return NextResponse.json({ error: '基本の語り手は同じプロジェクトから指定してください' }, { status: 400 });
    }

    const project = await db.project.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(genre !== undefined && { genre }),
        ...(description !== undefined && { description }),
        ...(body.narrativePerspective !== undefined && { narrativePerspective: body.narrativePerspective || null }),
        ...(body.defaultPovCharacterId !== undefined && { defaultPovCharacterId }),
        ...(body.defaultNarratorId !== undefined && { defaultNarratorId }),
        ...(body.povNotes !== undefined && { povNotes: body.povNotes }),
        ...(body.writingStyleNotes !== undefined && { writingStyleNotes: body.writingStyleNotes }),
        ...(body.defaultChapterTarget !== undefined && { defaultChapterTarget: target }),
        ...(body.chapterLengthPolicy !== undefined && { chapterLengthPolicy: body.chapterLengthPolicy }),
        ...(body.formattingNotes !== undefined && { formattingNotes: body.formattingNotes }),
        ...(body.authorIntent !== undefined && { authorIntent: body.authorIntent }),
        ...(body.genreGuidanceMode !== undefined && { genreGuidanceMode: body.genreGuidanceMode }),
        ...(body.genreGuidanceNotes !== undefined && { genreGuidanceNotes: body.genreGuidanceNotes }),
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error('Update project error:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    await db.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete project error:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
