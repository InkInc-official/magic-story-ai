import { db } from '@/lib/db';
import { ARCHITECT_SCOPE_TYPES, type ArchitectScope } from './context';
import { STORY_ARCHITECT_OPERATIONS, type StoryArchitectOperation } from './proposal';
import { assertOnlyKeys, StoryArchitecturePersistenceError } from './request';
import { generateStoryArchitectProposal, StoryArchitectRuntimeError } from './runtime';

type Database = typeof db;

const jsonArray = (value: string): string[] => {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []; }
  catch { return []; }
};

export function publicStoryArchitectureProposalRun(row: any) {
  const alternatives = (row.alternatives || []).map((alternative: any) => ({
    id: alternative.id, key: alternative.alternativeKey, label: alternative.label,
    rationale: alternative.rationale, tradeoffs: jsonArray(alternative.tradeoffs), order: alternative.order,
    threads: (row.threads || []).filter((item: any) => item.proposalAlternativeId === alternative.id),
    beats: (row.beats || []).filter((item: any) => item.proposalAlternativeId === alternative.id),
    constraints: (row.constraints || []).filter((item: any) => item.proposalAlternativeId === alternative.id),
    questions: (row.questions || []).filter((item: any) => item.proposalAlternativeId === alternative.id),
    relations: (row.relations || []).filter((item: any) => item.proposalAlternativeId === alternative.id),
  }));
  return {
    id: row.id, projectId: row.projectId, architectureId: row.architectureId,
    scopeType: row.scopeType, scopeId: row.scopeId, request: row.request, operation: row.operation,
    canonMode: row.canonMode, status: row.status, errorCode: row.errorCode, summary: row.summary,
    impactNotes: jsonArray(row.impactNotes), unresolvedQuestions: jsonArray(row.unresolvedQuestions),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    completedAt: row.completedAt instanceof Date ? row.completedAt.toISOString() : row.completedAt,
    alternatives,
  };
}

const proposalInclude = {
  alternatives: { orderBy: { order: 'asc' as const } }, threads: true, beats: true,
  constraints: true, questions: true, relations: true,
};

export async function listStoryArchitectureProposalRuns(projectId: string, architectureId: string, database: Database = db) {
  const architecture = await database.storyArchitecture.findFirst({ where: { id: architectureId, projectId }, select: { id: true } });
  if (!architecture) throw new StoryArchitecturePersistenceError(404, '物語設計が見つかりません。');
  const rows = await database.storyArchitectureProposalRun.findMany({
    where: { projectId, architectureId }, orderBy: { createdAt: 'desc' }, take: 20, include: proposalInclude,
  });
  return rows.map(publicStoryArchitectureProposalRun);
}

export function parseStoryArchitectureProposalRequest(value: unknown) {
  const input = assertOnlyKeys(value, ['projectId', 'architectureId', 'operation', 'scope', 'instruction', 'force']);
  if (typeof input.projectId !== 'string' || !input.projectId) throw new StoryArchitecturePersistenceError(400, 'projectIdが必要です。');
  if (typeof input.architectureId !== 'string' || !input.architectureId) throw new StoryArchitecturePersistenceError(400, 'architectureIdが必要です。');
  if (typeof input.operation !== 'string' || !STORY_ARCHITECT_OPERATIONS.includes(input.operation as StoryArchitectOperation)) throw new StoryArchitecturePersistenceError(400, 'operationが不正です。');
  if (typeof input.instruction !== 'string' || !input.instruction.trim() || input.instruction.length > 5000) throw new StoryArchitecturePersistenceError(400, 'instructionは1〜5000文字で指定してください。');
  if (input.force !== undefined && typeof input.force !== 'boolean') throw new StoryArchitecturePersistenceError(400, 'forceはbooleanで指定してください。');
  const scopeInput = assertOnlyKeys(input.scope, ['type', 'id']);
  if (typeof scopeInput.type !== 'string' || !ARCHITECT_SCOPE_TYPES.includes(scopeInput.type as ArchitectScope['type'])) throw new StoryArchitecturePersistenceError(400, 'scope.typeが不正です。');
  if (scopeInput.type !== 'architecture' && (typeof scopeInput.id !== 'string' || !scopeInput.id)) throw new StoryArchitecturePersistenceError(400, '部分scopeにはidが必要です。');
  if (scopeInput.id !== undefined && typeof scopeInput.id !== 'string') throw new StoryArchitecturePersistenceError(400, 'scope.idが不正です。');
  return { projectId: input.projectId, architectureId: input.architectureId, operation: input.operation as StoryArchitectOperation,
    instruction: input.instruction, force: input.force === true,
    scope: { type: scopeInput.type as ArchitectScope['type'], ...(scopeInput.id ? { id: scopeInput.id } : {}) } as ArchitectScope };
}

export async function generateStoryArchitectureProposalForAuthor(value: unknown, database: Database = db) {
  const input = parseStoryArchitectureProposalRequest(value);
  const architecture = await database.storyArchitecture.findFirst({ where: { id: input.architectureId, projectId: input.projectId }, select: { id: true } });
  if (!architecture) throw new StoryArchitecturePersistenceError(404, '物語設計が見つかりません。');
  const result = await generateStoryArchitectProposal(input, { database });
  const run = await database.storyArchitectureProposalRun.findUniqueOrThrow({ where: { id: result.run.id }, include: proposalInclude });
  return { outcome: result.outcome, run: publicStoryArchitectureProposalRun(run) };
}

export function storyArchitectureProposalFailure(error: unknown) {
  if (error instanceof StoryArchitecturePersistenceError) return { status: error.status, message: error.message };
  if (error instanceof StoryArchitectRuntimeError) return { status: error.code === 'invalid_request' ? 400 : 500, message: error.message };
  return { status: 500, message: 'AIによる設計案の生成に失敗しました。' };
}
