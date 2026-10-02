import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeJapaneseTextSource, BUILTIN_SYMBOL_PAIRS, scanPairedSymbolRegions } from './index.js';

const slice = (text: string, range: { startOffset: number; endOffset: number }) => text.slice(range.startOffset, range.endOffset);

test('built-in definitions detect supported pairs without assigning meaning', () => {
  const cases = ['「こんにちは」', '『こんにちは』', '（こんにちは）', '(hello)', '【SYSTEM】', '〈名称〉', '《魔導書》', '〝語句〟', '“hello”', '‘word’'];
  assert.equal(BUILTIN_SYMBOL_PAIRS.length, cases.length);
  cases.forEach(text => {
    const result = analyzeJapaneseTextSource(text);
    assert.equal(result.symbolRegions.length, 1);
    assert.equal(result.symbolRegions[0].status, 'closed');
    assert.equal(slice(text, result.symbolRegions[0]), text);
    assert.equal(slice(text, result.symbolRegions[0].openRange), result.symbolRegions[0].openSymbol);
    assert.equal(slice(text, result.symbolRegions[0].contentRange), text.slice(result.symbolRegions[0].openSymbol.length, -result.symbolRegions[0].closeSymbol.length));
    assert.equal(slice(text, result.symbolRegions[0].closeRange!), result.symbolRegions[0].closeSymbol);
    assert.equal('dialogue' in result.symbolRegions[0], false);
    assert.equal('innerThought' in result.symbolRegions[0], false);
    assert.equal('narration' in result.symbolRegions[0], false);
  });
});

test('multi-line region crosses LF and SourceLine boundaries', () => {
  const text = '「私はね、\nずっと前から\n知っていたの」';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.lines.length, 3);
  assert.equal(result.symbolRegions.length, 1);
  assert.equal(slice(text, result.symbolRegions[0]), text);
  assert.equal(slice(text, result.symbolRegions[0].contentRange), '私はね、\nずっと前から\n知っていたの');
});

test('nested regions preserve parent, depth, source slices, and outer-first ordering', () => {
  const text = '「彼は『帰る』と言った」';
  const { symbolRegions } = analyzeJapaneseTextSource(text);
  assert.equal(symbolRegions.length, 2);
  const [outer, inner] = symbolRegions;
  assert.equal(outer.depth, 0);
  assert.equal(outer.parentRegionId, null);
  assert.equal(inner.depth, 1);
  assert.equal(inner.parentRegionId, outer.id);
  assert.equal(slice(text, outer), text);
  assert.equal(slice(text, inner), '『帰る』');
});

test('same-pair nesting is structural and deterministic', () => {
  const text = '「A「B」C」';
  const first = analyzeJapaneseTextSource(text);
  const second = analyzeJapaneseTextSource(text);
  assert.equal(first.symbolRegions.length, 2);
  assert.deepEqual(first.symbolRegions, second.symbolRegions);
  assert.equal(first.symbolRegions[1].parentRegionId, first.symbolRegions[0].id);
  assert.equal(first.symbolRegions[1].depth, 1);
});

test('adjacent regions remain separate and usage inventory is compact', () => {
  const text = '「行く」「待って」';
  const result = analyzeJapaneseTextSource(text);
  assert.deepEqual(result.symbolRegions.map(region => slice(text, region)), ['「行く」', '「待って」']);
  assert.equal(result.symbolUsage.length, 1);
  assert.equal(result.symbolUsage[0].occurrenceCount, 2);
  assert.equal(result.symbolUsage[0].firstOccurrenceOffset, 0);
  assert.deepEqual(result.symbolUsage[0].regionIds, result.symbolRegions.map(region => region.id));
});

test('symbols in ordinary text remain meaning-free regions', () => {
  const text = '彼は《魔導書》を開いた。';
  const region = analyzeJapaneseTextSource(text).symbolRegions[0];
  assert.equal(slice(text, region), '《魔導書》');
  assert.equal(region.kind, 'paired_symbol_region');
});

test('unclosed open returns an EOF-bounded region and diagnostic', () => {
  const text = '「こんにちは';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.symbolRegions[0].status, 'unclosed');
  assert.equal(result.symbolRegions[0].closeRange, null);
  assert.equal(slice(text, result.symbolRegions[0]), text);
  assert.equal(slice(text, result.symbolRegions[0].contentRange), 'こんにちは');
  assert.equal(result.diagnostics[0].code, 'unclosed_symbol');
});

test('unexpected close yields a diagnostic and scanning continues', () => {
  const text = '」こんにちは「正常」';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.diagnostics[0].code, 'unexpected_closing_symbol');
  assert.deepEqual(result.symbolRegions.map(region => slice(text, region)), ['「正常」']);
});

test('crossed nesting recovers the outer region and does not swallow a later normal region', () => {
  const text = '「A『B」C』その後「正常」';
  const result = analyzeJapaneseTextSource(text);
  const [outer, inner, normal] = result.symbolRegions;
  assert.equal(slice(text, outer), '「A『B」');
  assert.equal(outer.status, 'closed');
  assert.equal(slice(text, inner), '『B');
  assert.equal(inner.status, 'mismatched');
  assert.equal(inner.closeRange, null);
  assert.equal(slice(text, normal), '「正常」');
  assert.ok(result.diagnostics.some(value => value.code === 'mismatched_symbol'));
  assert.ok(result.diagnostics.some(value => value.code === 'unexpected_closing_symbol'));
});

test('wrong close ends the active malformed region so following regions remain detectable', () => {
  const text = '「A』その後《正常》';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.symbolRegions[0].status, 'mismatched');
  assert.equal(slice(text, result.symbolRegions[0]), '「A』');
  assert.equal(slice(text, result.symbolRegions[0].closeRange!), '』');
  assert.equal(slice(text, result.symbolRegions[1]), '《正常》');
});

test('depth limit reports overflow without throwing and scanner completes', () => {
  const text = `${'「'.repeat(5)}X${'」'.repeat(5)}《後続》`;
  const result = analyzeJapaneseTextSource(text, { maxSymbolNestingDepth: 3 });
  assert.ok(result.diagnostics.some(value => value.code === 'nesting_limit'));
  assert.ok(result.symbolRegions.some(region => slice(text, region) === '《後続》' && region.status === 'closed'));
});

test('custom multi-character definitions use longest-match and preserve exact ranges', () => {
  const text = '<<A>> <B>';
  const result = scanPairedSymbolRegions(text, { pairedSymbols: [
    { id: 'short', openSymbol: '<', closeSymbol: '>' },
    { id: 'long', openSymbol: '<<', closeSymbol: '>>' },
  ] });
  assert.deepEqual(result.regions.map(region => [region.pairId, slice(text, region)]), [['long', '<<A>>'], ['short', '<B>']]);
});

test('emoji, surrogate pairs, combining marks, and CRLF retain UTF-16 slices inside regions', () => {
  const text = '前「😀𠮷か\u3099\r\n✈️」後';
  const result = analyzeJapaneseTextSource(text);
  const region = result.symbolRegions[0];
  assert.equal(slice(text, region), '「😀𠮷か\u3099\r\n✈️」');
  assert.equal(slice(text, region.contentRange), '😀𠮷か\u3099\r\n✈️');
  assert.equal(result.source.lineEndingStyle, 'crlf');
});

test('unknown symbols are not inferred as pairs', () => {
  const result = analyzeJapaneseTextSource('〔未登録〕');
  assert.deepEqual(result.symbolRegions, []);
  assert.deepEqual(result.symbolUsage, []);
});
