import { NextRequest, NextResponse } from 'next/server';
import {
  createStoryArchitecture, getStoryArchitecture, StoryArchitecturePersistenceError, updateStoryArchitecture,
} from '@/lib/story-architecture/persistence';

function failure(error: unknown) {
  if (error instanceof StoryArchitecturePersistenceError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('Story Architecture API error:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const projectId = new URL(request.url).searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
    const architecture = await getStoryArchitecture(projectId);
    return NextResponse.json(architecture);
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createStoryArchitecture(await request.json()), { status: 201 }); }
  catch (error) { return failure(error); }
}

export async function PUT(request: NextRequest) {
  try { return NextResponse.json(await updateStoryArchitecture(await request.json())); }
  catch (error) { return failure(error); }
}
