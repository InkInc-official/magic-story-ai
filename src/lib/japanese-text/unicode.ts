import type { GraphemeSegment, GraphemeSegmentation, UnicodeMetrics } from './types';

type SegmenterLike = {
  segment(input: string): Iterable<{ segment: string; index: number }>;
};

function createSegmenter(): SegmenterLike | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
  return new Intl.Segmenter('ja', { granularity: 'grapheme' });
}

function isExtendingCodePoint(value: string): boolean {
  return /\p{Mark}/u.test(value)
    || /[\uFE00-\uFE0F]/u.test(value)
    || /[\u{E0100}-\u{E01EF}]/u.test(value)
    || /[\u{1F3FB}-\u{1F3FF}]/u.test(value);
}

function fallbackGraphemeRanges(text: string): GraphemeSegment[] {
  const result: GraphemeSegment[] = [];
  let offset = 0;
  let joinNext = false;

  for (const codePoint of text) {
    const start = offset;
    offset += codePoint.length;
    const previous = result.at(-1);
    const shouldExtend = Boolean(previous && (joinNext || codePoint === '\u200D' || isExtendingCodePoint(codePoint)));

    if (shouldExtend && previous) {
      previous.endOffset = offset;
      previous.value += codePoint;
    } else {
      result.push({ index: result.length, value: codePoint, startOffset: start, endOffset: offset });
    }
    joinNext = codePoint === '\u200D';
  }
  return result;
}

export function getGraphemeRanges(text: string): GraphemeSegment[] {
  const segmenter = createSegmenter();
  if (!segmenter) return fallbackGraphemeRanges(text);
  return Array.from(segmenter.segment(text), ({ segment, index }, graphemeIndex) => ({
    index: graphemeIndex,
    value: segment,
    startOffset: index,
    endOffset: index + segment.length,
  }));
}

export function countCodePoints(text: string): number {
  let count = 0;
  for (const _codePoint of text) count += 1;
  return count;
}

export function countGraphemes(text: string): number {
  const segmenter = createSegmenter();
  if (!segmenter) return fallbackGraphemeRanges(text).length;
  let count = 0;
  for (const _segment of segmenter.segment(text)) count += 1;
  return count;
}

export function getGraphemeSegmentation(): GraphemeSegmentation {
  return createSegmenter() ? 'intl-segmenter' : 'fallback-code-point-clusters';
}

export function measureUnicode(text: string): UnicodeMetrics {
  return {
    utf16CodeUnits: text.length,
    codePoints: countCodePoints(text),
    graphemes: countGraphemes(text),
    graphemeSegmentation: getGraphemeSegmentation(),
  };
}
