import {
  CREATIVE_RULE_MODES, CREATIVE_RULE_SOURCES, CREATIVE_RULE_SURFACES, CREATIVE_TECHNIQUE_CATEGORIES,
  REGISTERED_CREATIVE_EVALUATOR_KEYS,
  type CreativeRuleValidationIssue, type CreativeTechniqueDefinition, type ProjectCreativeRule,
} from './types';

const issue = (code: string, path: string, message: string): CreativeRuleValidationIssue => ({ code, path, message });
const textWithin = (value: unknown, maximum: number, required = false) => typeof value === 'string' && value.length <= maximum && (!required || value.trim().length > 0);

export function validateCreativeTechniqueCatalog(catalog: readonly CreativeTechniqueDefinition[]): CreativeRuleValidationIssue[] {
  const issues: CreativeRuleValidationIssue[] = [];
  const keys = new Set<string>();
  catalog.forEach((value, index) => {
    const path = `catalog[${index}]`;
    if (keys.has(value.key)) issues.push(issue('duplicate_catalog_key', `${path}.key`, `Technique key「${value.key}」が重複しています。`));
    keys.add(value.key);
    if (!value.label.trim()) issues.push(issue('empty_label', `${path}.label`, '日本語ラベルは必須です。'));
    if (!value.shortDescription.trim()) issues.push(issue('empty_description', `${path}.shortDescription`, '技法説明は必須です。'));
    if (!CREATIVE_TECHNIQUE_CATEGORIES.includes(value.category)) issues.push(issue('invalid_category', `${path}.category`, 'Technique categoryが不正です。'));
    if (!Number.isInteger(value.catalogContractVersion) || value.catalogContractVersion < 1) issues.push(issue('invalid_contract_version', `${path}.catalogContractVersion`, 'Catalog contract versionは1以上の整数で指定してください。'));
    for (const mode of ['reference', 'required', 'forbidden'] as const) if (!value.guidance[mode]?.trim()) issues.push(issue('empty_guidance', `${path}.guidance.${mode}`, `${mode} guidanceは必須です。`));
    if (value.applicableSurfaces.length === 0) issues.push(issue('empty_surfaces', `${path}.applicableSurfaces`, '適用surfaceを1件以上指定してください。'));
    const surfaces = new Set<string>();
    value.applicableSurfaces.forEach((surface, surfaceIndex) => {
      if (!CREATIVE_RULE_SURFACES.includes(surface)) issues.push(issue('invalid_surface', `${path}.applicableSurfaces[${surfaceIndex}]`, '適用surfaceが不正です。'));
      if (surfaces.has(surface)) issues.push(issue('duplicate_surface', `${path}.applicableSurfaces[${surfaceIndex}]`, '適用surfaceが重複しています。'));
      surfaces.add(surface);
    });
    if (value.evaluatorKey && !REGISTERED_CREATIVE_EVALUATOR_KEYS.includes(value.evaluatorKey)) issues.push(issue('unknown_evaluator', `${path}.evaluatorKey`, '未登録のevaluator keyです。'));
    value.conflictKeys?.forEach((conflictKey, conflictIndex) => {
      if (conflictKey === value.key) issues.push(issue('self_conflict', `${path}.conflictKeys[${conflictIndex}]`, '自分自身をconflictへ指定できません。'));
    });
  });
  catalog.forEach((value, index) => value.conflictKeys?.forEach((conflictKey, conflictIndex) => {
    if (!keys.has(conflictKey)) issues.push(issue('unknown_conflict_key', `catalog[${index}].conflictKeys[${conflictIndex}]`, `未登録のconflict key「${conflictKey}」です。`));
  }));
  return issues;
}

export function validateProjectCreativeRule(rule: ProjectCreativeRule, catalog: readonly CreativeTechniqueDefinition[]): CreativeRuleValidationIssue[] {
  const issues: CreativeRuleValidationIssue[] = [];
  const path = `rules[${rule.id || '?'}]`;
  if (!textWithin(rule.id, 200, true)) issues.push(issue('invalid_id', `${path}.id`, 'Rule IDは1〜200文字で指定してください。'));
  if (!Number.isInteger(rule.priority) || rule.priority < -100 || rule.priority > 100) issues.push(issue('invalid_priority', `${path}.priority`, '優先度は-100〜100の整数で指定してください。'));
  if (typeof rule.active !== 'boolean') issues.push(issue('invalid_active', `${path}.active`, 'activeが不正です。'));
  if (typeof rule.overridable !== 'boolean') issues.push(issue('invalid_overridable', `${path}.overridable`, 'overridableが不正です。'));
  if (!CREATIVE_RULE_SOURCES.includes(rule.source)) issues.push(issue('invalid_source', `${path}.source`, 'Rule sourceが不正です。'));
  if (rule.notes !== undefined && rule.notes !== null && !textWithin(rule.notes, 1000)) issues.push(issue('notes_too_long', `${path}.notes`, 'notesは1000文字以内で指定してください。'));
  if (rule.kind === 'builtin') {
    if (!catalog.some(value => value.key === rule.techniqueKey)) issues.push(issue('unknown_technique_key', `${path}.techniqueKey`, '未登録のbuilt-in technique keyです。'));
    if (!CREATIVE_RULE_MODES.includes(rule.mode)) issues.push(issue('invalid_mode', `${path}.mode`, 'Creative Rule modeが不正です。'));
    if (rule.authorAdjustment !== undefined && rule.authorAdjustment !== null && !textWithin(rule.authorAdjustment, 2000)) issues.push(issue('adjustment_too_long', `${path}.authorAdjustment`, 'authorAdjustmentは2000文字以内で指定してください。'));
  } else if (rule.kind === 'custom') {
    if (!textWithin(rule.title, 120, true)) issues.push(issue('invalid_title', `${path}.title`, 'Custom Rule名は1〜120文字で指定してください。'));
    if (!textWithin(rule.instruction, 2000, true)) issues.push(issue('invalid_instruction', `${path}.instruction`, 'Custom Rule本文は1〜2000文字で指定してください。'));
    if (!CREATIVE_TECHNIQUE_CATEGORIES.includes(rule.category)) issues.push(issue('invalid_category', `${path}.category`, 'Custom Rule categoryが不正です。'));
    if (rule.mode === 'off') issues.push(issue('custom_off_not_allowed', `${path}.mode`, 'Custom Ruleではoffを使用せず、active=falseで無効化してください。'));
    else if (!CREATIVE_RULE_MODES.includes(rule.mode)) issues.push(issue('invalid_mode', `${path}.mode`, 'Creative Rule modeが不正です。'));
  } else {
    issues.push(issue('invalid_kind', `${path}.kind`, 'Creative Rule kindが不正です。'));
  }
  return issues;
}
