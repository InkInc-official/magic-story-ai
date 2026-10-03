import type { SymbolPairDefinition } from './japanese-text';
import type { SymbolDefinition } from './symbol-dictionary';

export interface SymbolDictionaryDisplayItem {
  key: string;
  pairId: string | null;
  openSymbol: string;
  closeSymbol: string;
  builtIn: boolean;
  definition: SymbolDefinition | null;
}

const pairKey = (openSymbol: string, closeSymbol: string) => `${openSymbol}\u0000${closeSymbol}`;

export function mergeSymbolDictionaryDisplayItems(
  builtIns: readonly SymbolPairDefinition[], definitions: readonly SymbolDefinition[],
): SymbolDictionaryDisplayItem[] {
  const definitionsByPair = new Map(definitions.map(value => [pairKey(value.openSymbol, value.closeSymbol), value]));
  const builtInKeys = new Set(builtIns.map(value => pairKey(value.openSymbol, value.closeSymbol)));
  return [
    ...builtIns.map(pair => ({ key: `builtin:${pair.id}`, pairId: pair.id, openSymbol: pair.openSymbol,
      closeSymbol: pair.closeSymbol, builtIn: true, definition: definitionsByPair.get(pairKey(pair.openSymbol, pair.closeSymbol)) || null })),
    ...definitions.filter(value => !builtInKeys.has(pairKey(value.openSymbol, value.closeSymbol)))
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map(value => ({ key: `project:${value.id}`, pairId: null, openSymbol: value.openSymbol,
        closeSymbol: value.closeSymbol, builtIn: false, definition: value })),
  ];
}

export type TriStateValue = 'unspecified' | 'yes' | 'no';
export const booleanToTriState = (value: boolean | null): TriStateValue => value === null ? 'unspecified' : value ? 'yes' : 'no';
export const triStateToBoolean = (value: TriStateValue): boolean | null => value === 'unspecified' ? null : value === 'yes';

export interface SymbolUsageFormValue {
  id: string;
  label: string;
  description: string;
  semanticKind: string;
  countsAsDialogue: boolean | null;
  countsAsNarration: boolean | null;
  countsAsInnerVoice: boolean | null;
  readerVisible: boolean | null;
  spokenAloud: boolean | null;
  speakerMode: string;
  fixedSpeakerId: string;
  active: boolean;
}

export function buildSymbolUsageMutationPayload(projectId: string, definitionId: string, value: SymbolUsageFormValue) {
  return {
    projectId, ...(value.id && { id: value.id }), definitionId, label: value.label, description: value.description,
    semanticKind: value.semanticKind, countsAsDialogue: value.countsAsDialogue, countsAsNarration: value.countsAsNarration,
    countsAsInnerVoice: value.countsAsInnerVoice, readerVisible: value.readerVisible, spokenAloud: value.spokenAloud,
    speakerMode: value.speakerMode, fixedSpeakerId: value.speakerMode === 'fixed_character' ? value.fixedSpeakerId || null : null,
    active: value.active, ...(!value.id && { provenance: 'author' as const }),
  };
}

export const isLatestSymbolDictionaryRequest = (requestToken: number, currentToken: number) => requestToken === currentToken;
