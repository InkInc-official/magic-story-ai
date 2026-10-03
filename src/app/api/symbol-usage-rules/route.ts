import { NextRequest, NextResponse } from 'next/server';
import {
  createSymbolUsageRule, deleteSymbolUsageRule, symbolServiceErrorStatus, updateSymbolUsageRule,
} from '@/lib/symbol-dictionary-service';

const failure = (error: unknown) => {
  const status = symbolServiceErrorStatus(error);
  return NextResponse.json({ error: status === 500 ? 'サーバー内部でエラーが発生しました' : (error as Error).message }, { status });
};

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createSymbolUsageRule(await request.json()), { status: 201 }); } catch (error) { return failure(error); }
}

export async function PUT(request: NextRequest) {
  try { return NextResponse.json(await updateSymbolUsageRule(await request.json())); } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest) {
  const params = new URL(request.url).searchParams; const projectId = params.get('projectId'); const id = params.get('id');
  if (!projectId || !id) return NextResponse.json({ error: 'Project IDとUsage Rule IDは必須です' }, { status: 400 });
  try { await deleteSymbolUsageRule(projectId, id); return NextResponse.json({ success: true }); } catch (error) { return failure(error); }
}
