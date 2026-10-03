import { NextRequest, NextResponse } from 'next/server';
import {
  createSymbolOccurrenceOverride, deleteSymbolOccurrenceOverride, listSymbolOccurrenceOverrides,
  symbolServiceErrorStatus,
} from '@/lib/symbol-dictionary-service';

const failure = (error: unknown) => {
  const status = symbolServiceErrorStatus(error);
  return NextResponse.json({ error: status === 500 ? 'Internal server error' : (error as Error).message }, { status });
};

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams; const projectId = params.get('projectId'); const chapterId = params.get('chapterId');
  if (!projectId || !chapterId) return NextResponse.json({ error: 'projectId and chapterId are required' }, { status: 400 });
  try { return NextResponse.json(await listSymbolOccurrenceOverrides(projectId, chapterId)); } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createSymbolOccurrenceOverride(await request.json()), { status: 201 }); } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest) {
  const params = new URL(request.url).searchParams; const projectId = params.get('projectId'); const id = params.get('id');
  if (!projectId || !id) return NextResponse.json({ error: 'projectId and id are required' }, { status: 400 });
  try { await deleteSymbolOccurrenceOverride(projectId, id); return NextResponse.json({ success: true }); } catch (error) { return failure(error); }
}
