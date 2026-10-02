import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeJapaneseTextSource, getGraphemeRanges } from './index.js';

function endings(text: string, options = {}) {
  return analyzeJapaneseTextSource(text, options).endingAnalysis;
}

test('exact surface and terminal are separate deterministic source ranges', () => {
  const text = '歩いた。静かだった。行かない。行きます。本当？行く！？';
  const analysis = endings(text);
  assert.deepEqual(analysis.sentences.map(value => value.exactSurfaceEnding), ['歩いた', '静かだった', '行かない', '行きます', '本当', '行く']);
  assert.deepEqual(analysis.sentences.map(value => value.terminalText), ['。', '。', '。', '。', '？', '！？']);
  for (const value of analysis.sentences) {
    assert.equal(text.slice(value.exactSurfaceRange!.startOffset, value.exactSurfaceRange!.endOffset), value.exactSurfaceEnding);
  }
});

test('no-terminal fragments, ellipsis, dash, and trailing whitespace preserve surface meaningfully', () => {
  assert.equal(endings('そう思った').sentences[0].exactSurfaceEnding, 'そう思った');
  assert.equal(endings('でも……').sentences[0].exactSurfaceEnding, 'でも……');
  assert.equal(endings('まさか――').sentences[0].exactSurfaceEnding, 'まさか――');
  assert.equal(endings('歩いた。   ').sentences[0].exactSurfaceEnding, '歩いた');
  assert.equal(endings('歩いた。　　').sentences[0].exactSurfaceEnding, '歩いた');
});

test('quote closing symbols are excluded from ending surface', () => {
  for (const [text, expected, terminal] of [
    ['「行く。」', '行く', '。'],
    ['「行く！」', '行く', '！'],
    ['「行く……」', '行く……', null],
    ['「まさか――」', 'まさか――', null],
    ['「『行く。』」', '行く', '。'],
  ] as const) {
    const value = endings(text).sentences[0];
    assert.equal(value.exactSurfaceEnding, expected);
    assert.equal(value.terminalText, terminal);
  }
});

test('Critical A/B/C retain canonical Sentence boundaries and receive endings', () => {
  assert.deepEqual(endings('彼は「行く。」と言った。').sentences.map(value => value.exactSurfaceEnding), ['行く。」と言った']);
  assert.deepEqual(endings('「行く。絶対に戻る。」').sentences.map(value => value.exactSurfaceEnding), ['行く', '絶対に戻る']);
  assert.deepEqual(endings('「行く！」「待って！」').sentences.map(value => value.exactSurfaceEnding), ['行く', '待って']);
});

test('lightweight surface suffix uses longest match and leaves unmatched as null', () => {
  const values = endings('静かだった。歩いた。海辺。').sentences;
  assert.deepEqual(values.map(value => value.pattern), ['だった', 'た', null]);
  assert.deepEqual(values.map(value => value.patternId), ['surface-datta', 'surface-ta', null]);
});

test('custom definitions are deterministic and can precede built-ins', () => {
  const analysis = endings('眠った。笑った。', { endingPatterns: [{ id: 'custom-otta', suffix: 'った' }] });
  assert.deepEqual(analysis.sentences.map(value => value.patternId), ['custom-otta', 'custom-otta']);
  assert.deepEqual(analysis.patternDistribution.map(value => [value.value, value.count]), [['った', 2]]);
});

test('distribution orders by count then first occurrence and records unmatched count', () => {
  const analysis = endings('行きます。歩いた。見た。海辺。');
  assert.deepEqual(analysis.patternDistribution.map(value => [value.value, value.count]), [['た', 2], ['ます', 1]]);
  assert.equal(analysis.unmatchedPatternCount, 1);
  assert.deepEqual(analysis.patternDistribution[0].sentenceIds, [analysis.sentences[1].sentenceId, analysis.sentences[2].sentenceId]);
});

test('pattern streaks require the configured length and reset at Section boundaries', () => {
  const continuous = endings('歩いた。見た。笑った。');
  assert.equal(continuous.streaks.length, 1);
  assert.deepEqual([continuous.streaks[0].startSentenceIndex, continuous.streaks[0].endSentenceIndex, continuous.streaks[0].count], [0, 2, 3]);
  const separated = endings('歩いた。見た。\n***\n笑った。');
  assert.equal(separated.streaks.length, 0);
});

test('rolling concentration uses overlapping windows without crossing Sections', () => {
  const analysis = endings('歩いた。見る。笑った。走る。止まった。振り向いた。', { endingConcentrationWindowSize: 5 });
  const ta = analysis.concentrations.filter(value => value.pattern === 'た');
  assert.deepEqual(ta.map(value => [value.startSentenceIndex, value.endSentenceIndex, value.occurrenceCount]), [[0, 4, 3], [1, 5, 3]]);
  const separated = endings('歩いた。見た。\n***\n笑った。走った。', { endingConcentrationWindowSize: 5 });
  assert.ok(separated.concentrations.every(value => value.sectionId === separated.sentences[value.startSentenceIndex].sectionId));
  assert.ok(separated.concentrations.every(value => value.windowSize === 2));
});

test('window smaller than configured size is analyzed once and unmatched values do not form concentrations', () => {
  const short = endings('歩いた。見た。', { endingConcentrationWindowSize: 5 });
  assert.equal(short.concentrations.length, 1);
  assert.equal(short.concentrations[0].windowSize, 2);
  assert.equal(short.concentrations[0].ratio, 1);
  assert.equal(endings('海辺。朝焼け。').concentrations.length, 0);
});

test('Section summaries expose distributions and streaks without crossing boundaries', () => {
  const analysis = endings('歩いた。見た。笑った。\n***\n行きます。');
  assert.equal(analysis.sections.length, 2);
  assert.deepEqual(analysis.sections.map(value => value.sentenceCount), [3, 1]);
  assert.deepEqual(analysis.sections.map(value => value.streaks.length), [1, 0]);
  assert.deepEqual(analysis.sections[0].patternDistribution.map(value => value.value), ['た']);
});

test('Unicode extraction is grapheme-aware and preserves source range invariants', () => {
  for (const text of ['😀歩いた。', '𠮷野を見た。', 'か\u3099輝いた。', '✈️が見えた。']) {
    const value = endings(text, { exactSurfaceMaximumGraphemes: 4 }).sentences[0];
    assert.equal(text.slice(value.exactSurfaceRange!.startOffset, value.exactSurfaceRange!.endOffset), value.exactSurfaceEnding);
    assert.ok(getGraphemeRanges(text).some(grapheme => grapheme.startOffset === value.exactSurfaceRange!.startOffset));
    assert.ok(getGraphemeRanges(text).some(grapheme => grapheme.endOffset === value.exactSurfaceRange!.endOffset));
  }
});

test('multi-line endings inspect only the tail and result contains no judgment fields or diagnostics', () => {
  const result = analyzeJapaneseTextSource('「A\r\n歩いた。」');
  assert.equal(result.endingAnalysis.sentences[0].exactSurfaceEnding, '歩いた');
  for (const key of ['score', 'warning', 'recommendation', 'good', 'bad', 'monotonyScore', 'endingQuality']) {
    assert.equal(key in result.endingAnalysis, false);
  }
  assert.equal(result.diagnostics.some(value => /ending|語尾|反復/u.test(value.code + value.message)), false);
});
