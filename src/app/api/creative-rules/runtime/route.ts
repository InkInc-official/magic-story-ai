import { NextRequest, NextResponse } from 'next/server';
import { creativeRuleServiceErrorStatus, loadProjectCreativeRuleRuntime } from '@/lib/creative-rule-service';

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId') || '';
    return NextResponse.json(await loadProjectCreativeRuleRuntime(projectId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Creative Rulesの取得に失敗しました。' }, { status: creativeRuleServiceErrorStatus(error) });
  }
}
