import { NextRequest, NextResponse } from 'next/server';
import { executeStoryArchitectureApplyAction } from '@/lib/story-architecture/apply-safety';
import { parseApplyActionRequest } from '@/lib/story-architecture/apply-request';
import { storyArchitectureApplyErrorResponse } from '@/lib/story-architecture/apply-route';
export async function POST(request:NextRequest){try{const input=parseApplyActionRequest(await request.json());return NextResponse.json(await executeStoryArchitectureApplyAction(input.projectId,input.actionId));}catch(error){return storyArchitectureApplyErrorResponse(error);}}
