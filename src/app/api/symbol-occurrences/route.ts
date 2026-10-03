import { NextRequest, NextResponse } from 'next/server';
import { analyzeChapterSymbolOccurrences, symbolServiceErrorStatus } from '@/lib/symbol-dictionary-service';

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams; const projectId = params.get('projectId'); const chapterId = params.get('chapterId');
  if (!projectId || !chapterId) return NextResponse.json({ error: 'projectId and chapterId are required' }, { status: 400 });
  try { return NextResponse.json(await analyzeChapterSymbolOccurrences(projectId, chapterId)); }
  catch (error) {
    const status = symbolServiceErrorStatus(error);
    return NextResponse.json({ error: status === 500 ? 'Internal server error' : (error as Error).message }, { status });
  }
}
