import { analyzeJapaneseTextSource } from '../japanese-text';
import { buildSymbolOccurrenceAnchor } from './occurrence-anchor';
import { buildRuntimeSymbolPairDefinitions } from './runtime-definitions';
import type { SymbolDefinition, SymbolUsageRule } from './types';
import { validateSymbolDictionary, validateSymbolOccurrenceOverrides } from './validation';

export class SymbolOccurrenceSelectionError extends Error {}

export function buildConfirmedOccurrencePersistence(input: {
  projectId: string;
  chapterId: string;
  content: string;
  definitions: SymbolDefinition[];
  definition: SymbolDefinition;
  usageRule: SymbolUsageRule;
  startOffset: number;
  endOffset: number;
}) {
  const runtime = buildRuntimeSymbolPairDefinitions(input.definitions);
  // One API selection verification owns one structural parse and accepts only
  // an exact closed Region from the currently persisted Chapter content.
  const analysis = analyzeJapaneseTextSource(input.content, { pairedSymbols: runtime });
  const region = analysis.symbolRegions.find(value => value.status === 'closed'
    && value.startOffset === input.startOffset && value.endOffset === input.endOffset
    && value.openSymbol === input.definition.openSymbol && value.closeSymbol === input.definition.closeSymbol);
  if (!region) throw new SymbolOccurrenceSelectionError('現在保存されている本文のclosed Regionとrangeが一致しません。');
  const anchor = buildSymbolOccurrenceAnchor({ id: '__new__', projectId: input.projectId, chapterId: input.chapterId,
    content: input.content, definition: input.definition, usageRuleId: input.usageRule.id, status: 'confirmed',
    range: { startOffset: input.startOffset, endOffset: input.endOffset } });
  const issues = [
    ...validateSymbolOccurrenceOverrides([anchor]),
    ...validateSymbolDictionary({ projectId: input.projectId, definitions: input.definitions, usageRules: [input.usageRule], overrides: [anchor] })
      .filter(value => value.code !== 'invalid_default_usage'),
  ];
  if (issues.length) throw new SymbolOccurrenceSelectionError(issues.map(value => value.message).join(' '));
  return { anchor, parserVersion: analysis.parserVersion, parseCount: 1 as const };
}
