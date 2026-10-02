import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeJapaneseTextSource, getGraphemeRanges, JAPANESE_TEXT_PARSER_VERSION } from './index.js';

const slice = (text: string, range: { startOffset: number; endOffset: number }) => text.slice(range.startOffset, range.endOffset);

test('empty source is valid and has no phantom line', () => {
  const result = analyzeJapaneseTextSource('');
  assert.equal(result.source.utf16CodeUnits, 0);
  assert.equal(result.source.codePoints, 0);
  assert.equal(result.source.graphemes, 0);
  assert.match(result.source.graphemeSegmentation, /^(intl-segmenter|fallback-code-point-clusters)$/);
  assert.equal(result.source.lineEndingStyle, 'none');
  assert.deepEqual(result.lines, []);
  assert.deepEqual(result.diagnostics, []);
});

test('ASCII and Japanese metrics agree across coordinate systems', () => {
  for (const value of ['abc', 'あいう']) {
    const source = analyzeJapaneseTextSource(value).source;
    assert.equal(source.utf16CodeUnits, 3);
    assert.equal(source.codePoints, 3);
    assert.equal(source.graphemes, 3);
    assert.equal(source.lineEndingStyle, 'none');
  }
});

test('surrogate pairs and emoji retain UTF-16 offsets while counting one grapheme', () => {
  for (const value of ['𠮷', '😀']) {
    const result = analyzeJapaneseTextSource(value);
    assert.equal(result.source.utf16CodeUnits, 2);
    assert.equal(result.source.codePoints, 1);
    assert.equal(result.source.graphemes, 1);
    assert.equal(slice(value, getGraphemeRanges(value)[0]), value);
  }
});

test('variation selector, combining mark, and ZWJ family are grapheme clusters', () => {
  const values = ['✈️', 'か\u3099', '👨‍👩‍👧‍👦'];
  for (const value of values) {
    const result = analyzeJapaneseTextSource(value);
    assert.equal(result.source.graphemes, 1);
    assert.equal(getGraphemeRanges(value).length, 1);
    assert.equal(slice(value, getGraphemeRanges(value)[0]), value);
  }
});

test('explicit fallback keeps combining, variation selector, and ZWJ sequences together', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
  try {
    for (const value of ['✈️', 'か\u3099', '👨‍👩‍👧‍👦']) {
      const result = analyzeJapaneseTextSource(value);
      assert.equal(result.source.graphemeSegmentation, 'fallback-code-point-clusters');
      assert.equal(result.source.graphemes, 1);
      assert.equal(getGraphemeRanges(value).map(range => slice(value, range)).join(''), value);
    }
  } finally {
    if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor);
  }
});

test('LF, CRLF, and CR are represented exactly', () => {
  for (const [text, expected] of [['a\nb', 'lf'], ['a\r\nb', 'crlf'], ['a\rb', 'cr']] as const) {
    const result = analyzeJapaneseTextSource(text);
    assert.equal(result.source.lineEndingStyle, expected);
    assert.equal(result.lines.length, 2);
    assert.equal(slice(text, result.lines[0]), text.slice(0, text.indexOf('b')));
    assert.equal(slice(text, result.lines[0].contentRange), 'a');
    assert.equal(slice(text, result.lines[0].lineEndingRange!), expected === 'lf' ? '\n' : expected === 'crlf' ? '\r\n' : '\r');
    assert.equal(result.lines[1].lineEnding, 'none');
  }
});

test('mixed line endings produce a source-located warning without normalization', () => {
  const text = 'a\nb\r\nc\rd';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.source.lineEndingStyle, 'mixed');
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].code, 'mixed_line_endings');
  assert.equal(slice(text, result.diagnostics[0]), '\r\n');
});

test('final newline is owned by the final non-phantom source line', () => {
  const withEnding = analyzeJapaneseTextSource('本文\n');
  assert.equal(withEnding.lines.length, 1);
  assert.equal(withEnding.lines[0].lineEnding, 'lf');
  assert.equal(slice('本文\n', withEnding.lines[0]), '本文\n');
  const withoutEnding = analyzeJapaneseTextSource('本文');
  assert.equal(withoutEnding.lines.length, 1);
  assert.equal(withoutEnding.lines[0].lineEnding, 'none');
});

test('consecutive blank, ASCII whitespace, and full-width whitespace lines remain distinct', () => {
  const text = '\n\n \n　\n本文';
  const { lines } = analyzeJapaneseTextSource(text);
  assert.equal(lines.length, 5);
  assert.deepEqual(lines.map(line => [line.isEmpty, line.isWhitespaceOnly, line.isBlank]), [
    [true, false, true], [true, false, true], [false, true, true], [false, true, true], [false, false, false],
  ]);
});

test('line and grapheme source ranges reconstruct the original string exactly', () => {
  const text = '𠮷野家\r\n「✈️」\nか\u3099👨‍👩‍👧‍👦';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.lines.map(line => slice(text, line)).join(''), text);
  assert.equal(getGraphemeRanges(text).map(range => slice(text, range)).join(''), text);
  result.lines.forEach((line, index) => assert.equal(line.index, index));
  getGraphemeRanges(text).forEach((range, index) => assert.equal(range.index, index));
});

test('parser version is present and input source is not changed', () => {
  const text = 'Ａ  A\r\nか\u3099';
  const before = text;
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.parserVersion, JAPANESE_TEXT_PARSER_VERSION);
  assert.equal(text, before);
  assert.equal(result.source.utf16CodeUnits, text.length);
});

test('very long single line is scanned without copying it into line objects', () => {
  const text = '長'.repeat(100_000);
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].endOffset, text.length);
  assert.equal(result.source.graphemes, 100_000);
  assert.equal('value' in result.lines[0], false);
});
