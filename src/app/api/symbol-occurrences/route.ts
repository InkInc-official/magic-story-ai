import { NextRequest, NextResponse } from 'next/server';
import { analyzeChapterSymbolOccurrences, symbolServiceErrorStatus } from '@/lib/symbol-dictionary-service';

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams; const projectId = params.get('projectId'); const chapterId = params.get('chapterId');
  if (!projectId || !chapterId) return NextResponse.json({ error: 'Project IDと章IDは必須です' }, { status: 400 });
  try { return NextResponse.json(await analyzeChapterSymbolOccurrences(projectId, chapterId)); }
  catch (error) {
    const status = symbolServiceErrorStatus(error);
    return NextResponse.json({ error: status === 500 ? 'サーバー内部でエラーが発生しました' : (error as Error).message }, { status });
  }
}
