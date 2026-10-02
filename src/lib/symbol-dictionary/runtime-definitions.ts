import { BUILTIN_SYMBOL_PAIRS } from '../japanese-text';
import type { RuntimeSymbolPairDefinition, SymbolDefinition } from './types';
import { validateSymbolDefinitions } from './validation';

const pairKey = (openSymbol: string, closeSymbol: string) => `${openSymbol}\u0000${closeSymbol}`;

export function sortSymbolDefinitions(definitions: readonly SymbolDefinition[]): SymbolDefinition[] {
  return [...definitions].sort((left, right) => left.order - right.order
    || left.openSymbol.localeCompare(right.openSymbol)
    || left.closeSymbol.localeCompare(right.closeSymbol)
    || left.id.localeCompare(right.id));
}

export function buildRuntimeSymbolPairDefinitions(definitions: readonly SymbolDefinition[]): RuntimeSymbolPairDefinition[] {
  const errors = validateSymbolDefinitions(definitions);
  if (errors.length > 0) throw new SymbolDictionaryDefinitionError(errors);
  const semanticByPair = new Map(sortSymbolDefinitions(definitions).filter(value => value.active).map(value => [pairKey(value.openSymbol, value.closeSymbol), value]));
  const builtInKeys = new Set(BUILTIN_SYMBOL_PAIRS.map(value => pairKey(value.openSymbol, value.closeSymbol)));
  const builtIns = BUILTIN_SYMBOL_PAIRS.map(value => {
    const semantic = semanticByPair.get(pairKey(value.openSymbol, value.closeSymbol));
    return { ...value, structuralKey: `builtin:${value.id}`, source: 'builtin' as const, projectDefinitionId: semantic?.id ?? null };
  });
  const custom = sortSymbolDefinitions(definitions)
    .filter(value => value.active && !builtInKeys.has(pairKey(value.openSymbol, value.closeSymbol)))
    .map(value => ({
      id: `project-symbol:${value.id}`,
      openSymbol: value.openSymbol,
      closeSymbol: value.closeSymbol,
      structuralKey: `project:${value.id}`,
      source: 'project' as const,
      projectDefinitionId: value.id,
    }));
  return [...builtIns, ...custom];
}

export class SymbolDictionaryDefinitionError extends Error {
  constructor(public issues: ReturnType<typeof validateSymbolDefinitions>) {
    super(issues.map(value => value.message).join(' '));
  }
}
