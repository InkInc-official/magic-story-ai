import type {
  EndingDistributionEntry,
  EndingPatternDefinition,
  EndingStreak,
  EndingWindowConcentration,
  GraphemeSegment,
  JapaneseTextParserOptions,
  PairedSymbolRegion,
  SectionEndingAnalysis,
  SentenceEndingAnalysis,
  SentenceEndingResult,
  StructuralSentence,
  TextSection,
} from './types';

export const DEFAULT_EXACT_SURFACE_MAXIMUM_GRAPHEMES = 8;
export const DEFAULT_MINIMUM_ENDING_STREAK_LENGTH = 3;
export const DEFAULT_ENDING_CONCENTRATION_WINDOW_SIZE = 5;
export const DEFAULT_ENDING_CONCENTRATION_MINIMUM_OCCURRENCES = 2;

/** Built-in values are surface strings only; their IDs intentionally make no grammatical claim. */
export const BUILTIN_ENDING_PATTERNS: readonly EndingPatternDefinition[] = Object.freeze([
  { id: 'surface-datta', suffix: 'だった' },
  { id: 'surface-dearu', suffix: 'である' },
  { id: 'surface-teiru', suffix: 'ている' },
  { id: 'surface-rareru', suffix: 'られる' },
  { id: 'surface-desu', suffix: 'です' },
  { id: 'surface-masu', suffix: 'ます' },
  { id: 'surface-nai', suffix: 'ない' },
  { id: 'surface-tai', suffix: 'たい' },
  { id: 'surface-reru', suffix: 'れる' },
  { id: 'surface-da', suffix: 'だ' },
  { id: 'surface-ta', suffix: 'た' },
]);

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

function resolvePatterns(custom: readonly EndingPatternDefinition[] | undefined): EndingPatternDefinition[] {
  const accepted: EndingPatternDefinition[] = [];
  const ids = new Set<string>();
  const suffixes = new Set<string>();
  for (const definition of [...(custom || []), ...BUILTIN_ENDING_PATTERNS]) {
    if (!definition.id || !definition.suffix || /[\r\n]/u.test(definition.suffix) || ids.has(definition.id) || suffixes.has(definition.suffix)) continue;
    ids.add(definition.id);
    suffixes.add(definition.suffix);
    accepted.push({ id: definition.id, suffix: definition.suffix });
  }
  return accepted.sort((left, right) =>
    Array.from(right.suffix).length - Array.from(left.suffix).length
    || left.suffix.localeCompare(right.suffix)
    || left.id.localeCompare(right.id));
}

function distribution(values: readonly SentenceEndingResult[], select: (value: SentenceEndingResult) => string | null): EndingDistributionEntry[] {
  const entries = new Map<string, EndingDistributionEntry>();
  for (const value of values) {
    const selected = select(value);
    if (selected === null) continue;
    const existing = entries.get(selected);
    if (existing) {
      existing.count += 1;
      existing.sentenceIds.push(value.sentenceId);
    } else {
      entries.set(selected, { value: selected, count: 1, firstSentenceIndex: value.sentenceIndex, sentenceIds: [value.sentenceId] });
    }
  }
  return [...entries.values()].sort((left, right) =>
    right.count - left.count
    || left.firstSentenceIndex - right.firstSentenceIndex
    || left.value.localeCompare(right.value));
}

function buildStreaks(values: readonly SentenceEndingResult[], minimumLength: number): EndingStreak[] {
  const streaks: EndingStreak[] = [];
  let run: SentenceEndingResult[] = [];
  const flush = () => {
    if (run.length >= minimumLength && run[0].patternId && run[0].pattern) {
      streaks.push({
        patternId: run[0].patternId,
        pattern: run[0].pattern,
        sectionId: run[0].sectionId,
        startSentenceIndex: run[0].sentenceIndex,
        endSentenceIndex: run.at(-1)!.sentenceIndex,
        count: run.length,
        sentenceIds: run.map(value => value.sentenceId),
      });
    }
    run = [];
  };
  for (const value of values) {
    if (!value.patternId || !value.pattern || (run.length > 0 && (run[0].sectionId !== value.sectionId || run[0].patternId !== value.patternId))) flush();
    if (value.patternId && value.pattern) run.push(value);
  }
  flush();
  return streaks;
}

function buildConcentrations(values: readonly SentenceEndingResult[], configuredWindowSize: number, minimumOccurrences: number): EndingWindowConcentration[] {
  const result: EndingWindowConcentration[] = [];
  const bySection = new Map<string, SentenceEndingResult[]>();
  for (const value of values) {
    const sectionValues = bySection.get(value.sectionId) || [];
    sectionValues.push(value);
    bySection.set(value.sectionId, sectionValues);
  }
  for (const sectionValues of bySection.values()) {
    if (sectionValues.length === 0) continue;
    const size = Math.min(configuredWindowSize, sectionValues.length);
    for (let start = 0; start <= sectionValues.length - size; start += 1) {
      const window = sectionValues.slice(start, start + size);
      const occurrences = new Map<string, { pattern: string; sentenceIds: string[] }>();
      for (const value of window) {
        if (!value.patternId || !value.pattern) continue;
        const entry = occurrences.get(value.patternId) || { pattern: value.pattern, sentenceIds: [] };
        entry.sentenceIds.push(value.sentenceId);
        occurrences.set(value.patternId, entry);
      }
      const concentrated = [...occurrences.entries()]
        .filter(([, entry]) => entry.sentenceIds.length >= minimumOccurrences)
        .sort((left, right) => right[1].sentenceIds.length - left[1].sentenceIds.length || left[1].pattern.localeCompare(right[1].pattern) || left[0].localeCompare(right[0]));
      for (const [patternId, entry] of concentrated) {
        result.push({
          patternId,
          pattern: entry.pattern,
          sectionId: window[0].sectionId,
          startSentenceIndex: window[0].sentenceIndex,
          endSentenceIndex: window.at(-1)!.sentenceIndex,
          occurrenceCount: entry.sentenceIds.length,
          windowSize: size,
          ratio: entry.sentenceIds.length / size,
          sentenceIds: entry.sentenceIds,
        });
      }
    }
  }
  return result;
}

function endingGraphemes(
  sentence: StructuralSentence,
  graphemes: readonly GraphemeSegment[],
  closingRangeByEnd: ReadonlyMap<number, { startOffset: number; endOffset: number }>,
  openingRangeByStart: ReadonlyMap<number, { startOffset: number; endOffset: number }>,
  maximum: number,
): GraphemeSegment[] {
  let endOffset = sentence.terminalRange?.startOffset ?? sentence.endOffset;
  let low = 0;
  let high = graphemes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (graphemes[middle].endOffset <= sentence.startOffset) low = middle + 1;
    else high = middle;
  }
  const candidates: GraphemeSegment[] = [];
  for (let index = low; index < graphemes.length && graphemes[index].endOffset <= endOffset; index += 1) {
    if (graphemes[index].startOffset >= sentence.startOffset) candidates.push(graphemes[index]);
  }
  while (candidates.length > 0 && /^\s+$/u.test(candidates.at(-1)!.value)) {
    endOffset = candidates.at(-1)!.startOffset;
    candidates.pop();
  }
  while (!sentence.terminalRange) {
    const close = closingRangeByEnd.get(endOffset);
    if (!close || close.startOffset < sentence.startOffset) break;
    endOffset = close.startOffset;
    while (candidates.length > 0 && candidates.at(-1)!.endOffset > endOffset) candidates.pop();
    while (candidates.length > 0 && /^\s+$/u.test(candidates.at(-1)!.value)) {
      endOffset = candidates.at(-1)!.startOffset;
      candidates.pop();
    }
  }
  let contentStart = sentence.startOffset;
  while (true) {
    const opening = openingRangeByStart.get(contentStart);
    if (!opening || opening.endOffset > endOffset) break;
    contentStart = opening.endOffset;
  }
  const firstCandidate = candidates.findIndex(grapheme => grapheme.startOffset >= contentStart);
  const content = firstCandidate < 0 ? [] : candidates.slice(firstCandidate);
  const lastLineBreak = content.findLastIndex(grapheme => /[\r\n]/u.test(grapheme.value));
  return content.slice(lastLineBreak + 1).slice(-maximum);
}

export function analyzeSentenceEndings(
  text: string,
  sentences: readonly StructuralSentence[],
  sections: readonly TextSection[],
  regions: readonly PairedSymbolRegion[],
  graphemes: readonly GraphemeSegment[],
  options: JapaneseTextParserOptions = {},
): SentenceEndingAnalysis {
  const exactMaximum = positiveInteger(options.exactSurfaceMaximumGraphemes, DEFAULT_EXACT_SURFACE_MAXIMUM_GRAPHEMES);
  const minimumStreakLength = positiveInteger(options.minimumEndingStreakLength, DEFAULT_MINIMUM_ENDING_STREAK_LENGTH);
  const concentrationWindowSize = positiveInteger(options.endingConcentrationWindowSize, DEFAULT_ENDING_CONCENTRATION_WINDOW_SIZE);
  const concentrationMinimumOccurrences = positiveInteger(options.endingConcentrationMinimumOccurrences, DEFAULT_ENDING_CONCENTRATION_MINIMUM_OCCURRENCES);
  const patterns = resolvePatterns(options.endingPatterns);
  const closingRangeByEnd = new Map(regions.filter(region => region.closeRange).map(region => [region.closeRange!.endOffset, region.closeRange!]));
  const openingRangeByStart = new Map(regions.map(region => [region.openRange.startOffset, region.openRange]));
  const results = sentences.map(sentence => {
    const ending = endingGraphemes(sentence, graphemes, closingRangeByEnd, openingRangeByStart, exactMaximum);
    const exactSurfaceRange = ending.length > 0 ? { startOffset: ending[0].startOffset, endOffset: ending.at(-1)!.endOffset } : null;
    const exactSurfaceEnding = exactSurfaceRange ? text.slice(exactSurfaceRange.startOffset, exactSurfaceRange.endOffset) : null;
    const pattern = exactSurfaceEnding === null ? null : patterns.find(definition => exactSurfaceEnding.endsWith(definition.suffix)) || null;
    return {
      sentenceId: sentence.id,
      sentenceIndex: sentence.index,
      sectionId: sentence.sectionId,
      exactSurfaceEnding,
      exactSurfaceRange,
      terminalText: sentence.terminalText,
      terminalRange: sentence.terminalRange ? { ...sentence.terminalRange } : null,
      patternId: pattern?.id ?? null,
      pattern: pattern?.suffix ?? null,
    } satisfies SentenceEndingResult;
  });
  const resultsBySection = new Map<string, SentenceEndingResult[]>();
  for (const result of results) {
    const values = resultsBySection.get(result.sectionId) || [];
    values.push(result);
    resultsBySection.set(result.sectionId, values);
  }
  const sectionsAnalysis: SectionEndingAnalysis[] = sections.map(section => {
    const values = resultsBySection.get(section.id) || [];
    return {
      sectionId: section.id,
      index: section.index,
      sentenceCount: values.length,
      unmatchedPatternCount: values.filter(value => value.patternId === null).length,
      exactEndingDistribution: distribution(values, value => value.exactSurfaceEnding),
      patternDistribution: distribution(values, value => value.pattern),
      streaks: buildStreaks(values, minimumStreakLength),
    };
  });
  return {
    exactSurfaceMaximumGraphemes: exactMaximum,
    minimumStreakLength,
    concentrationWindowSize,
    concentrationMinimumOccurrences,
    sentences: results,
    unmatchedPatternCount: results.filter(value => value.patternId === null).length,
    exactEndingDistribution: distribution(results, value => value.exactSurfaceEnding),
    patternDistribution: distribution(results, value => value.pattern),
    streaks: sectionsAnalysis.flatMap(section => section.streaks),
    concentrations: buildConcentrations(results, concentrationWindowSize, concentrationMinimumOccurrences),
    sections: sectionsAnalysis,
  };
}
