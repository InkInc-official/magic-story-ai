import { analyzeJapaneseTextSource } from '../japanese-text';
import { matchSymbolOccurrence } from './occurrence-anchor';
import { buildRuntimeSymbolPairDefinitions, sortSymbolDefinitions } from './runtime-definitions';
import type {
  ConventionalSymbolSuggestion,
  ResolveSymbolOccurrencesInput,
  ResolveSymbolOccurrencesResult,
  ResolvedSymbolOccurrence,
  SymbolDefinition,
  SymbolOccurrenceOverride,
  SymbolUsageRule,
} from './types';
import { validateSymbolDictionary } from './validation';

const pairKey = (openSymbol: string, closeSymbol: string) => `${openSymbol}\u0000${closeSymbol}`;

export function sortSymbolUsageRules(rules: readonly SymbolUsageRule[]): SymbolUsageRule[] {
  return [...rules].sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
}

export function sortSymbolOccurrenceOverrides(overrides: readonly SymbolOccurrenceOverride[]): SymbolOccurrenceOverride[] {
  return [...overrides].sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset || left.id.localeCompare(right.id));
}

function conventionFor(values: readonly ConventionalSymbolSuggestion[], openSymbol: string, closeSymbol: string) {
  return values.find(value => value.openSymbol === openSymbol && value.closeSymbol === closeSymbol) || null;
}

function relevantOverride(
  content: string,
  region: { startOffset: number; endOffset: number },
  definition: SymbolDefinition,
  overrides: readonly SymbolOccurrenceOverride[],
) {
  for (const override of overrides.filter(value => value.definitionId === definition.id)) {
    const match = matchSymbolOccurrence(content, override);
    if (match.status === 'exact' && match.range.startOffset === region.startOffset && match.range.endOffset === region.endOffset) return { override, match };
    if (match.status === 'reanchorable' && match.suggestedRange.startOffset === region.startOffset && match.suggestedRange.endOffset === region.endOffset) return { override, match };
    if (match.status === 'stale' && override.startOffset === region.startOffset && override.endOffset === region.endOffset) return { override, match };
  }
  return null;
}

export function resolveSymbolOccurrences(input: ResolveSymbolOccurrencesInput): ResolveSymbolOccurrencesResult {
  const validation = validateSymbolDictionary(input);
  const fatal = validation.filter(value => value.code !== 'invalid_default_usage' && value.code !== 'override_rule_mismatch');
  if (fatal.length > 0) throw new SymbolDictionaryInputError(fatal);

  const runtimeDefinitions = buildRuntimeSymbolPairDefinitions(input.definitions);
  // One resolve call owns exactly one structural parse. Semantic resolution only
  // consumes canonical regions returned by the Japanese Text Engine.
  const analysis = analyzeJapaneseTextSource(input.content, { pairedSymbols: runtimeDefinitions });
  const definitions = sortSymbolDefinitions(input.definitions).filter(value => value.active);
  const definitionsByPair = new Map(definitions.map(value => [pairKey(value.openSymbol, value.closeSymbol), value]));
  const rules = sortSymbolUsageRules(input.usageRules);
  const rulesById = new Map(rules.map(value => [value.id, value]));
  const overrides = sortSymbolOccurrenceOverrides(input.overrides.filter(value => value.projectId === input.projectId && value.chapterId === input.chapterId));
  const suggestions = input.conventionalSuggestions || [];

  const occurrences: ResolvedSymbolOccurrence[] = analysis.symbolRegions.map(region => {
    const rawText = input.content.slice(region.startOffset, region.endOffset);
    const definition = definitionsByPair.get(pairKey(region.openSymbol, region.closeSymbol)) || null;
    const conventionalSuggestion = conventionFor(suggestions, region.openSymbol, region.closeSymbol);
    if (region.status !== 'closed') return { region, rawText, definition, usageRule: null, conventionalSuggestion, override: null, status: 'invalid_structure', suggestedRange: null };

    const matchedOverride = definition ? relevantOverride(input.content, region, definition, overrides) : null;
    if (matchedOverride) {
      const { override, match } = matchedOverride;
      const usageRule = override.usageRuleId ? rulesById.get(override.usageRuleId) || null : null;
      const validRule = Boolean(usageRule?.active && usageRule.definitionId === definition!.id);
      if (match.status !== 'exact' || override.status !== 'confirmed' || !validRule) {
        return { region, rawText, definition, usageRule: validRule ? usageRule : null, conventionalSuggestion, override, status: override.status === 'unresolved' && match.status === 'exact' ? 'unresolved' : 'stale_override', suggestedRange: match.status === 'reanchorable' ? match.suggestedRange : null };
      }
      return { region, rawText, definition, usageRule, conventionalSuggestion, override, status: 'confirmed_override', suggestedRange: null };
    }

    if (definition?.defaultUsageRuleId) {
      const usageRule = rulesById.get(definition.defaultUsageRuleId) || null;
      if (usageRule?.active && usageRule.definitionId === definition.id) return { region, rawText, definition, usageRule, conventionalSuggestion, override: null, status: 'confirmed_default', suggestedRange: null };
    }
    if (conventionalSuggestion) return { region, rawText, definition, usageRule: null, conventionalSuggestion, override: null, status: 'convention_only', suggestedRange: null };
    return { region, rawText, definition, usageRule: null, conventionalSuggestion: null, override: null, status: 'unresolved', suggestedRange: null };
  });

  return { analysis, parserVersion: analysis.parserVersion, runtimeDefinitions, occurrences, diagnostics: analysis.diagnostics, parseCount: 1 };
}

export class SymbolDictionaryInputError extends Error {
  constructor(public issues: ReturnType<typeof validateSymbolDictionary>) {
    super(issues.map(value => value.message).join(' '));
  }
}
