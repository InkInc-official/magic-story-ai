import type {
  GraphemeSegment,
  PairedSymbolRegion,
  SourceLine,
  SourceRange,
  StructuralSentence,
  StructuralTextMetrics,
  TextParagraph,
  TextSection,
  UnicodeMetrics,
  SectionBreakCandidate,
} from './types';

interface StructuralMetricsInput {
  source: UnicodeMetrics;
  lines: readonly SourceLine[];
  effectiveSectionBreaks: readonly SectionBreakCandidate[];
  sections: readonly TextSection[];
  paragraphs: readonly TextParagraph[];
  sentences: readonly StructuralSentence[];
  symbolRegions: readonly PairedSymbolRegion[];
  graphemes: readonly GraphemeSegment[];
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
  const left = mergeRanges(leftValues); const right = mergeRanges(rightValues);
  const result: SourceRange[] = [];
  let leftIndex = 0; let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const startOffset = Math.max(left[leftIndex].startOffset, right[rightIndex].startOffset);
    const endOffset = Math.min(left[leftIndex].endOffset, right[rightIndex].endOffset);
    if (endOffset > startOffset) result.push({ startOffset, endOffset });
    if (left[leftIndex].endOffset < right[rightIndex].endOffset) leftIndex += 1; else rightIndex += 1;
  }
  return result;
}

export function countGraphemesInRanges(graphemes: readonly GraphemeSegment[], values: readonly SourceRange[]): number {
  const ranges = mergeRanges(values);
  let count = 0;
  for (const range of ranges) {
    let low = 0; let high = graphemes.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (graphemes[middle].startOffset < range.startOffset) low = middle + 1; else high = middle;
    }
    for (let index = low; index < graphemes.length && graphemes[index].endOffset <= range.endOffset; index += 1) count += 1;
  }
  return count;
}

function intersectRangeWithMerged(range: SourceRange, merged: readonly SourceRange[]): SourceRange[] {
  let low = 0; let high = merged.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (merged[middle].endOffset <= range.startOffset) low = middle + 1; else high = middle;
  }
  const result: SourceRange[] = [];
  for (let index = low; index < merged.length && merged[index].startOffset < range.endOffset; index += 1) {
    const startOffset = Math.max(range.startOffset, merged[index].startOffset);
    const endOffset = Math.min(range.endOffset, merged[index].endOffset);
    if (endOffset > startOffset) result.push({ startOffset, endOffset });
  }
  return result;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator * 100;
}

export function buildStructuralTextMetrics(input: StructuralMetricsInput): StructuralTextMetrics {
  const bodyRanges = mergeRanges(input.paragraphs.map(paragraph => paragraph.contentRange));
  const lineByIndex = new Map(input.lines.map(line => [line.index, line]));
  const formattingRanges = input.effectiveSectionBreaks
    .map(sectionBreak => lineByIndex.get(sectionBreak.lineIndex)?.contentRange)
    .filter((range): range is SourceRange => Boolean(range));
  const lineBreakRanges = input.lines.map(line => line.lineEndingRange).filter((range): range is SourceRange => Boolean(range));
  const allRegionRanges = input.symbolRegions.map(region => ({ startOffset: region.startOffset, endOffset: region.endOffset }));
  const closedRegionRanges = input.symbolRegions.filter(region => region.status === 'closed').map(region => ({ startOffset: region.startOffset, endOffset: region.endOffset }));
  const pairedBodyRanges = intersectRanges(allRegionRanges, bodyRanges);
  const closedPairedBodyRanges = intersectRanges(closedRegionRanges, bodyRanges);
  const bodyGraphemes = countGraphemesInRanges(input.graphemes, bodyRanges);
  const closedPairedRegionGraphemes = countGraphemesInRanges(input.graphemes, closedPairedBodyRanges);
  const sentenceGraphemes = input.sentences.reduce((sum, sentence) => sum + countGraphemesInRanges(input.graphemes, intersectRangeWithMerged(sentence, bodyRanges)), 0);
  const pairedRegionCountByStatus = {
    closed: input.symbolRegions.filter(region => region.status === 'closed').length,
    unclosed: input.symbolRegions.filter(region => region.status === 'unclosed').length,
    mismatched: input.symbolRegions.filter(region => region.status === 'mismatched').length,
  };

  const paragraphsBySection = new Map<string, TextParagraph[]>();
  const sentencesBySection = new Map<string, StructuralSentence[]>();
  for (const paragraph of input.paragraphs) {
    const values = paragraphsBySection.get(paragraph.sectionId) || [];
    values.push(paragraph); paragraphsBySection.set(paragraph.sectionId, values);
  }
  for (const sentence of input.sentences) {
    const values = sentencesBySection.get(sentence.sectionId) || [];
    values.push(sentence); sentencesBySection.set(sentence.sectionId, values);
  }

  const sections = input.sections.map(section => {
    const sectionParagraphs = paragraphsBySection.get(section.id) || [];
    const sectionBodyRanges = sectionParagraphs.map(paragraph => paragraph.contentRange);
    const sectionSentences = sentencesBySection.get(section.id) || [];
    const sectionBodyGraphemes = countGraphemesInRanges(input.graphemes, sectionBodyRanges);
    const sectionPaired = countGraphemesInRanges(input.graphemes, intersectRanges(pairedBodyRanges, [section.contentRange]));
    const sectionClosedPaired = countGraphemesInRanges(input.graphemes, intersectRanges(closedPairedBodyRanges, [section.contentRange]));
    const mergedSectionBodyRanges = mergeRanges(sectionBodyRanges);
    const sectionSentenceGraphemes = sectionSentences.reduce((sum, sentence) => sum + countGraphemesInRanges(input.graphemes, intersectRangeWithMerged(sentence, mergedSectionBodyRanges)), 0);
    return {
      sectionId: section.id,
      index: section.index,
      bodyGraphemes: sectionBodyGraphemes,
      paragraphCount: sectionParagraphs.length,
      sentenceCount: sectionSentences.length,
      pairedRegionGraphemes: sectionPaired,
      closedPairedRegionGraphemes: sectionClosedPaired,
      structuralPairedRegionRatio: ratio(sectionClosedPaired, sectionBodyGraphemes),
      sentenceGraphemes: sectionSentenceGraphemes,
      averageSentenceGraphemes: sectionSentences.length === 0 ? null : sectionSentenceGraphemes / sectionSentences.length,
    };
  });

  return {
    source: input.source,
    bodyGraphemes,
    formattingGraphemes: countGraphemesInRanges(input.graphemes, formattingRanges),
    whitespaceGraphemes: input.graphemes.filter(grapheme => /^\s+$/u.test(grapheme.value)).length,
    lineBreakCount: lineBreakRanges.length,
    lineBreakGraphemes: countGraphemesInRanges(input.graphemes, lineBreakRanges),
    sectionCount: input.sections.length,
    nonEmptySectionCount: sections.filter(section => section.bodyGraphemes > 0).length,
    paragraphCount: input.paragraphs.length,
    sentenceCount: input.sentences.length,
    pairedRegionCount: input.symbolRegions.length,
    pairedRegionCountByStatus,
    pairedRegionGraphemes: countGraphemesInRanges(input.graphemes, pairedBodyRanges),
    closedPairedRegionGraphemes,
    structuralPairedRegionRatio: ratio(closedPairedRegionGraphemes, bodyGraphemes),
    sentenceGraphemes,
    averageSentenceGraphemes: input.sentences.length === 0 ? null : sentenceGraphemes / input.sentences.length,
    sections,
  };
}
