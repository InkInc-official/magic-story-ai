import { BUILTIN_SYMBOL_PAIRS, countGraphemes } from '../japanese-text';
import {
  SYMBOL_OVERRIDE_STATUSES,
  SYMBOL_RULE_PROVENANCES,
  SYMBOL_SEMANTIC_KINDS,
  SYMBOL_SPEAKER_MODES,
  type SymbolDefinition,
  type SymbolDictionaryValidationIssue,
  type SymbolOccurrenceOverride,
  type SymbolUsageRule,
} from './types';

export const SYMBOL_MAX_GRAPHEMES = 8;
export const SYMBOL_LABEL_MAX_CHARACTERS = 120;
export const SYMBOL_DESCRIPTION_MAX_CHARACTERS = 4_000;
export const SYMBOL_PRIORITY_MIN = -1_000;
export const SYMBOL_PRIORITY_MAX = 1_000;

const controlCharacter = /[\p{Cc}\p{Cf}]/u;
const lineBreak = /[\r\n]/u;
const pairKey = (openSymbol: string, closeSymbol: string) => `${openSymbol}\u0000${closeSymbol}`;

function issue(code: string, path: string, message: string): SymbolDictionaryValidationIssue {
  return { code, path, message };
}

function validateSymbol(value: string, path: string): SymbolDictionaryValidationIssue[] {
  const result: SymbolDictionaryValidationIssue[] = [];
  if (!value) result.push(issue('empty_symbol', path, '記号は空にできません。'));
  if (lineBreak.test(value)) result.push(issue('line_break_symbol', path, '記号に改行は使用できません。'));
  if (controlCharacter.test(value)) result.push(issue('control_character_symbol', path, '記号に制御文字は使用できません。'));
  if (value && countGraphemes(value) > SYMBOL_MAX_GRAPHEMES) result.push(issue('symbol_too_long', path, `記号は${SYMBOL_MAX_GRAPHEMES}書記素以内で指定してください。`));
  return result;
}

export function validateSymbolDefinitions(definitions: readonly SymbolDefinition[]): SymbolDictionaryValidationIssue[] {
  const result: SymbolDictionaryValidationIssue[] = [];
  const pairs = new Map<string, number>();
  const openers = new Map<string, { closeSymbol: string; index: number }>();
  const builtInByOpen = new Map(BUILTIN_SYMBOL_PAIRS.map(value => [value.openSymbol, value.closeSymbol]));

  definitions.forEach((definition, index) => {
    const path = `definitions[${index}]`;
    if (!definition.id) result.push(issue('missing_id', `${path}.id`, 'Definition IDが必要です。'));
    if (!definition.projectId) result.push(issue('missing_project_id', `${path}.projectId`, 'Project IDが必要です。'));
    result.push(...validateSymbol(definition.openSymbol, `${path}.openSymbol`));
    result.push(...validateSymbol(definition.closeSymbol, `${path}.closeSymbol`));
    if (!definition.label.trim() || definition.label.length > SYMBOL_LABEL_MAX_CHARACTERS) result.push(issue('invalid_label', `${path}.label`, `ラベルは1〜${SYMBOL_LABEL_MAX_CHARACTERS}文字で指定してください。`));
    if (!Number.isInteger(definition.order)) result.push(issue('invalid_order', `${path}.order`, 'orderは整数で指定してください。'));

    const key = pairKey(definition.openSymbol, definition.closeSymbol);
    const duplicate = pairs.get(key);
    if (duplicate !== undefined) result.push(issue('duplicate_pair', path, `同じ記号対がdefinitions[${duplicate}]と重複しています。`));
    else pairs.set(key, index);

    const previous = openers.get(definition.openSymbol);
    if (previous && previous.closeSymbol !== definition.closeSymbol) result.push(issue('same_opener_different_closer', path, `同じ開始記号に異なる終了記号は指定できません（definitions[${previous.index}]）。`));
    else openers.set(definition.openSymbol, { closeSymbol: definition.closeSymbol, index });

    const builtInClose = builtInByOpen.get(definition.openSymbol);
    if (builtInClose && builtInClose !== definition.closeSymbol) result.push(issue('builtin_opener_conflict', path, '組み込み開始記号に異なる終了記号は指定できません。'));
  });
  return result;
}

export function validateSymbolUsageRules(rules: readonly SymbolUsageRule[]): SymbolDictionaryValidationIssue[] {
  const result: SymbolDictionaryValidationIssue[] = [];
  rules.forEach((rule, index) => {
    const path = `usageRules[${index}]`;
    if (!rule.id) result.push(issue('missing_id', `${path}.id`, 'Usage Rule IDが必要です。'));
    if (!rule.projectId || !rule.definitionId) result.push(issue('missing_reference', path, 'Project IDとDefinition IDが必要です。'));
    if (!rule.label.trim() || rule.label.length > SYMBOL_LABEL_MAX_CHARACTERS) result.push(issue('invalid_label', `${path}.label`, `ラベルは1〜${SYMBOL_LABEL_MAX_CHARACTERS}文字で指定してください。`));
    if (rule.description.length > SYMBOL_DESCRIPTION_MAX_CHARACTERS) result.push(issue('description_too_long', `${path}.description`, `説明は${SYMBOL_DESCRIPTION_MAX_CHARACTERS}文字以内で指定してください。`));
    if (!SYMBOL_SEMANTIC_KINDS.includes(rule.semanticKind)) result.push(issue('invalid_semantic_kind', `${path}.semanticKind`, 'semanticKindが不正です。'));
    if (!SYMBOL_SPEAKER_MODES.includes(rule.speakerMode)) result.push(issue('invalid_speaker_mode', `${path}.speakerMode`, 'speakerModeが不正です。'));
    if (!SYMBOL_RULE_PROVENANCES.includes(rule.provenance)) result.push(issue('invalid_provenance', `${path}.provenance`, 'provenanceが不正です。'));
    if (!Number.isInteger(rule.priority) || rule.priority < SYMBOL_PRIORITY_MIN || rule.priority > SYMBOL_PRIORITY_MAX) result.push(issue('invalid_priority', `${path}.priority`, `priorityは${SYMBOL_PRIORITY_MIN}〜${SYMBOL_PRIORITY_MAX}の整数で指定してください。`));
    if (rule.speakerMode === 'fixed_character' && !rule.fixedSpeakerId) result.push(issue('missing_fixed_speaker', `${path}.fixedSpeakerId`, 'fixed_characterにはfixedSpeakerIdが必要です。'));
    if (rule.speakerMode !== 'fixed_character' && rule.fixedSpeakerId !== null) result.push(issue('unexpected_fixed_speaker', `${path}.fixedSpeakerId`, 'fixed_character以外ではfixedSpeakerIdを指定できません。'));
  });
  return result;
}

export function validateSymbolOccurrenceOverrides(overrides: readonly SymbolOccurrenceOverride[]): SymbolDictionaryValidationIssue[] {
  const result: SymbolDictionaryValidationIssue[] = [];
  overrides.forEach((override, index) => {
    const path = `overrides[${index}]`;
    if (!override.id || !override.projectId || !override.chapterId || !override.definitionId) result.push(issue('missing_reference', path, 'OverrideのIDと参照IDが必要です。'));
    if (!SYMBOL_OVERRIDE_STATUSES.includes(override.status)) result.push(issue('invalid_override_status', `${path}.status`, 'Override statusが不正です。'));
    if (!Number.isInteger(override.startOffset) || !Number.isInteger(override.endOffset) || override.startOffset < 0 || override.endOffset <= override.startOffset) result.push(issue('invalid_range', path, 'Occurrence rangeが不正です。'));
    if (!override.exactExcerpt) result.push(issue('empty_excerpt', `${path}.exactExcerpt`, 'exactExcerptが必要です。'));
    if (override.status === 'confirmed' && !override.usageRuleId) result.push(issue('missing_usage_rule', `${path}.usageRuleId`, 'confirmed OverrideにはUsage Ruleが必要です。'));
  });
  return result;
}

export function validateSymbolDictionary(input: {
  projectId: string;
  definitions: readonly SymbolDefinition[];
  usageRules: readonly SymbolUsageRule[];
  overrides?: readonly SymbolOccurrenceOverride[];
}): SymbolDictionaryValidationIssue[] {
  const result = [
    ...validateSymbolDefinitions(input.definitions),
    ...validateSymbolUsageRules(input.usageRules),
    ...validateSymbolOccurrenceOverrides(input.overrides || []),
  ];
  const definitions = new Map(input.definitions.map(value => [value.id, value]));
  const rules = new Map(input.usageRules.map(value => [value.id, value]));

  input.definitions.forEach((definition, index) => {
    if (definition.projectId !== input.projectId) result.push(issue('project_mismatch', `definitions[${index}].projectId`, 'DefinitionのProjectが一致しません。'));
    if (!definition.defaultUsageRuleId) return;
    const rule = rules.get(definition.defaultUsageRuleId);
    if (!rule || rule.definitionId !== definition.id || !rule.active) result.push(issue('invalid_default_usage', `definitions[${index}].defaultUsageRuleId`, 'default Usage Ruleは同じDefinitionのactive ruleである必要があります。'));
  });
  input.usageRules.forEach((rule, index) => {
    const definition = definitions.get(rule.definitionId);
    if (rule.projectId !== input.projectId || !definition || definition.projectId !== input.projectId) result.push(issue('project_or_definition_mismatch', `usageRules[${index}]`, 'Usage RuleのProjectまたはDefinitionが一致しません。'));
  });
  (input.overrides || []).forEach((override, index) => {
    const definition = definitions.get(override.definitionId);
    const rule = override.usageRuleId ? rules.get(override.usageRuleId) : null;
    if (override.projectId !== input.projectId || !definition) result.push(issue('project_or_definition_mismatch', `overrides[${index}]`, 'OverrideのProjectまたはDefinitionが一致しません。'));
    if (rule && rule.definitionId !== override.definitionId) result.push(issue('override_rule_mismatch', `overrides[${index}].usageRuleId`, 'OverrideのUsage Ruleは同じDefinitionに属する必要があります。'));
  });
  return result;
}
