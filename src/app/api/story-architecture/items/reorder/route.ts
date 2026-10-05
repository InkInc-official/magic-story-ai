import { NextRequest, NextResponse } from 'next/server';
import { reorderStoryArchitectureItems, StoryArchitecturePersistenceError } from '@/lib/story-architecture/persistence';

export async function POST(request:NextRequest) {
  try { return NextResponse.json(await reorderStoryArchitectureItems(await request.json())); }
  catch (error) {
    if (error instanceof StoryArchitecturePersistenceError) return NextResponse.json({error:error.message},{status:error.status});
    console.error('Story Architecture reorder API error:',error);
    return NextResponse.json({error:'Internal server error'},{status:500});
  }
}
