import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeJapaneseTextSource, BUILTIN_SECTION_BREAKS } from './index.js';

const slice = (text: string, range: { startOffset: number; endOffset: number }) => text.slice(range.startOffset, range.endOffset);
const sentenceTexts = (text: string) => analyzeJapaneseTextSource(text).sentences.map(sentence => slice(text, sentence));

test('document without separator has one source-derived section', () => {
  const text = '第一段落。\n第二段落。';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.sectionBreaks.length, 0);
  assert.equal(result.sections.length, 1);
  assert.equal(slice(text, result.sections[0]), text);
  assert.deepEqual(result.sections[0].paragraphIds, result.paragraphs.map(value => value.id));
});

test('all built-in markers are detected only when occupying a complete content line', () => {
  assert.equal(BUILTIN_SECTION_BREAKS.length, 6);
  for (const definition of BUILTIN_SECTION_BREAKS) {
    const text = `前\n${definition.marker}\n後`;
    const result = analyzeJapaneseTextSource(text);
    assert.equal(result.sectionBreaks.length, 1);
    assert.equal(result.sectionBreaks[0].definitionId, definition.id);
    assert.equal(slice(text, result.sectionBreaks[0].markerRange), definition.marker);
    assert.equal(result.sections.length, 2);
  }
  assert.equal(analyzeJapaneseTextSource('彼は***そう思った。').sectionBreaks.length, 0);
});

test('separator permits surrounding whitespace while preserving the entire source line', () => {
  const text = '前\n  ***　\r\n後';
  const sectionBreak = analyzeJapaneseTextSource(text).sectionBreaks[0];
  assert.equal(slice(text, sectionBreak), '  ***　\r\n');
  assert.equal(slice(text, sectionBreak.markerRange), '***');
});

test('custom separator works and malformed or duplicate definitions report diagnostics', () => {
  const text = '前\n===\n後';
  const result = analyzeJapaneseTextSource(text, { sectionBreaks: [
    { id: 'custom', marker: '===' }, { id: 'duplicate', marker: '===' }, { id: '', marker: '' },
  ] });
  assert.equal(result.sectionBreaks[0].definitionId, 'custom');
  assert.ok(result.diagnostics.some(value => value.code === 'duplicate_section_definition'));
  assert.ok(result.diagnostics.some(value => value.code === 'malformed_section_definition'));
});

test('consecutive separators create explicit empty sections and deterministic IDs', () => {
  const text = '***\n***';
  const first = analyzeJapaneseTextSource(text);
  const second = analyzeJapaneseTextSource(text);
  assert.equal(first.sectionBreaks.length, 2);
  assert.equal(first.sections.length, 3);
  assert.deepEqual(first.sections.map(section => slice(text, section)), ['', '', '']);
  assert.deepEqual(first.sectionBreaks, second.sectionBreaks);
  assert.deepEqual(first.sections, second.sections);
  assert.equal(first.sections[1].precedingBreakId, first.sectionBreaks[0].id);
});

test('separator-only document has two empty sections and one independent break', () => {
  const text = '***';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.sections.length, 2);
  assert.deepEqual(result.sections.map(section => slice(text, section)), ['', '']);
  assert.equal(slice(text, result.sectionBreaks[0]), text);
  assert.equal(result.paragraphs.length, 0);
  assert.equal(result.sentences.length, 0);
});

test('each nonblank physical line is one paragraph; blank lines remain only in source', () => {
  const text = '一\n二\n\n \n　\n三';
  const result = analyzeJapaneseTextSource(text);
  assert.deepEqual(result.paragraphs.map(paragraph => slice(text, paragraph.contentRange)), ['一', '二', '三']);
  assert.deepEqual(result.paragraphs.map(paragraph => [paragraph.lineStartIndex, paragraph.lineEndIndex]), [[0, 0], [1, 1], [5, 5]]);
  assert.equal(result.lines.map(line => slice(text, line)).join(''), text);
});

test('CRLF paragraph owns its source line while contentRange excludes line ending', () => {
  const text = '一行目\r\n二行目';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(slice(text, result.paragraphs[0]), '一行目\r\n');
  assert.equal(slice(text, result.paragraphs[0].contentRange), '一行目');
});

test('multi-line paired region crosses independent paragraphs and forms one structural sentence', () => {
  const text = '「私はね、\nずっと前から\n知っていたの」';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.paragraphs.length, 3);
  assert.equal(result.symbolRegions.length, 1);
  assert.equal(result.sentences.length, 1);
  assert.equal(slice(text, result.sentences[0]), text);
  assert.deepEqual(result.sentences[0].paragraphIds, result.paragraphs.map(value => value.id));
});

test('plain Japanese terminal sequences are preserved as one terminal', () => {
  for (const [text, terminal] of [['彼は歩いた。', '。'], ['本当？', '？'], ['行く！', '！'], ['本当！？', '！？'], ['本当？！', '？！'], ['Really!!', '!!'], ['Really?!', '?!']] as const) {
    const result = analyzeJapaneseTextSource(text);
    assert.deepEqual(result.sentences.map(sentence => slice(text, sentence)), [text]);
    assert.equal(result.sentences[0].terminalText, terminal);
    assert.equal(slice(text, result.sentences[0].terminalRange!), terminal);
  }
});

test('critical A: terminal inside an embedded region does not split continuing outer prose', () => {
  const text = '彼は「行く。」と言った。';
  assert.deepEqual(sentenceTexts(text), [text]);
});

test('critical B: multiple terminals inside one region remain separate structural sentences', () => {
  const text = '「行く。絶対に戻る。」';
  const result = analyzeJapaneseTextSource(text);
  assert.deepEqual(result.sentences.map(sentence => slice(text, sentence)), ['「行く。', '絶対に戻る。」']);
  assert.deepEqual(result.sentences.map(sentence => sentence.terminalText), ['。', '。']);
});

test('critical C: adjacent paired regions become separate structural sentences', () => {
  const text = '「行く！」「待って！」';
  assert.deepEqual(sentenceTexts(text), ['「行く！」', '「待って！」']);
});

test('nested paired terminal does not split outer continuation', () => {
  const text = '「彼は『行く！』と言った。」';
  assert.deepEqual(sentenceTexts(text), [text]);
});

test('ellipsis and dash are not terminals', () => {
  for (const text of ['「でも……私は」', '「待て――まだだ」', '...']) {
    const result = analyzeJapaneseTextSource(text);
    assert.equal(result.sentences.length, 1);
    assert.equal(result.sentences[0].terminalRange, null);
  }
});

test('paragraph boundary supplies fallback sentences when punctuation is absent', () => {
  const text = 'そう思った\nでも言えなかった';
  assert.deepEqual(sentenceTexts(text), ['そう思った', 'でも言えなかった']);
});

test('multiple prose sentences in one paragraph, emoji, and CRLF preserve exact source ranges', () => {
  const text = '😀は歩いた。𠮷野は止まった。\r\n次だ';
  const result = analyzeJapaneseTextSource(text);
  assert.deepEqual(result.sentences.map(sentence => slice(text, sentence)), ['😀は歩いた。', '𠮷野は止まった。', '次だ']);
  assert.equal(result.source.lineEndingStyle, 'crlf');
});

test('malformed paired region does not stop sentence parsing', () => {
  const text = '「壊れた』。その後《正常》。';
  const result = analyzeJapaneseTextSource(text);
  assert.ok(result.symbolRegions.some(region => region.status === 'mismatched'));
  assert.deepEqual(result.sentences.map(sentence => slice(text, sentence)), ['「壊れた』。', 'その後《正常》。']);
});

test('structural nodes expose no dialogue, narration, thought, speaker, POV, or Scene semantics', () => {
  const result = analyzeJapaneseTextSource('「本文。」');
  for (const node of [...result.sections, ...result.paragraphs, ...result.sentences]) {
    for (const key of ['dialogue', 'narration', 'thought', 'speaker', 'pov', 'scene']) assert.equal(key in node, false);
  }
});
