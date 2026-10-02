import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeJapaneseTextSource, getGraphemeRanges } from './index.js';

test('source metrics reuse Phase 5B-1 Unicode definitions including CRLF grapheme behavior', () => {
  const text = 'あ𠮷😀✈️か\u3099👨‍👩‍👧‍👦\r\n終';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.metrics.source.utf16CodeUnits, text.length);
  assert.equal(result.metrics.source.codePoints, result.source.codePoints);
  assert.equal(result.metrics.source.graphemes, getGraphemeRanges(text).length);
  assert.equal(result.metrics.source.graphemes, result.source.graphemes);
  assert.equal(result.metrics.lineBreakCount, 1);
  assert.equal(result.metrics.lineBreakGraphemes, 1);
});

test('body includes indentation and inline whitespace but excludes line breaks and blank-line whitespace', () => {
  const text = '  本 文\n \n　段\t落';
  const metrics = analyzeJapaneseTextSource(text).metrics;
  assert.equal(metrics.source.graphemes, 12);
  assert.equal(metrics.bodyGraphemes, 9);
  assert.equal(metrics.whitespaceGraphemes, 8);
  assert.equal(metrics.lineBreakCount, 2);
  assert.equal(metrics.lineBreakGraphemes, 2);
  assert.equal(metrics.formattingGraphemes, 0);
});

test('effective separator content is formatting and excluded from body', () => {
  const metrics = analyzeJapaneseTextSource('A\n  ***　\nB').metrics;
  assert.equal(metrics.bodyGraphemes, 2);
  assert.equal(metrics.formattingGraphemes, 6);
  assert.equal(metrics.sectionCount, 2);
  assert.equal(metrics.nonEmptySectionCount, 2);
});

test('candidate suppressed inside a closed region remains body rather than formatting', () => {
  const result = analyzeJapaneseTextSource('「A\n***\nB」');
  assert.equal(result.sectionBreaks.length, 1);
  assert.equal(result.effectiveSectionBreaks.length, 0);
  assert.equal(result.metrics.bodyGraphemes, 7);
  assert.equal(result.metrics.formattingGraphemes, 0);
  assert.equal(result.metrics.closedPairedRegionGraphemes, 7);
  assert.equal(result.metrics.structuralPairedRegionRatio, 100);
});

test('nested paired regions use a source union and do not double-count inner content', () => {
  const text = '「彼は『帰る』と言った」';
  const metrics = analyzeJapaneseTextSource(text).metrics;
  assert.equal(metrics.pairedRegionCount, 2);
  assert.equal(metrics.bodyGraphemes, getGraphemeRanges(text).length);
  assert.equal(metrics.pairedRegionGraphemes, metrics.bodyGraphemes);
  assert.equal(metrics.closedPairedRegionGraphemes, metrics.bodyGraphemes);
  assert.equal(metrics.structuralPairedRegionRatio, 100);
});

test('adjacent and overlapping malformed regions are union-counted once', () => {
  const adjacent = analyzeJapaneseTextSource('「A」「B」').metrics;
  assert.equal(adjacent.pairedRegionCount, 2);
  assert.equal(adjacent.pairedRegionGraphemes, 6);
  const malformed = analyzeJapaneseTextSource('「A『B」C』').metrics;
  assert.ok(malformed.pairedRegionCount >= 2);
  assert.ok(malformed.pairedRegionGraphemes <= malformed.bodyGraphemes);
});

test('all statuses contribute to total paired occupancy while stable ratio uses closed only', () => {
  const closed = analyzeJapaneseTextSource('「こんにちは」').metrics;
  assert.deepEqual(closed.pairedRegionCountByStatus, { closed: 1, unclosed: 0, mismatched: 0 });
  assert.equal(closed.pairedRegionGraphemes, 7);
  assert.equal(closed.closedPairedRegionGraphemes, 7);
  assert.equal(closed.structuralPairedRegionRatio, 100);
  const unclosed = analyzeJapaneseTextSource('「こんにちは').metrics;
  assert.deepEqual(unclosed.pairedRegionCountByStatus, { closed: 0, unclosed: 1, mismatched: 0 });
  assert.equal(unclosed.pairedRegionGraphemes, 6);
  assert.equal(unclosed.closedPairedRegionGraphemes, 0);
  assert.equal(unclosed.structuralPairedRegionRatio, 0);
});

test('sentence length includes punctuation, symbols, and inline spaces but excludes physical line endings', () => {
  const normal = analyzeJapaneseTextSource('「行く。絶対に戻る。」').metrics;
  assert.equal(normal.sentenceCount, 2);
  assert.equal(normal.sentenceGraphemes, normal.bodyGraphemes);
  assert.equal(normal.averageSentenceGraphemes, normal.sentenceGraphemes / 2);
  const multiLine = analyzeJapaneseTextSource('「A\r\nB」').metrics;
  assert.equal(multiLine.sentenceCount, 1);
  assert.equal(multiLine.sentenceGraphemes, 4);
  assert.equal(multiLine.averageSentenceGraphemes, 4);
  assert.equal(multiLine.lineBreakGraphemes, 1);
});

test('Critical A/B/C and punctuation-free fallback are measured from canonical sentences once', () => {
  for (const text of ['彼は「行く。」と言った。', '「行く。絶対に戻る。」', '「行く！」「待って！」', '句点なし']) {
    const result = analyzeJapaneseTextSource(text);
    assert.equal(result.metrics.sentenceCount, result.sentences.length);
    assert.equal(result.metrics.sentenceGraphemes, result.metrics.bodyGraphemes);
  }
});

test('Section metrics group canonical Paragraphs and cross-Paragraph Sentences once', () => {
  const text = '「A\nB」\n***\nC。';
  const metrics = analyzeJapaneseTextSource(text).metrics;
  assert.equal(metrics.sections.length, 2);
  assert.deepEqual(metrics.sections.map(section => section.paragraphCount), [2, 1]);
  assert.deepEqual(metrics.sections.map(section => section.sentenceCount), [1, 1]);
  assert.deepEqual(metrics.sections.map(section => section.bodyGraphemes), [4, 2]);
  assert.deepEqual(metrics.sections.map(section => section.averageSentenceGraphemes), [4, 2]);
});

test('empty, separator-only, and blank-only documents use zero counts with null ratios and averages', () => {
  const empty = analyzeJapaneseTextSource('').metrics;
  assert.equal(empty.sectionCount, 0);
  assert.equal(empty.bodyGraphemes, 0);
  assert.equal(empty.structuralPairedRegionRatio, null);
  assert.equal(empty.averageSentenceGraphemes, null);
  const separator = analyzeJapaneseTextSource('***').metrics;
  assert.equal(separator.sectionCount, 2);
  assert.equal(separator.nonEmptySectionCount, 0);
  assert.equal(separator.formattingGraphemes, 3);
  assert.equal(separator.bodyGraphemes, 0);
  assert.ok(separator.sections.every(section => section.structuralPairedRegionRatio === null && section.averageSentenceGraphemes === null));
  const blank = analyzeJapaneseTextSource('\n　\n').metrics;
  assert.equal(blank.bodyGraphemes, 0);
  assert.equal(blank.paragraphCount, 0);
  assert.equal(blank.sentenceCount, 0);
  assert.equal(blank.nonEmptySectionCount, 0);
});

test('metrics are deterministic and contain no quality or semantic classifications', () => {
  const text = '「A。」\n***\nB。';
  const first = analyzeJapaneseTextSource(text).metrics;
  const second = analyzeJapaneseTextSource(text).metrics;
  assert.deepEqual(first, second);
  for (const key of ['score', 'grade', 'rank', 'dialogueRatio', 'narrationCharacters', 'innerThoughtCharacters']) assert.equal(key in first, false);
});
