import { NextRequest, NextResponse } from 'next/server';
import { createStoryArchitectureApplyDraft } from '@/lib/story-architecture/apply-safety';
import { parseApplyDraftRequest } from '@/lib/story-architecture/apply-request';
import { storyArchitectureApplyErrorResponse } from '@/lib/story-architecture/apply-route';
export async function POST(request:NextRequest){try{return NextResponse.json(await createStoryArchitectureApplyDraft(parseApplyDraftRequest(await request.json())));}catch(error){return storyArchitectureApplyErrorResponse(error);}}
