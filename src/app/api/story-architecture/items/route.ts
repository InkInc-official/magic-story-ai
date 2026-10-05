import { NextRequest, NextResponse } from 'next/server';
import {
  createStoryArchitectureItem, deleteStoryArchitectureItem, StoryArchitecturePersistenceError, updateStoryArchitectureItem,
} from '@/lib/story-architecture/persistence';

function failure(error: unknown) {
  if (error instanceof StoryArchitecturePersistenceError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('Story Architecture item API error:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createStoryArchitectureItem(await request.json()), { status: 201 }); }
  catch (error) { return failure(error); }
}

export async function PUT(request: NextRequest) {
  try { return NextResponse.json(await updateStoryArchitectureItem(await request.json())); }
  catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const query = new URL(request.url).searchParams;
    const projectId=query.get('projectId'), architectureId=query.get('architectureId'), itemType=query.get('itemType'), id=query.get('id');
    if (!projectId || !architectureId || !itemType || !id) return NextResponse.json({error:'projectId, architectureId, itemType and id are required'},{status:400});
    if (!['thread','beat','constraint','question','relation'].includes(itemType)) return NextResponse.json({error:'itemTypeが不正です。'},{status:400});
    return NextResponse.json(await deleteStoryArchitectureItem(projectId,architectureId,itemType as 'thread'|'beat'|'constraint'|'question'|'relation',id));
  } catch (error) { return failure(error); }
}
