import type { PairedSymbolRegion, SourceRange } from './japanese-text';
import { matchSymbolOccurrence } from './symbol-dictionary/occurrence-anchor';
import { sortSymbolUsageRules } from './symbol-dictionary/resolver';
import type { SymbolDefinition, SymbolOccurrenceOverride, SymbolUsageRule } from './symbol-dictionary/types';
import type { ContextEntry } from './prompts/ja/context-budget';

export type InspectorSymbolScope = 'target' | 'surrounding';
export type InspectorSymbolResolution =
  | 'confirmed_override'
  | 'confirmed_default'
  | 'meaning_unset'
  | 'no_default'
  | 'malformed'
  | 'override_unresolved'
  | 'override_reanchorable'
  | 'override_ambiguous'
  | 'override_removed'
  | 'inactive_usage_reference';

export interface InspectorSymbolUsageDto {
  id: string;
  label: string;
  description: string;
  semanticKind: SymbolUsageRule['semanticKind'];
  countsAsDialogue: boolean | null;
  countsAsNarration: boolean | null;
  countsAsInnerVoice: boolean | null;
  readerVisible: boolean | null;
  spokenAloud: boolean | null;
  speakerMode: SymbolUsageRule['speakerMode'];
  fixedSpeakerId: string | null;
  fixedSpeakerName: string | null;
  priority: number;
}

export interface InspectorSymbolSemanticDto {
  id: string;
  scope: InspectorSymbolScope;
  startOffset: number;
  endOffset: number;
  openSymbol: string;
  closeSymbol: string;
  rawText: string;
  depth: number;
  parentRegionId: string | null;
  definitionId: string | null;
  definitionLabel: string | null;
  resolution: InspectorSymbolResolution;
  selectedUsage: InspectorSymbolUsageDto | null;
  defaultUsageId: string | null;
  activeUsages: InspectorSymbolUsageDto[];
  overrideId: string | null;
  suggestedRange: SourceRange | null;
}

export interface InspectorSymbolSources {
  definitions: SymbolDefinition[];
  usageRules: SymbolUsageRule[];
  overrides: SymbolOccurrenceOverride[];
}

const pairKey = (openSymbol: string, closeSymbol: string) => `${openSymbol}\u0000${closeSymbol}`;
const overlaps = (left: SourceRange, right: SourceRange) => left.startOffset < right.endOffset && right.startOffset < left.endOffset;

function scopeFor(range: SourceRange, target: SourceRange, before: SourceRange, after: SourceRange): InspectorSymbolScope | null {
  if (overlaps(range, target)) return 'target';
  if (overlaps(range, before) || overlaps(range, after)) return 'surrounding';
  return null;
}

function usageDto(rule: SymbolUsageRule, characterNames: ReadonlyMap<string, string>): InspectorSymbolUsageDto {
  return {
    id: rule.id,
    label: rule.label,
    description: rule.description,
    semanticKind: rule.semanticKind,
    countsAsDialogue: rule.countsAsDialogue,
    countsAsNarration: rule.countsAsNarration,
    countsAsInnerVoice: rule.countsAsInnerVoice,
    readerVisible: rule.readerVisible,
    spokenAloud: rule.spokenAloud,
    speakerMode: rule.speakerMode,
    fixedSpeakerId: rule.fixedSpeakerId,
    fixedSpeakerName: rule.fixedSpeakerId ? characterNames.get(rule.fixedSpeakerId) || null : null,
    priority: rule.priority,
  };
}

function overrideMatch(
  content: string,
  region: SourceRange,
  definitionId: string,
  overrides: readonly SymbolOccurrenceOverride[],
) {
  for (const override of overrides.filter(value => value.definitionId === definitionId)) {
    const match = matchSymbolOccurrence(content, override);
    if (match.status === 'exact' && match.range.startOffset === region.startOffset && match.range.endOffset === region.endOffset) return { override, match };
    if (match.status === 'reanchorable' && match.suggestedRange.startOffset === region.startOffset && match.suggestedRange.endOffset === region.endOffset) return { override, match };
    if (match.status === 'stale' && override.startOffset === region.startOffset && override.endOffset === region.endOffset) return { override, match };
  }
  return null;
}

function overrideResolution(match: ReturnType<typeof matchSymbolOccurrence>, override: SymbolOccurrenceOverride, validRule: boolean): InspectorSymbolResolution {
  if (!validRule) return 'inactive_usage_reference';
  if (match.status === 'reanchorable') return 'override_reanchorable';
  if (match.status === 'stale') return match.reason === 'ambiguous' ? 'override_ambiguous' : 'override_removed';
  return override.status === 'confirmed' ? 'confirmed_override' : 'override_unresolved';
}

export function buildInspectorSymbolSemantics(input: {
  projectId: string;
  chapterId: string;
  content: string;
  targetRange: SourceRange;
  beforeRange: SourceRange;
  afterRange: SourceRange;
  regions: readonly PairedSymbolRegion[];
  symbols: InspectorSymbolSources;
  characterNames: ReadonlyMap<string, string>;
}): InspectorSymbolSemanticDto[] {
  const definitions = input.symbols.definitions.filter(value => value.projectId === input.projectId && value.active);
  const definitionsByPair = new Map(definitions.map(value => [pairKey(value.openSymbol, value.closeSymbol), value]));
  const rules = sortSymbolUsageRules(input.symbols.usageRules.filter(value => value.projectId === input.projectId));
  const rulesById = new Map(rules.map(value => [value.id, value]));
  const rulesByDefinition = new Map<string, SymbolUsageRule[]>();
  for (const rule of rules.filter(value => value.active)) {
    const values = rulesByDefinition.get(rule.definitionId) || [];
    values.push(rule);
    rulesByDefinition.set(rule.definitionId, values);
  }
  const overrides = input.symbols.overrides.filter(value => value.projectId === input.projectId && value.chapterId === input.chapterId);
  const matchedOverrideIds = new Set<string>();
  const result: InspectorSymbolSemanticDto[] = [];

  for (const region of input.regions) {
    const scope = scopeFor(region, input.targetRange, input.beforeRange, input.afterRange);
    if (!scope) continue;
    const definition = definitionsByPair.get(pairKey(region.openSymbol, region.closeSymbol)) || null;
    const activeRules = definition ? rulesByDefinition.get(definition.id) || [] : [];
    const matched = definition ? overrideMatch(input.content, region, definition.id, overrides) : null;
    if (matched) matchedOverrideIds.add(matched.override.id);
    const matchedRule = matched?.override.usageRuleId ? rulesById.get(matched.override.usageRuleId) || null : null;
    const validMatchedRule = Boolean(matchedRule?.active && matchedRule.definitionId === definition?.id);
    const defaultRule = definition?.defaultUsageRuleId ? rulesById.get(definition.defaultUsageRuleId) || null : null;
    const validDefault = Boolean(defaultRule?.active && defaultRule.definitionId === definition?.id);
    let resolution: InspectorSymbolResolution;
    let selectedRule: SymbolUsageRule | null = null;
    let suggestedRange: SourceRange | null = null;
    if (region.status !== 'closed') resolution = 'malformed';
    else if (matched) {
      resolution = overrideResolution(matched.match, matched.override, validMatchedRule);
      if (resolution === 'confirmed_override') selectedRule = matchedRule;
      if (matched.match.status === 'reanchorable') suggestedRange = matched.match.suggestedRange;
    } else if (!definition) resolution = 'meaning_unset';
    else if (validDefault) { resolution = 'confirmed_default'; selectedRule = defaultRule; }
    else if (definition.defaultUsageRuleId) resolution = 'inactive_usage_reference';
    else resolution = 'no_default';
    result.push({
      id: `region:${region.startOffset}:${region.endOffset}:${definition?.id || pairKey(region.openSymbol, region.closeSymbol)}`,
      scope, startOffset: region.startOffset, endOffset: region.endOffset,
      openSymbol: region.openSymbol, closeSymbol: region.closeSymbol,
      rawText: input.content.slice(region.startOffset, region.endOffset), depth: region.depth,
      parentRegionId: region.parentRegionId, definitionId: definition?.id || null,
      definitionLabel: definition?.label || null, resolution,
      selectedUsage: selectedRule ? usageDto(selectedRule, input.characterNames) : null,
      defaultUsageId: validDefault ? defaultRule!.id : null,
      activeUsages: activeRules.map(rule => usageDto(rule, input.characterNames)),
      overrideId: matched?.override.id || null, suggestedRange,
    });
  }

  // Preserve unresolved author intent even when its old region no longer parses.
  for (const override of overrides) {
    if (matchedOverrideIds.has(override.id)) continue;
    const match = matchSymbolOccurrence(input.content, override);
    const candidate = match.status === 'reanchorable' ? match.suggestedRange : { startOffset: override.startOffset, endOffset: override.endOffset };
    const scope = scopeFor(candidate, input.targetRange, input.beforeRange, input.afterRange);
    if (!scope) continue;
    const definition = definitions.find(value => value.id === override.definitionId) || null;
    const rule = override.usageRuleId ? rulesById.get(override.usageRuleId) || null : null;
    const validRule = Boolean(rule?.active && rule.definitionId === definition?.id);
    const unresolvedRegionIndex = result.findIndex(value => value.startOffset === candidate.startOffset
      && value.endOffset === candidate.endOffset && value.resolution === 'meaning_unset');
    if (unresolvedRegionIndex >= 0) result.splice(unresolvedRegionIndex, 1);
    result.push({
      id: `override:${override.id}`, scope, startOffset: candidate.startOffset, endOffset: candidate.endOffset,
      openSymbol: definition?.openSymbol || '', closeSymbol: definition?.closeSymbol || '', rawText: override.exactExcerpt,
      depth: 0, parentRegionId: null, definitionId: definition?.id || override.definitionId,
      definitionLabel: definition?.label || null, resolution: overrideResolution(match, override, validRule),
      selectedUsage: null,
      defaultUsageId: null,
      activeUsages: definition ? (rulesByDefinition.get(definition.id) || []).map(value => usageDto(value, input.characterNames)) : [],
      overrideId: override.id,
      suggestedRange: match.status === 'reanchorable' ? match.suggestedRange : null,
    });
  }

  return result.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset || a.id.localeCompare(b.id));
}

const nullable = (value: boolean | null) => value === null ? '未指定' : value ? 'true' : 'false';
const quoted = (value: string) => JSON.stringify(value);

function usageText(usage: InspectorSymbolUsageDto, selected: boolean) {
  return `${selected ? '選択中' : '利用候補'} Usage ID：${quoted(usage.id)}\n名称：${quoted(usage.label)}\n説明：${usage.description ? quoted(usage.description) : 'なし'}\npriority：${usage.priority}\nsemanticKind：${usage.semanticKind}\ncountsAsDialogue：${nullable(usage.countsAsDialogue)}\ncountsAsNarration：${nullable(usage.countsAsNarration)}\ncountsAsInnerVoice：${nullable(usage.countsAsInnerVoice)}\nreaderVisible：${nullable(usage.readerVisible)}\nspokenAloud：${nullable(usage.spokenAloud)}\nspeakerMode：${usage.speakerMode}${usage.speakerMode === 'fixed_character' ? `\nfixed speaker：${usage.fixedSpeakerName ? quoted(usage.fixedSpeakerName) : '参照先を確認できない'}（${usage.fixedSpeakerId ? quoted(usage.fixedSpeakerId) : 'IDなし'}）` : ''}`;
}

export function inspectorSymbolContextEntry(value: InspectorSymbolSemanticDto): ContextEntry {
  const interpretation = value.resolution === 'confirmed_override'
    ? 'このOccurrenceだけの作者確認済み個別指定（Project既定より優先。ほかの箇所へ一般化しない）'
    : value.resolution === 'confirmed_default'
      ? '作者確認済みProject既定用途'
      : value.resolution === 'meaning_unset' ? '意味未設定（一般慣習を作者設定として確定しない）'
        : value.resolution === 'no_default' ? 'active Usageはあるが既定用途未設定（勝手に一つを選ばない）'
          : value.resolution === 'malformed' ? '記号構造が不完全（confirmed semanticとして扱わない）'
            : value.resolution === 'override_reanchorable' ? '過去の個別指定に再対応候補があるが未確認（confirmed扱い・既定へのfallback禁止）'
              : value.resolution === 'override_ambiguous' ? '過去の個別指定の対応先が曖昧（confirmed扱い・既定へのfallback禁止）'
                : value.resolution === 'override_removed' ? '過去の個別指定の対応先を現在本文で確認できない（confirmed扱い・既定へのfallback禁止）'
                  : value.resolution === 'inactive_usage_reference' ? '作者指定がinactive/不正なUsageを参照（要再確認。別の既定用途へのfallback禁止）'
                    : '個別指定が未確認（confirmed扱い・既定へのfallback禁止）';
  const usages = value.activeUsages.map(rule => usageText(rule, rule.id === value.selectedUsage?.id)).join('\n---\n') || 'active Usageなし';
  return {
    id: `symbol:${value.id}`,
    tier: value.scope === 'target' ? 1 : 2,
    relevance: value.scope === 'target' ? 150 : 80,
    full: `【作品固有の表記辞書／${value.scope === 'target' ? '検査対象内' : '前後参考'}】\n範囲：${value.startOffset}-${value.endOffset}\n記号：${quoted(value.openSymbol)}…${quoted(value.closeSymbol)}\n本文：${quoted(value.rawText)}\nDefinition：${value.definitionLabel ? quoted(value.definitionLabel) : '意味未設定'}${value.definitionId ? `（${quoted(value.definitionId)}）` : ''}\n解釈状態：${value.resolution}\n扱い：${interpretation}\n深さ：${value.depth}\nOverride：${value.overrideId ? quoted(value.overrideId) : 'なし'}${value.suggestedRange ? `\n再対応候補：${value.suggestedRange.startOffset}-${value.suggestedRange.endOffset}` : ''}\n${usages}`,
  };
}
