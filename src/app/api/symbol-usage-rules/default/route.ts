import { NextRequest, NextResponse } from 'next/server';
import { setDefaultSymbolUsage, symbolServiceErrorStatus } from '@/lib/symbol-dictionary-service';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || typeof body.definitionId !== 'string'
      || (body.usageRuleId !== null && typeof body.usageRuleId !== 'string')) {
      return NextResponse.json({ error: 'projectId, definitionId and nullable usageRuleId are required' }, { status: 400 });
    }
    return NextResponse.json(await setDefaultSymbolUsage(body.projectId, body.definitionId, body.usageRuleId));
  } catch (error) {
    const status = symbolServiceErrorStatus(error);
    return NextResponse.json({ error: status === 500 ? 'Internal server error' : (error as Error).message }, { status });
  }
}
