export const STORY_MEANING_HISTORY_LIMIT = 20;

export interface StoryMeaningEntityLabel {
  type: string;
  id: string;
  label: string;
  deleted: boolean;
}

export interface StoryMeaningDecisionDto {
  id: string;
  decision: string;
  authorInterpretation: string;
  createdAt: string;
  fresh: boolean;
}

export interface StoryMeaningClaimDto {
  id: string;
  statement: string;
  layer: string;
  dimension: string;
  supportLevel: string;
  impactScope: string | null;
  subtype: string | null;
  evidenceRefs: string[];
  relatedEntities: StoryMeaningEntityLabel[];
  latestDecision: StoryMeaningDecisionDto | null;
  decisionHistory: StoryMeaningDecisionDto[];
}

export interface StoryMeaningEventDto {
  id: string;
  summary: string;
  evidence: Array<{ localEvidenceKey: string; startOffset: number; endOffset: number; exactExcerpt: string; evidenceType: string }>;
  actors: StoryMeaningEntityLabel[];
  claims: StoryMeaningClaimDto[];
}

export interface StoryMeaningRunDto {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  fresh: boolean;
  errorCode: string;
  createdAt: string;
  completedAt: string | null;
  events: StoryMeaningEventDto[];
}

export type StoryMeaningUiState = 'unanalysed' | 'pending' | 'fresh' | 'stale' | 'failed';

export function resolveStoryMeaningUiState(runs: readonly StoryMeaningRunDto[]): StoryMeaningUiState {
  const latest = runs[0];
  if (!latest) return 'unanalysed';
  if (latest.status === 'pending') return 'pending';
  if (latest.status === 'failed') return 'failed';
  return latest.fresh ? 'fresh' : 'stale';
}

export function validateStoryMeaningDecisionDraft(decision: string, authorInterpretation: string): string | null {
  if (!['adopted', 'alternative', 'held', 'not_applicable'].includes(decision)) return '作者判断の入力が不正です。';
  if (authorInterpretation.length > 4_000) return '作者の別解釈は4,000文字以内で入力してください。';
  if (decision === 'alternative' && !authorInterpretation.trim()) return '別解釈の内容を入力してください。';
  if (decision !== 'alternative' && authorInterpretation.trim()) return '解釈文は「別解釈」を選んだ場合だけ入力できます。';
  return null;
}

type EntityNames = Partial<Record<string, ReadonlyMap<string, string>>>;

const dateValue = (value: unknown): string | null => value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : null;
const records = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>> : [];
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function entityLabel(raw: Record<string, unknown>, names: EntityNames): StoryMeaningEntityLabel {
  const type = typeof raw.type === 'string' ? raw.type : 'unknown';
  const id = typeof raw.id === 'string' ? raw.id : '';
  const label = names[type]?.get(id);
  return { type, id, label: label || '削除済みの参照', deleted: !label };
}

function decisionDto(raw: Record<string, unknown>): StoryMeaningDecisionDto {
  return {
    id: String(raw.id || ''), decision: String(raw.decision || ''),
    authorInterpretation: String(raw.authorInterpretation || ''), createdAt: dateValue(raw.createdAt) || '', fresh: raw.fresh === true,
  };
}

export function toStoryMeaningRunDto(raw: Record<string, unknown>, names: EntityNames = {}): StoryMeaningRunDto {
  return {
    id: String(raw.id || ''),
    status: ['pending', 'completed', 'failed'].includes(String(raw.status)) ? raw.status as StoryMeaningRunDto['status'] : 'failed',
    fresh: raw.fresh === true,
    errorCode: typeof raw.error === 'string' ? raw.error : '',
    createdAt: dateValue(raw.createdAt) || '', completedAt: dateValue(raw.completedAt),
    events: records(raw.events).map(event => ({
      id: String(event.id || ''), summary: String(event.summary || ''),
      evidence: records(event.evidence).map(evidence => ({
        localEvidenceKey: String(evidence.localEvidenceKey || ''), startOffset: Number(evidence.startOffset), endOffset: Number(evidence.endOffset),
        exactExcerpt: String(evidence.exactExcerpt || ''), evidenceType: String(evidence.evidenceType || ''),
      })),
      actors: records(event.actorRefs).map(ref => entityLabel(ref, names)),
      claims: records(event.claims).map(claim => {
        const history = records(claim.decisionHistory).map(decisionDto);
        return {
          id: String(claim.id || ''), statement: String(claim.statement || ''), layer: String(claim.layer || ''),
          dimension: String(claim.dimension || ''), supportLevel: String(claim.supportLevel || ''),
          impactScope: typeof claim.impactScope === 'string' ? claim.impactScope : null,
          subtype: typeof claim.subtype === 'string' ? claim.subtype : null,
          evidenceRefs: strings(claim.evidenceRefs), relatedEntities: records(claim.relatedEntityRefs).map(ref => entityLabel(ref, names)),
          latestDecision: history[0] || null, decisionHistory: history,
        };
      }),
    })),
  };
}
