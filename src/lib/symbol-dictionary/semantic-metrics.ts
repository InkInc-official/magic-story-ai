import { countGraphemesInRanges, getGraphemeRanges, type JapaneseTextSourceDocument, type SourceRange } from '../japanese-text';
import type { ResolvedSymbolOccurrence } from './types';

export interface SymbolSemanticMetrics {
  bodyGraphemes: number;
  pairedRegionContentGraphemes: number;
  confirmedSemanticGraphemes: number;
  unresolvedSemanticGraphemes: number;
  dialogueGraphemes: number;
  narrationGraphemes: number;
  innerVoiceGraphemes: number;
  readerVisibleTrueGraphemes: number;
  readerVisibleFalseGraphemes: number;
  spokenAloudTrueGraphemes: number;
  spokenAloudFalseGraphemes: number;
  confirmedSemanticPercent: number | null;
  unresolvedSemanticPercent: number | null;
  dialoguePercent: number | null;
  narrationPercent: number | null;
  innerVoicePercent: number | null;
  confirmedOccurrenceCount: number;
  unresolvedOccurrenceCount: number;
  staleOccurrenceCount: number;
  malformedOccurrenceCount: number;
}

function mergeRanges(values: readonly SourceRange[]): SourceRange[] {
  const sorted = values.filter(value => value.endOffset > value.startOffset)
    .map(value => ({ startOffset: value.startOffset, endOffset: value.endOffset }))
    .sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset);
  const merged: SourceRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.startOffset <= previous.endOffset) previous.endOffset = Math.max(previous.endOffset, range.endOffset);
    else merged.push(range);
  }
  return merged;
}

function intersectRanges(leftValues: readonly SourceRange[], rightValues: readonly SourceRange[]): SourceRange[] {
  const left = mergeRanges(leftValues); const right = mergeRanges(rightValues); const result: SourceRange[] = [];
  let leftIndex = 0; let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const startOffset = Math.max(left[leftIndex].startOffset, right[rightIndex].startOffset);
    const endOffset = Math.min(left[leftIndex].endOffset, right[rightIndex].endOffset);
    if (endOffset > startOffset) result.push({ startOffset, endOffset });
    if (left[leftIndex].endOffset < right[rightIndex].endOffset) leftIndex += 1; else rightIndex += 1;
  }
  return result;
}

const ratio = (value: number, body: number) => body === 0 ? null : value / body * 100;
const confirmed = (value: ResolvedSymbolOccurrence) => value.status === 'confirmed_default' || value.status === 'confirmed_override';

/**
 * Computes author-facing semantic metrics from the resolver's canonical result.
 * Content ranges exclude pair markers. Each metric unions ranges independently;
 * categories intentionally do not form a 100% partition.
 */
export function computeSymbolSemanticMetrics(input: {
  content: string;
  analysis: JapaneseTextSourceDocument;
  occurrences: readonly ResolvedSymbolOccurrence[];
  orphanedStaleOccurrenceCount?: number;
}): SymbolSemanticMetrics {
  const graphemes = getGraphemeRanges(input.content);
  const bodyRanges = input.analysis.paragraphs.map(paragraph => paragraph.contentRange);
  const contentRanges = input.occurrences.map(value => value.region.contentRange);
  const confirmedOccurrences = input.occurrences.filter(confirmed);
  const unresolvedOccurrences = input.occurrences.filter(value => value.status === 'unresolved' || value.status === 'convention_only');
  const staleOccurrences = input.occurrences.filter(value => value.status === 'stale_override');
  const malformedOccurrences = input.occurrences.filter(value => value.status === 'invalid_structure');
  const confirmedRanges = confirmedOccurrences.map(value => value.region.contentRange);
  const unresolvedRanges = input.occurrences.filter(value => !confirmed(value)).map(value => value.region.contentRange);
  const dimensionRanges = (field: 'countsAsDialogue' | 'countsAsNarration' | 'countsAsInnerVoice') => confirmedOccurrences
    .filter(value => value.usageRule?.[field] === true).map(value => value.region.contentRange);
  const booleanRanges = (field: 'readerVisible' | 'spokenAloud', expected: boolean) => confirmedOccurrences
    .filter(value => value.usageRule?.[field] === expected).map(value => value.region.contentRange);
  const count = (ranges: readonly SourceRange[]) => countGraphemesInRanges(graphemes, intersectRanges(ranges, bodyRanges));
  const bodyGraphemes = input.analysis.metrics.bodyGraphemes;
  const confirmedSemanticGraphemes = count(confirmedRanges);
  const unresolvedSemanticGraphemes = count(unresolvedRanges);
  const dialogueGraphemes = count(dimensionRanges('countsAsDialogue'));
  const narrationGraphemes = count(dimensionRanges('countsAsNarration'));
  const innerVoiceGraphemes = count(dimensionRanges('countsAsInnerVoice'));
  return {
    bodyGraphemes,
    pairedRegionContentGraphemes: count(contentRanges),
    confirmedSemanticGraphemes,
    unresolvedSemanticGraphemes,
    dialogueGraphemes,
    narrationGraphemes,
    innerVoiceGraphemes,
    readerVisibleTrueGraphemes: count(booleanRanges('readerVisible', true)),
    readerVisibleFalseGraphemes: count(booleanRanges('readerVisible', false)),
    spokenAloudTrueGraphemes: count(booleanRanges('spokenAloud', true)),
    spokenAloudFalseGraphemes: count(booleanRanges('spokenAloud', false)),
    confirmedSemanticPercent: ratio(confirmedSemanticGraphemes, bodyGraphemes),
    unresolvedSemanticPercent: ratio(unresolvedSemanticGraphemes, bodyGraphemes),
    dialoguePercent: ratio(dialogueGraphemes, bodyGraphemes),
    narrationPercent: ratio(narrationGraphemes, bodyGraphemes),
    innerVoicePercent: ratio(innerVoiceGraphemes, bodyGraphemes),
    confirmedOccurrenceCount: confirmedOccurrences.length,
    unresolvedOccurrenceCount: unresolvedOccurrences.length,
    staleOccurrenceCount: staleOccurrences.length + (input.orphanedStaleOccurrenceCount || 0),
    malformedOccurrenceCount: malformedOccurrences.length,
  };
}

export function semanticMetricsUseOlderSavedContent(savedContent: string, editorContent: string): boolean {
  return savedContent !== editorContent;
}
