import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeJapaneseTextSource } from './index.js';

const slice = (text: string, range: { startOffset: number; endOffset: number }) => text.slice(range.startOffset, range.endOffset);

test('closed paired region内のmarkerはcandidateだがeffective Section breakではない', () => {
  const text = '「これは演出なんだ\n***\nそういうことだ」';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.sectionBreaks.length, 1);
  assert.equal(slice(text, result.sectionBreaks[0].markerRange), '***');
  assert.equal(result.effectiveSectionBreaks.length, 0);
  assert.equal(result.sections.length, 1);
  assert.equal(slice(text, result.sections[0]), text);
  assert.equal(result.paragraphs.some(paragraph => slice(text, paragraph.contentRange) === '***'), true);
});

test('unclosed regionは後続markerを抑制せずSection recoveryを維持する', () => {
  const text = '「閉じ忘れた\n\n***\n\n次の場面';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.symbolRegions[0].status, 'unclosed');
  assert.equal(result.sectionBreaks.length, 1);
  assert.equal(result.effectiveSectionBreaks.length, 1);
  assert.equal(result.sections.length, 2);
  assert.equal(result.sentences.every(sentence => sentence.sectionId === result.sections.find(section => section.id === sentence.sectionId)?.id), true);
});

test('mismatched region後のmarkerはeffective breakになる', () => {
  const text = '「壊れた』\n***\n次の場面';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.symbolRegions[0].status, 'mismatched');
  assert.equal(result.effectiveSectionBreaks.length, 1);
  assert.equal(result.sections.length, 2);
});

test('multi-line Sentenceは交差する全Paragraphから参照されglobalでは一度だけ存在する', () => {
  const text = '「私はね、\nずっと前から\n知っていたの」';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.sentences.length, 1);
  assert.equal(result.paragraphs.length, 3);
  assert.deepEqual(result.sentences[0].paragraphIds, result.paragraphs.map(paragraph => paragraph.id));
  result.paragraphs.forEach(paragraph => assert.deepEqual(paragraph.sentenceIds, [result.sentences[0].id]));
  assert.equal(result.paragraphs.flatMap(paragraph => paragraph.sentenceIds).length, 3);
});

test('Sentence rangesは重複せずCritical Bのsymbol ownershipも一意', () => {
  const text = '「行く。絶対に戻る。」';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.sentences.length, 2);
  assert.ok(result.sentences[0].endOffset <= result.sentences[1].startOffset);
  assert.deepEqual(result.sentences.map(sentence => slice(text, sentence)), ['「行く。', '絶対に戻る。」']);
  assert.equal(result.sentences.filter(sentence => sentence.startOffset <= 0 && sentence.endOffset > 0).length, 1);
  const closeOffset = text.indexOf('」');
  assert.equal(result.sentences.filter(sentence => sentence.startOffset <= closeOffset && sentence.endOffset > closeOffset).length, 1);
});

test('Paragraph contentはSentence rangesで順序通り一度だけcoverされる', () => {
  const text = '彼は「行く。」と言った。';
  const result = analyzeJapaneseTextSource(text);
  const paragraph = result.paragraphs[0];
  const sentences = result.sentences.filter(sentence => paragraph.sentenceIds.includes(sentence.id));
  assert.equal(sentences.map(sentence => slice(text, sentence)).join(''), slice(text, paragraph.contentRange));
  for (let index = 1; index < sentences.length; index += 1) assert.equal(sentences[index - 1].endOffset, sentences[index].startOffset);
});

test('effective Section boundaryをSentenceは跨がない', () => {
  const text = '前半。\n***\n後半。';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.sections.length, 2);
  result.sentences.forEach(sentence => {
    const section = result.sections.find(value => value.id === sentence.sectionId)!;
    assert.ok(sentence.startOffset >= section.startOffset);
    assert.ok(sentence.endOffset <= section.endOffset);
  });
});

test('empty Sectionとseparator-only semanticsを維持する', () => {
  const text = '***';
  const result = analyzeJapaneseTextSource(text);
  assert.equal(result.sectionBreaks.length, 1);
  assert.equal(result.effectiveSectionBreaks.length, 1);
  assert.equal(result.sections.length, 2);
  assert.deepEqual(result.sections.map(section => slice(text, section)), ['', '']);
  assert.equal(result.paragraphs.length, 0);
  assert.equal(result.sentences.length, 0);
});

test('同じsource・version・optionsで全relationshipがdeterministic', () => {
  const text = '前半。\n***\n「後半。続く。」';
  const first = analyzeJapaneseTextSource(text);
  const second = analyzeJapaneseTextSource(text);
  assert.deepEqual({ breaks: first.sectionBreaks, effective: first.effectiveSectionBreaks, sections: first.sections, paragraphs: first.paragraphs, sentences: first.sentences },
    { breaks: second.sectionBreaks, effective: second.effectiveSectionBreaks, sections: second.sections, paragraphs: second.paragraphs, sentences: second.sentences });
});
