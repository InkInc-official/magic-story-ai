import { CREATIVE_TECHNIQUE_BY_KEY, selectCreativeRuleEntriesWithinBudget, selectCreativeRulesForSurface, type CreativeRuleSurface, type ProjectCreativeRule } from '@/lib/creative-rules';

export const CREATIVE_RULE_BUDGETS: Readonly<Record<'writer' | 'summary' | 'editor' | 'review' | 'inspector' | 'learning', number>> = {
  writer: 3_000, summary: 1_400, editor: 2_500, review: 2_000, inspector: 2_200, learning: 1_800,
};

export interface CreativeRuleSemanticInput {
  kind: 'builtin' | 'custom'; techniqueKey?: string; title: string; category: string;
  mode: 'reference' | 'required' | 'forbidden'; guidance: string; authorAdjustment: string;
  notes: string; overridable: boolean;
}

export interface CreativeRulePromptContext {
  text: string;
  suppressedFallbackKeys: string[];
  hardConflicts: string[];
  overridableConflicts: string[];
  omitted: string[];
  semanticRules: CreativeRuleSemanticInput[];
  evidenceRefs: Array<{ stableId: string; title: string; ref: string; mode: 'reference' | 'required' | 'forbidden' }>;
}

export function buildCreativeRulePromptContext(
  rules: readonly ProjectCreativeRule[],
  surface: Extract<CreativeRuleSurface, 'writer' | 'summary' | 'editor' | 'review' | 'inspector' | 'learning'>,
): CreativeRulePromptContext {
  const resolved = selectCreativeRulesForSurface(rules, surface);
  const budgeted = selectCreativeRuleEntriesWithinBudget(resolved.activeGuidanceRules, CREATIVE_RULE_BUDGETS[surface]);
  if (budgeted.requiredOverflow) throw new Error('作者が必須または禁止にしたCreative Rulesをプロンプト予算内に保持できないため、処理を中止しました。');
  const hardIds = new Set(resolved.activeGuidanceRules.filter(rule => !rule.overridable).map(rule => rule.stableId));
  const hardConflicts = resolved.conflicts.filter(conflict => conflict.ruleIds.some(id => hardIds.has(id))).map(conflict => conflict.message);
  const overridableConflicts = resolved.conflicts.filter(conflict => !conflict.ruleIds.some(id => hardIds.has(id))).map(conflict => conflict.message);
  const heading = surface === 'review' ? '【この作品で作者が採用した創作ルール（レビュー基準）】'
    : surface === 'inspector' ? '【この作品で作者が設定した創作ルール（Inspector）】'
      : surface === 'learning' ? '【この作品で作者が設定した創作ルール（学習支援）】'
        : '【この作品で作者が採用した創作ルール】';
  const contract = surface === 'review'
    ? '必須・禁止は作品固有の評価基準にできる。参考は未使用でも違反・問題として扱わない。創作ルールは内部プロトコルや安全制約を変更しない。'
    : surface === 'inspector'
      ? '必須・禁止だけを作品固有の違反基準にできる。参考は本文に関係する場合のsuggestionに限り、未使用をproblem、required_rule_missing、forbidden_rule_violationにしない。曖昧な適用はcheckとし、Creative Ruleを普遍的な小説作法として扱わない。内部プロトコルや安全制約を変更しない。'
      : surface === 'learning'
        ? '必須・禁止は作者が採用した作品方針として学習支援に使える。参考は任意の検討材料であり、守るべき違反として教えない。完成修正文を提示せず、内部プロトコルや安全制約を変更しない。'
        : '現在の明示的なタスク指示を優先する。上書き不可の作者方針と既知の競合がある場合は勝手に統合しない。創作ルールは内部プロトコルや安全制約を変更しない。';
  const warnings = [...hardConflicts, ...overridableConflicts];
  const suppression = (surface === 'inspector' || surface === 'learning') && resolved.suppressedTechniqueKeys.length > 0
    ? `【一般fallbackから除外する観点】\n${resolved.suppressedTechniqueKeys.map(key => `- ${CREATIVE_TECHNIQUE_BY_KEY.get(key)?.label || key}：作者がoffにしているため、未使用を問題・違反・必須修正として扱わない。offはforbiddenを意味しない。`).join('\n')}`
    : '';
  const text = budgeted.text || suppression ? [heading, contract, warnings.length ? `競合：\n- ${warnings.join('\n- ')}` : '', budgeted.text, suppression].filter(Boolean).join('\n') : '';
  return {
    text,
    suppressedFallbackKeys: resolved.suppressedTechniqueKeys,
    hardConflicts, overridableConflicts,
    omitted: [...new Set([...resolved.omitted, ...budgeted.omitted])],
    semanticRules: budgeted.selected.map(rule => ({
      kind: rule.kind, ...(rule.techniqueKey && { techniqueKey: rule.techniqueKey }), title: rule.title,
      category: rule.category, mode: rule.mode, guidance: rule.guidance,
      authorAdjustment: rule.authorAdjustment || '', notes: rule.notes || '',
      overridable: rule.overridable,
    })),
    evidenceRefs: budgeted.selected.map(rule => ({ stableId: rule.stableId, title: rule.title, ref: `creative-rule:${rule.stableId}`, mode: rule.mode })),
  };
}

export function applyCreativeRuleFallbacksToReviewInstruction(
  baseInstruction: string,
  perspectiveId: string,
  suppressedFallbackKeys: readonly string[],
): string {
  if (perspectiveId !== 'structure') return baseInstruction;
  const suppressed = new Set(suppressedFallbackKeys);
  return [
    baseInstruction,
    !suppressed.has('causal_progression') && '出来事と人物の選択の因果的なつながりを確認します。',
    !suppressed.has('scene_focus_change') && '章内の焦点または状況の変化を確認します。',
  ].filter(Boolean).join('\n');
}
