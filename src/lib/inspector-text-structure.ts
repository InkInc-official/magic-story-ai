import {
  analyzeJapaneseTextSource,
  getGraphemeRanges,
  type JapaneseTextSourceDocument,
  type PairedSymbolRegion,
  type SourceRange,
  type StructuralSentence,
  type TextParagraph,
} from './japanese-text';

export const INSPECTOR_STRUCTURE_ADAPTER_VERSION = 'inspector-structure-adapter-v1';
export const DEFAULT_INSPECTOR_STRUCTURE_BEFORE = 900;
export const DEFAULT_INSPECTOR_STRUCTURE_AFTER = 900;

export type InspectorStructureExpansionMode = 'sentence' | 'paragraph' | 'mixed' | 'character-fallback' | 'none';
export type InspectorStructureFallbackReason = 'parser_exception' | 'giant_sentence' | 'no_structural_node';

export interface InspectorStructureAdapterInput {
  content: string;
  requestedRange: SourceRange;
  inspectedRange: SourceRange;
}

export interface InspectorStructureAdapterOptions {
  maxBefore?: number;
  maxAfter?: number;
}

export interface InspectorTextStructureContext {
  parseCount: 1;
  parserVersion: string;
  adapterVersion: typeof INSPECTOR_STRUCTURE_ADAPTER_VERSION;
  requestedRange: SourceRange;
  inspectedRange: SourceRange;
  /** Runtime provenance only. These IDs must not be used as persisted Issue identity. */
  overlappingSentenceIds: string[];
  overlappingParagraphIds: string[];
  anchorSentenceIds: string[];
  anchorParagraphIds: string[];
  sectionIds: string[];
  beforeRange: SourceRange;
  afterRange: SourceRange;
  surroundingBefore: string;
  surroundingAfter: string;
  expansionMode: InspectorStructureExpansionMode;
  diagnosticCodes: string[];
  fallbackReason: InspectorStructureFallbackReason | null;
  /** Canonical parser regions reused by semantic adapters; not persisted as Issue identity. */
  symbolRegions: PairedSymbolRegion[];
}

type AnalyzeText = (content: string) => JapaneseTextSourceDocument;

function copyRange(range: SourceRange): SourceRange {
  return { startOffset: range.startOffset, endOffset: range.endOffset };
}

function validateRange(name: string, range: SourceRange, contentLength: number) {
  if (!Number.isInteger(range.startOffset) || !Number.isInteger(range.endOffset)
    || range.startOffset < 0 || range.endOffset < range.startOffset || range.endOffset > contentLength) {
    throw new RangeError(`${name} must be a valid UTF-16 source range`);
  }
}

function resolveLimit(value: number | undefined, fallback: number, name: string) {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 0) throw new RangeError(`${name} must be a non-negative integer`);
  return resolved;
}

function overlaps(range: SourceRange, node: SourceRange) {
  return range.startOffset < node.endOffset && node.startOffset < range.endOffset;
}

function safeBoundaries(content: string): { starts: number[]; ends: number[] } {
  try {
    const graphemes = getGraphemeRanges(content);
    const safe = (offset: number) => !(content[offset - 1] === '\r' && content[offset] === '\n');
    return {
      starts: [...new Set([0, ...graphemes.map(value => value.startOffset), content.length])].filter(safe),
      ends: [...new Set([0, ...graphemes.map(value => value.endOffset), content.length])].filter(safe),
    };
  } catch {
    return { starts: [0, content.length], ends: [0, content.length] };
  }
}

function safeStart(boundaries: readonly number[], candidate: number, maximum: number) {
  return boundaries.find(value => value >= candidate && value <= maximum) ?? maximum;
}

function safeEnd(boundaries: readonly number[], candidate: number, minimum: number) {
  return boundaries.findLast(value => value <= candidate && value >= minimum) ?? minimum;
}

function legacyRanges(content: string, inspectedRange: SourceRange, maxBefore: number, maxAfter: number) {
  const boundaries = safeBoundaries(content);
  const beforeStart = safeStart(boundaries.starts, Math.max(0, inspectedRange.startOffset - maxBefore), inspectedRange.startOffset);
  const afterEnd = safeEnd(boundaries.ends, Math.min(content.length, inspectedRange.endOffset + maxAfter), inspectedRange.endOffset);
  return {
    beforeRange: { startOffset: beforeStart, endOffset: inspectedRange.startOffset },
    afterRange: { startOffset: inspectedRange.endOffset, endOffset: afterEnd },
  };
}

function nearestSentenceAnchors(sentences: readonly StructuralSentence[], range: SourceRange): StructuralSentence[] {
  if (range.startOffset < range.endOffset) {
    const overlapping = sentences.filter(sentence => overlaps(range, sentence));
    if (overlapping.length > 0) return overlapping;
  } else {
    const containing = sentences.find(sentence => sentence.startOffset <= range.startOffset && range.startOffset < sentence.endOffset);
    if (containing) return [containing];
    const starting = sentences.find(sentence => sentence.startOffset === range.startOffset);
    if (starting) return [starting];
  }
  const previous = sentences.findLast(sentence => sentence.endOffset <= range.startOffset);
  const next = sentences.find(sentence => sentence.startOffset >= range.endOffset);
  return [...new Map([previous, next].filter((value): value is StructuralSentence => Boolean(value)).map(value => [value.id, value])).values()];
}

function paragraphsForSentences(paragraphs: readonly TextParagraph[], sentences: readonly StructuralSentence[]) {
  const ids = new Set(sentences.flatMap(sentence => sentence.paragraphIds));
  return paragraphs.filter(paragraph => ids.has(paragraph.id));
}

function fits(range: SourceRange, inspected: SourceRange, maxBefore: number, maxAfter: number) {
  return range.startOffset >= Math.max(0, inspected.startOffset - maxBefore)
    && range.endOffset <= inspected.endOffset + maxAfter;
}

function resultFromRanges(
  input: InspectorStructureAdapterInput,
  parserVersion: string,
  beforeRange: SourceRange,
  afterRange: SourceRange,
  values: Pick<InspectorTextStructureContext, 'overlappingSentenceIds' | 'overlappingParagraphIds' | 'anchorSentenceIds' | 'anchorParagraphIds' | 'sectionIds' | 'expansionMode' | 'diagnosticCodes' | 'fallbackReason' | 'symbolRegions'>,
): InspectorTextStructureContext {
  return {
    parseCount: 1,
    parserVersion,
    adapterVersion: INSPECTOR_STRUCTURE_ADAPTER_VERSION,
    requestedRange: copyRange(input.requestedRange),
    inspectedRange: copyRange(input.inspectedRange),
    ...values,
    beforeRange,
    afterRange,
    surroundingBefore: input.content.slice(beforeRange.startOffset, beforeRange.endOffset),
    surroundingAfter: input.content.slice(afterRange.startOffset, afterRange.endOffset),
  };
}

/**
 * Builds Inspector-only structural surroundings without changing the evidence range.
 * All coordinates remain inclusive-start/exclusive-end JavaScript UTF-16 offsets.
 */
export function buildInspectorTextStructure(
  input: InspectorStructureAdapterInput,
  options: InspectorStructureAdapterOptions = {},
  dependencies: { analyze?: AnalyzeText } = {},
): InspectorTextStructureContext {
  validateRange('requestedRange', input.requestedRange, input.content.length);
  validateRange('inspectedRange', input.inspectedRange, input.content.length);
  if (input.inspectedRange.startOffset < input.requestedRange.startOffset || input.inspectedRange.endOffset > input.requestedRange.endOffset) {
    throw new RangeError('inspectedRange must be contained by requestedRange');
  }
  const maxBefore = resolveLimit(options.maxBefore, DEFAULT_INSPECTOR_STRUCTURE_BEFORE, 'maxBefore');
  const maxAfter = resolveLimit(options.maxAfter, DEFAULT_INSPECTOR_STRUCTURE_AFTER, 'maxAfter');
  const legacy = () => legacyRanges(input.content, input.inspectedRange, maxBefore, maxAfter);
  let analysis: JapaneseTextSourceDocument;
  try {
    analysis = (dependencies.analyze || analyzeJapaneseTextSource)(input.content);
  } catch {
    const ranges = legacy();
    return resultFromRanges(input, 'unavailable', ranges.beforeRange, ranges.afterRange, {
      overlappingSentenceIds: [], overlappingParagraphIds: [], sectionIds: [],
      anchorSentenceIds: [], anchorParagraphIds: [],
      expansionMode: input.content.length === 0 ? 'none' : 'character-fallback',
      diagnosticCodes: [], fallbackReason: 'parser_exception',
      symbolRegions: [],
    });
  }

  const diagnosticCodes = [...new Set(analysis.diagnostics.map(value => value.code))];
  if (input.content.length === 0) {
    const empty = { startOffset: 0, endOffset: 0 };
    return resultFromRanges(input, analysis.parserVersion, empty, empty, {
      overlappingSentenceIds: [], overlappingParagraphIds: [], sectionIds: [],
      anchorSentenceIds: [], anchorParagraphIds: [],
      expansionMode: 'none', diagnosticCodes, fallbackReason: null,
      symbolRegions: analysis.symbolRegions,
    });
  }

  const overlappingSentences = input.inspectedRange.startOffset < input.inspectedRange.endOffset
    ? analysis.sentences.filter(sentence => overlaps(input.inspectedRange, sentence)) : [];
  const overlappingParagraphs = input.inspectedRange.startOffset < input.inspectedRange.endOffset
    ? analysis.paragraphs.filter(paragraph => overlaps(input.inspectedRange, paragraph)) : [];
  const anchors = nearestSentenceAnchors(analysis.sentences, input.inspectedRange);
  if (anchors.length === 0) {
    const ranges = legacy();
    return resultFromRanges(input, analysis.parserVersion, ranges.beforeRange, ranges.afterRange, {
      overlappingSentenceIds: [], overlappingParagraphIds: [], sectionIds: [],
      anchorSentenceIds: [], anchorParagraphIds: [],
      expansionMode: 'character-fallback', diagnosticCodes, fallbackReason: 'no_structural_node',
      symbolRegions: analysis.symbolRegions,
    });
  }

  const anchorParagraphs = paragraphsForSentences(analysis.paragraphs, anchors);
  const sentenceRange = {
    startOffset: Math.min(...anchors.map(value => value.startOffset), input.inspectedRange.startOffset),
    endOffset: Math.max(...anchors.map(value => value.endOffset), input.inspectedRange.endOffset),
  };
  if (!fits(sentenceRange, input.inspectedRange, maxBefore, maxAfter)) {
    const ranges = legacy();
    return resultFromRanges(input, analysis.parserVersion, ranges.beforeRange, ranges.afterRange, {
      overlappingSentenceIds: overlappingSentences.map(value => value.id),
      overlappingParagraphIds: overlappingParagraphs.map(value => value.id),
      anchorSentenceIds: anchors.map(value => value.id),
      anchorParagraphIds: anchorParagraphs.map(value => value.id),
      sectionIds: [...new Set(anchors.map(value => value.sectionId))],
      expansionMode: 'character-fallback', diagnosticCodes, fallbackReason: 'giant_sentence',
      symbolRegions: analysis.symbolRegions,
    });
  }

  let structuralRange = sentenceRange;
  let expansionMode: InspectorStructureExpansionMode = 'sentence';
  if (anchorParagraphs.length > 0) {
    const paragraphRange = {
      startOffset: Math.min(...anchorParagraphs.map(value => value.startOffset), sentenceRange.startOffset),
      endOffset: Math.max(...anchorParagraphs.map(value => value.endOffset), sentenceRange.endOffset),
    };
    if (fits(paragraphRange, input.inspectedRange, maxBefore, maxAfter)) {
      structuralRange = paragraphRange;
      expansionMode = 'paragraph';
    }
  }

  const sectionIds = [...new Set(anchors.map(value => value.sectionId))];
  const allowedSections = new Set(sectionIds);
  const beforeCandidates = analysis.sentences.filter(sentence => allowedSections.has(sentence.sectionId) && sentence.endOffset <= structuralRange.startOffset).reverse();
  const afterCandidates = analysis.sentences.filter(sentence => allowedSections.has(sentence.sectionId) && sentence.startOffset >= structuralRange.endOffset);
  let usedAdjacent = false;
  for (const sentence of beforeCandidates) {
    const candidate = { startOffset: sentence.startOffset, endOffset: structuralRange.endOffset };
    if (!fits(candidate, input.inspectedRange, maxBefore, maxAfter)) break;
    structuralRange = candidate;
    usedAdjacent = true;
  }
  for (const sentence of afterCandidates) {
    const candidate = { startOffset: structuralRange.startOffset, endOffset: sentence.endOffset };
    if (!fits(candidate, input.inspectedRange, maxBefore, maxAfter)) break;
    structuralRange = candidate;
    usedAdjacent = true;
  }
  if (usedAdjacent && expansionMode === 'paragraph') expansionMode = 'mixed';

  const beforeRange = { startOffset: structuralRange.startOffset, endOffset: input.inspectedRange.startOffset };
  const afterRange = { startOffset: input.inspectedRange.endOffset, endOffset: structuralRange.endOffset };
  if (beforeRange.startOffset === beforeRange.endOffset && afterRange.startOffset === afterRange.endOffset) expansionMode = 'none';
  return resultFromRanges(input, analysis.parserVersion, beforeRange, afterRange, {
    overlappingSentenceIds: overlappingSentences.map(value => value.id),
    overlappingParagraphIds: overlappingParagraphs.map(value => value.id),
    anchorSentenceIds: anchors.map(value => value.id),
    anchorParagraphIds: anchorParagraphs.map(value => value.id),
    sectionIds, expansionMode, diagnosticCodes, fallbackReason: null, symbolRegions: analysis.symbolRegions,
  });
}
