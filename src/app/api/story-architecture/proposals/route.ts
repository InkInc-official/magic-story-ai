import { NextRequest, NextResponse } from 'next/server';
import {
  generateStoryArchitectureProposalForAuthor, listStoryArchitectureProposalRuns, storyArchitectureProposalFailure,
} from '@/lib/story-architecture/author-ui';

const failure = (error: unknown) => {
  const result = storyArchitectureProposalFailure(error);
  if (result.status === 500) console.error('Story Architecture proposal API error:', error);
  return NextResponse.json({ error: result.message }, { status: result.status });
};

export async function GET(request: NextRequest) {
  try {
    const query = new URL(request.url).searchParams;
    const projectId = query.get('projectId'), architectureId = query.get('architectureId');
    if (!projectId || !architectureId) return NextResponse.json({ error: 'projectIdとarchitectureIdが必要です。' }, { status: 400 });
    return NextResponse.json(await listStoryArchitectureProposalRuns(projectId, architectureId));
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await generateStoryArchitectureProposalForAuthor(await request.json()), { status: 201 }); }
  catch (error) { return failure(error); }
}
