import { countGraphemes } from '@/lib/japanese-text/unicode';

export type CreativeRuleUiMode = 'unset' | 'off' | 'reference' | 'required' | 'forbidden';
export type CreativeRuleStateFilter = 'all' | 'configured' | 'unset' | 'review' | 'disabled';
export const BUILTIN_CREATIVE_RULE_UI_MODES: readonly CreativeRuleUiMode[] = ['unset', 'off', 'reference', 'required', 'forbidden'];
export const CUSTOM_CREATIVE_RULE_UI_MODES = ['reference', 'required', 'forbidden'] as const;

export interface CreativeTechniqueAdoptionView {
  id: string; techniqueKey: string; mode: Exclude<CreativeRuleUiMode, 'unset'>; priority: number;
  overridable: boolean; authorAdjustment: string; notes: string; active: boolean; catalogContractVersion: number;
}
export interface CreativeTechniqueView {
  definition: { key: string; category: string; label: string; shortDescription: string; guidance: { reference: string; required: string; forbidden: string }; conflictKeys?: readonly string[] };
  adoption: CreativeTechniqueAdoptionView | null; contractStatus: 'current' | 'outdated'; needsReview: boolean;
}
export interface UnknownCreativeTechniqueView {
  adoption: CreativeTechniqueAdoptionView; definition: null; contractStatus: 'unknown'; needsReview: true;
}

export const CREATIVE_RULE_MODE_EXPLANATIONS: Record<CreativeRuleUiMode, string> = {
  unset: '作品固有の指定なし',
  off: 'この技法を作品の生成・評価基準として採用しない',
  reference: '適用できる場面では参考にする',
  required: 'この作品で原則として従う',
  forbidden: 'この作品ではこの技法を積極的に避ける',
};

export function filterCreativeTechniques(
  values: readonly CreativeTechniqueView[], search: string, category: string, state: CreativeRuleStateFilter,
): CreativeTechniqueView[] {
  const query = search.trim().toLocaleLowerCase('ja');
  return values.filter(value => {
    if (category !== 'all' && value.definition.category !== category) return false;
    if (query && !`${value.definition.label}\n${value.definition.shortDescription}`.toLocaleLowerCase('ja').includes(query)) return false;
    if (state === 'configured' && !value.adoption) return false;
    if (state === 'unset' && value.adoption) return false;
    if (state === 'review' && !value.needsReview) return false;
    if (state === 'disabled' && (!value.adoption || value.adoption.active)) return false;
    return true;
  });
}

export function buildTechniqueCreatePayload(projectId: string, techniqueKey: string, mode: Exclude<CreativeRuleUiMode, 'unset'>) {
  return { projectId, techniqueKey, mode };
}
export function decideTechniqueModeMutation(adoption: CreativeTechniqueAdoptionView | null, next: CreativeRuleUiMode): 'none' | 'create' | 'update' | 'delete' {
  if (next === 'unset') return adoption ? 'delete' : 'none';
  return adoption ? 'update' : 'create';
}
export function buildTechniqueUpdatePayload(projectId: string, adoption: CreativeTechniqueAdoptionView, changes: Partial<Pick<CreativeTechniqueAdoptionView, 'mode' | 'priority' | 'overridable' | 'authorAdjustment' | 'notes' | 'active'>>) {
  return { projectId, id: adoption.id, ...changes };
}
export function buildCustomMutationPayload(projectId: string, value: { id?: string; title: string; instruction: string; category: string; mode: 'reference' | 'required' | 'forbidden'; priority: number; overridable: boolean; notes: string; active: boolean }) {
  return { ...(value.id && { id: value.id }), projectId, title: value.title, instruction: value.instruction, category: value.category,
    mode: value.mode, priority: value.priority, overridable: value.overridable, notes: value.notes, active: value.active };
}

export function validateCustomCreativeRuleDraft(value: { title: string; instruction: string; notes: string; priority: number }): string | null {
  if (!value.title.trim()) return 'タイトルを入力してください。';
  if (value.title.length > 120) return 'タイトルは120文字以内で入力してください。';
  if (!value.instruction.trim()) return '内容を入力してください。';
  if (value.instruction.length > 2000) return '内容は2000文字以内で入力してください。';
  if (value.notes.length > 1000) return '補足は1000文字以内で入力してください。';
  if (!Number.isInteger(value.priority) || value.priority < -100 || value.priority > 100) return '優先度は-100〜100の整数で入力してください。';
  return null;
}

export const graphemeCountLabel = (value: string, maximum: number) => `${countGraphemes(value)}/${maximum}文字（目安）`;
export const isLatestCreativeRulesProject = (responseProjectId: string, currentProjectId: string) => responseProjectId === currentProjectId;
export const isLatestCreativeRuleMutation = (responseToken: number, currentToken: number) => responseToken === currentToken;

export function findExplicitCreativeRuleConflicts(values: readonly CreativeTechniqueView[]): Array<[string, string]> {
  const required = new Map(values.filter(value => value.adoption?.active && value.adoption.mode === 'required').map(value => [value.definition.key, value]));
  const seen = new Set<string>(); const result: Array<[string, string]> = [];
  for (const value of required.values()) for (const conflictKey of value.definition.conflictKeys || []) {
    if (!required.has(conflictKey)) continue;
    const pair = [value.definition.key, conflictKey].sort() as [string, string]; const key = pair.join('\0');
    if (!seen.has(key)) { seen.add(key); result.push(pair); }
  }
  return result.sort((left, right) => left.join(':').localeCompare(right.join(':')));
}
