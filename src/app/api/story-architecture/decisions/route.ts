import { NextRequest, NextResponse } from 'next/server';
import {
  appendStoryArchitectureDecision, listStoryArchitectureDecisions, StoryArchitecturePersistenceError,
} from '@/lib/story-architecture/persistence';

function failure(error: unknown) {
  if (error instanceof StoryArchitecturePersistenceError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('Story Architecture decision API error:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const query=new URL(request.url).searchParams; const projectId=query.get('projectId'), architectureId=query.get('architectureId');
    if (!projectId || !architectureId) return NextResponse.json({error:'projectId and architectureId are required'},{status:400});
    return NextResponse.json(await listStoryArchitectureDecisions(projectId,architectureId));
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await appendStoryArchitectureDecision(await request.json()),{status:201}); }
  catch (error) { return failure(error); }
}
