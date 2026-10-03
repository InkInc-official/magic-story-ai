import { NextRequest, NextResponse } from 'next/server';
import {
  createSymbolOccurrenceOverride, deleteSymbolOccurrenceOverride, listSymbolOccurrenceOverrides,
  symbolServiceErrorStatus, updateSymbolOccurrenceOverride,
} from '@/lib/symbol-dictionary-service';

const failure = (error: unknown) => {
  const status = symbolServiceErrorStatus(error);
  return NextResponse.json({ error: status === 500 ? 'サーバー内部でエラーが発生しました' : (error as Error).message }, { status });
};

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams; const projectId = params.get('projectId'); const chapterId = params.get('chapterId');
  if (!projectId || !chapterId) return NextResponse.json({ error: 'Project IDと章IDは必須です' }, { status: 400 });
  try { return NextResponse.json(await listSymbolOccurrenceOverrides(projectId, chapterId)); } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createSymbolOccurrenceOverride(await request.json()), { status: 201 }); } catch (error) { return failure(error); }
}

export async function PUT(request: NextRequest) {
  try { return NextResponse.json(await updateSymbolOccurrenceOverride(await request.json())); } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest) {
  const params = new URL(request.url).searchParams; const projectId = params.get('projectId'); const id = params.get('id');
  if (!projectId || !id) return NextResponse.json({ error: 'Project IDとOverride IDは必須です' }, { status: 400 });
  try { await deleteSymbolOccurrenceOverride(projectId, id); return NextResponse.json({ success: true }); } catch (error) { return failure(error); }
}
