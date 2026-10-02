import type {
  JapaneseTextParserOptions,
  PairedSymbolRegion,
  SourceRange,
  SymbolPairDefinition,
  SymbolPairUsage,
  TextDiagnostic,
} from './types';

export const DEFAULT_MAX_SYMBOL_NESTING_DEPTH = 32;

export const BUILTIN_SYMBOL_PAIRS: readonly SymbolPairDefinition[] = Object.freeze([
  { id: 'corner-brackets', openSymbol: '「', closeSymbol: '」' },
  { id: 'white-corner-brackets', openSymbol: '『', closeSymbol: '』' },
  { id: 'fullwidth-parentheses', openSymbol: '（', closeSymbol: '）' },
  { id: 'ascii-parentheses', openSymbol: '(', closeSymbol: ')' },
  { id: 'lenticular-brackets', openSymbol: '【', closeSymbol: '】' },
  { id: 'angle-brackets', openSymbol: '〈', closeSymbol: '〉' },
  { id: 'double-angle-brackets', openSymbol: '《', closeSymbol: '》' },
  { id: 'reversed-double-prime', openSymbol: '〝', closeSymbol: '〟' },
  { id: 'double-curly-quotes', openSymbol: '“', closeSymbol: '”' },
  { id: 'single-curly-quotes', openSymbol: '‘', closeSymbol: '’' },
]);

interface OpenFrame {
  definition: SymbolPairDefinition;
  id: string;
  openRange: SourceRange;
  depth: number;
  parentRegionId: string | null;
  sequence: number;
}

interface SymbolCandidate {
  symbol: string;
  kind: 'open' | 'close';
  definition: SymbolPairDefinition;
  definitionIndex: number;
}

export interface PairedSymbolScanResult {
  regions: PairedSymbolRegion[];
  usage: SymbolPairUsage[];
  diagnostics: TextDiagnostic[];
}

function validDefinitions(definitions: readonly SymbolPairDefinition[]): SymbolPairDefinition[] {
  return definitions.filter(definition => definition.id && definition.openSymbol && definition.closeSymbol);
}

function candidatesAt(text: string, offset: number, definitions: readonly SymbolPairDefinition[], expectedClose?: string): SymbolCandidate[] {
  const candidates: SymbolCandidate[] = [];
  definitions.forEach((definition, definitionIndex) => {
    if (text.startsWith(definition.openSymbol, offset)) candidates.push({ symbol: definition.openSymbol, kind: 'open', definition, definitionIndex });
    if (text.startsWith(definition.closeSymbol, offset)) candidates.push({ symbol: definition.closeSymbol, kind: 'close', definition, definitionIndex });
  });
  return candidates.sort((left, right) => right.symbol.length - left.symbol.length
    || Number(right.kind === 'close' && right.symbol === expectedClose) - Number(left.kind === 'close' && left.symbol === expectedClose)
    || Number(left.kind === 'close') - Number(right.kind === 'close')
    || left.definitionIndex - right.definitionIndex);
}

function regionFromFrame(frame: OpenFrame, endOffset: number, status: PairedSymbolRegion['status'], closeRange: SourceRange | null): PairedSymbolRegion {
  return {
    id: frame.id,
    kind: 'paired_symbol_region',
    pairId: frame.definition.id,
    openSymbol: frame.definition.openSymbol,
    closeSymbol: frame.definition.closeSymbol,
    openRange: frame.openRange,
    closeRange,
    contentRange: { startOffset: frame.openRange.endOffset, endOffset: closeRange?.startOffset ?? endOffset },
    startOffset: frame.openRange.startOffset,
    endOffset,
    depth: frame.depth,
    parentRegionId: frame.parentRegionId,
    status,
  };
}

export function scanPairedSymbolRegions(text: string, options: JapaneseTextParserOptions = {}): PairedSymbolScanResult {
  const definitions = validDefinitions(options.pairedSymbols ?? BUILTIN_SYMBOL_PAIRS);
  const requestedDepth = options.maxSymbolNestingDepth ?? DEFAULT_MAX_SYMBOL_NESTING_DEPTH;
  const maxDepth = Number.isInteger(requestedDepth) && requestedDepth > 0 ? requestedDepth : DEFAULT_MAX_SYMBOL_NESTING_DEPTH;
  const stack: OpenFrame[] = [];
  const regions: PairedSymbolRegion[] = [];
  const diagnostics: TextDiagnostic[] = [];
  let openingSequence = 0;
  let offset = 0;

  while (offset < text.length) {
    const top = stack.at(-1);
    const candidate = candidatesAt(text, offset, definitions, top?.definition.closeSymbol)[0];
    if (!candidate) {
      const codePoint = text.codePointAt(offset)!;
      offset += codePoint > 0xffff ? 2 : 1;
      continue;
    }
    const symbolRange = { startOffset: offset, endOffset: offset + candidate.symbol.length };

    if (candidate.kind === 'open') {
      if (stack.length >= maxDepth) {
        diagnostics.push({ ...symbolRange, code: 'nesting_limit', severity: 'warning', message: `paired symbolの入れ子が上限${maxDepth}を超えたため、このopen symbolはRegion化しませんでした。` });
      } else {
        const parent = stack.at(-1);
        const id = `symbol:${openingSequence}:${candidate.definition.id}:${offset}`;
        stack.push({ definition: candidate.definition, id, openRange: symbolRange, depth: stack.length, parentRegionId: parent?.id ?? null, sequence: openingSequence });
        openingSequence += 1;
      }
      offset = symbolRange.endOffset;
      continue;
    }

    let matchingIndex = -1;
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (stack[index].definition.closeSymbol === candidate.symbol) { matchingIndex = index; break; }
    }
    if (matchingIndex === stack.length - 1 && matchingIndex >= 0) {
      const frame = stack.pop()!;
      regions.push(regionFromFrame(frame, symbolRange.endOffset, 'closed', symbolRange));
    } else if (matchingIndex >= 0) {
      while (stack.length - 1 > matchingIndex) {
        const crossed = stack.pop()!;
        regions.push(regionFromFrame(crossed, symbolRange.startOffset, 'mismatched', null));
        diagnostics.push({ ...symbolRange, code: 'mismatched_symbol', severity: 'warning', message: `「${crossed.definition.openSymbol}」に対応する「${crossed.definition.closeSymbol}」より先に、外側のclose symbol「${candidate.symbol}」が現れました。` });
      }
      const frame = stack.pop()!;
      regions.push(regionFromFrame(frame, symbolRange.endOffset, 'closed', symbolRange));
    } else if (stack.length > 0) {
      const frame = stack.pop()!;
      regions.push(regionFromFrame(frame, symbolRange.endOffset, 'mismatched', symbolRange));
      diagnostics.push({ ...symbolRange, code: 'mismatched_symbol', severity: 'warning', message: `「${frame.definition.openSymbol}」には「${frame.definition.closeSymbol}」が必要ですが、「${candidate.symbol}」が現れました。` });
    } else {
      diagnostics.push({ ...symbolRange, code: 'unexpected_closing_symbol', severity: 'warning', message: `対応するopen symbolがないclose symbol「${candidate.symbol}」です。` });
    }
    offset = symbolRange.endOffset;
  }

  while (stack.length > 0) {
    const frame = stack.pop()!;
    regions.push(regionFromFrame(frame, text.length, 'unclosed', null));
    diagnostics.push({ startOffset: frame.openRange.startOffset, endOffset: frame.openRange.endOffset, code: 'unclosed_symbol', severity: 'warning', message: `open symbol「${frame.definition.openSymbol}」に対応する「${frame.definition.closeSymbol}」がありません。` });
  }

  regions.sort((left, right) => left.startOffset - right.startOffset || left.depth - right.depth || left.id.localeCompare(right.id));
  const usageByPair = new Map<string, SymbolPairUsage>();
  for (const region of regions) {
    const key = `${region.pairId}\u0000${region.openSymbol}\u0000${region.closeSymbol}`;
    const usage = usageByPair.get(key);
    if (usage) {
      usage.occurrenceCount += 1;
      usage.regionIds.push(region.id);
    } else {
      usageByPair.set(key, { pairId: region.pairId, openSymbol: region.openSymbol, closeSymbol: region.closeSymbol, occurrenceCount: 1, firstOccurrenceOffset: region.startOffset, regionIds: [region.id] });
    }
  }
  const usage = [...usageByPair.values()].sort((left, right) => left.firstOccurrenceOffset - right.firstOccurrenceOffset || left.pairId.localeCompare(right.pairId));
  return { regions, usage, diagnostics };
}
