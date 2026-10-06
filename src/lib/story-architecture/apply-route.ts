import { NextResponse } from 'next/server';
import { StoryArchitectureApplyError } from './apply-safety';
export function storyArchitectureApplyErrorResponse(error:unknown){if(error instanceof StoryArchitectureApplyError)return NextResponse.json({error:error.message,code:error.code},{status:error.httpStatus});console.error('Story Architecture Apply error:',error);return NextResponse.json({error:'Story Architecture Apply処理に失敗しました。',code:'internal_error'},{status:500});}
