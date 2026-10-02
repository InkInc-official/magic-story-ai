import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeJapaneseTextSource } from './japanese-text/index.js';
import {
  buildInspectorTextStructure,
  INSPECTOR_STRUCTURE_ADAPTER_VERSION,
  type InspectorStructureAdapterInput,
  type InspectorTextStructureContext,
} from './inspector-text-structure.js';

function input(content: string, startOffset: number, endOffset: number, requested = { startOffset: 0, endOffset: content.length }): InspectorStructureAdapterInput {
  return { content, requestedRange: requested, inspectedRange: { startOffset, endOffset } };
}

function assertSourceInvariants(source: InspectorStructureAdapterInput, result: InspectorTextStructureContext) {
  assert.deepEqual(result.requestedRange, source.requestedRange);
  assert.deepEqual(result.inspectedRange, source.inspectedRange);
  assert.equal(source.content.slice(result.beforeRange.startOffset, result.beforeRange.endOffset), result.surroundingBefore);
  assert.equal(source.content.slice(result.afterRange.startOffset, result.afterRange.endOffset), result.surroundingAfter);
  assert.equal(result.beforeRange.endOffset, source.inspectedRange.startOffset);
  assert.equal(result.afterRange.startOffset, source.inspectedRange.endOffset);
}

test('partial Sentence keeps evidence range and expands structural surroundings', () => {
  const content = '彼は静かに窓の外を見ていた。';
  const start = content.indexOf('窓');
  const source = input(content, start, start + '窓の外を見'.length);
  const result = buildInspectorTextStructure(source);
  assertSourceInvariants(source, result);
  assert.equal(result.overlappingSentenceIds.length, 1);
  assert.equal(result.overlappingParagraphIds.length, 1);
  assert.equal(result.surroundingBefore, '彼は静かに');
  assert.equal(result.surroundingAfter, 'ていた。');
  assert.equal(result.parserVersion, '5b5-v1');
  assert.equal(result.adapterVersion, INSPECTOR_STRUCTURE_ADAPTER_VERSION);
});

test('selection spanning two Sentences and two Paragraphs resolves both in source order', () => {
  const content = '今日は晴れている。\n彼は外へ出た。';
  const start = content.indexOf('晴れ');
  const end = content.indexOf('出た') + 2;
  const source = input(content, start, end);
  const result = buildInspectorTextStructure(source);
  assertSourceInvariants(source, result);
  assert.equal(result.overlappingSentenceIds.length, 2);
  assert.equal(result.anchorSentenceIds.length, 2);
  assert.equal(result.overlappingParagraphIds.length, 2);
  assert.equal(result.sectionIds.length, 1);
});

test('multiline closed paired region remains one canonical Sentence', () => {
  const content = '「私はね、\nずっと前から\n知っていたの」';
  const start = content.indexOf('ずっと');
  const source = input(content, start, start + 3);
  const result = buildInspectorTextStructure(source);
  assertSourceInvariants(source, result);
  assert.equal(result.overlappingSentenceIds.length, 1);
  assert.equal(result.overlappingParagraphIds.length, 1);
  assert.equal(result.anchorParagraphIds.length, 3);
});

test('blank line uses nearest previous and next Sentences without changing selection', () => {
  const content = '前の文。\n\n後の文。';
  const start = content.indexOf('\n');
  const source = input(content, start, start + 2);
  const result = buildInspectorTextStructure(source);
  assertSourceInvariants(source, result);
  assert.equal(result.overlappingSentenceIds.length, 0);
  assert.equal(result.anchorSentenceIds.length, 2);
  assert.deepEqual(result.sectionIds.length, 1);
});

test('effective Section separator selects both adjacent Sections', () => {
  const content = '前の文。\n***\n後の文。';
  const start = content.indexOf('***');
  const source = input(content, start, start + 3);
  const result = buildInspectorTextStructure(source);
  assertSourceInvariants(source, result);
  assert.equal(result.overlappingSentenceIds.length, 0);
  assert.equal(result.anchorSentenceIds.length, 2);
  assert.equal(result.sectionIds.length, 2);
  assert.match(`${result.surroundingBefore}${content.slice(start, start + 3)}${result.surroundingAfter}`, /前の文。[\s\S]*後の文。/u);
});

test('candidate inside closed Region is not treated as a Section boundary', () => {
  const content = '「A\n***\nB」';
  const start = content.indexOf('***');
  const result = buildInspectorTextStructure(input(content, start, start + 3));
  assert.equal(result.overlappingSentenceIds.length, 1);
  assert.equal(result.sectionIds.length, 1);
});

test('unclosed and mismatched symbols retain diagnostics and usable structure', () => {
  for (const [content, code] of [['「閉じない。', 'unclosed_symbol'], ['「不一致』。', 'mismatched_symbol']] as const) {
    const source = input(content, 1, 3);
    const result = buildInspectorTextStructure(source);
    assertSourceInvariants(source, result);
    assert.ok(result.diagnosticCodes.includes(code));
    assert.notEqual(result.fallbackReason, 'parser_exception');
  }
});

test('giant Sentence uses bounded character fallback and preserves inspected range', () => {
  const content = `始${'あ'.repeat(10_000)}終。`;
  const start = 5_000;
  const source = input(content, start, start + 10);
  const result = buildInspectorTextStructure(source, { maxBefore: 90, maxAfter: 80 });
  assertSourceInvariants(source, result);
  assert.equal(result.expansionMode, 'character-fallback');
  assert.equal(result.fallbackReason, 'giant_sentence');
  assert.ok(result.surroundingBefore.length <= 90);
  assert.ok(result.surroundingAfter.length <= 80);
});

test('giant Paragraph never forces unbounded expansion', () => {
  const content = Array.from({ length: 2_000 }, (_, index) => `${index}。`).join('');
  const start = content.indexOf('1000。') + 1;
  const source = input(content, start, start + 2);
  const result = buildInspectorTextStructure(source, { maxBefore: 60, maxAfter: 60 });
  assertSourceInvariants(source, result);
  assert.ok(result.surroundingBefore.length <= 60);
  assert.ok(result.surroundingAfter.length <= 60);
});

test('zero-width policy prefers containing or next Sentence, then previous at EOF', () => {
  const content = '最初。次。';
  const analysis = analyzeJapaneseTextSource(content);
  const boundary = analysis.sentences[1].startOffset;
  const inside = buildInspectorTextStructure(input(content, 1, 1));
  const atBoundary = buildInspectorTextStructure(input(content, boundary, boundary));
  const atEof = buildInspectorTextStructure(input(content, content.length, content.length));
  assert.deepEqual(atBoundary.anchorSentenceIds, [analysis.sentences[1].id]);
  assert.deepEqual(inside.anchorSentenceIds, [analysis.sentences[0].id]);
  assert.deepEqual(atEof.anchorSentenceIds, [analysis.sentences[1].id]);
  assert.deepEqual(atBoundary.overlappingSentenceIds, []);
});

test('zero-width blank location resolves nearest Sentences deterministically', () => {
  const content = '前。\n\n後。';
  const position = content.indexOf('\n') + 1;
  const result = buildInspectorTextStructure(input(content, position, position));
  assert.equal(result.overlappingSentenceIds.length, 0);
  assert.equal(result.anchorSentenceIds.length, 2);
});

test('Unicode fallback clips only at grapheme boundaries', () => {
  const family = '👨‍👩‍👧‍👦';
  const combining = 'か\u3099';
  const content = `${family.repeat(20)}${combining.repeat(20)}本文${family.repeat(20)}${combining.repeat(20)}`;
  const start = content.indexOf('本文');
  const source = input(content, start, start + 2);
  const result = buildInspectorTextStructure(source, { maxBefore: 17, maxAfter: 17 }, { analyze: () => { throw new Error('forced'); } });
  assertSourceInvariants(source, result);
  assert.equal(result.fallbackReason, 'parser_exception');
  assert.doesNotMatch(result.surroundingBefore, /^[\u0300-\u036f\u3099\uFE0F\u200D]/u);
  assert.doesNotMatch(result.surroundingAfter, /^[\u0300-\u036f\u3099\uFE0F\u200D]/u);
  assert.doesNotMatch(result.surroundingBefore, /[\uD800-\uDBFF]$/u);
  assert.doesNotMatch(result.surroundingAfter, /[\uD800-\uDBFF]$/u);
});

test('CRLF fallback never splits between CR and LF', () => {
  const content = `前${'あ'.repeat(20)}\r\n${'い'.repeat(20)}後`;
  const start = content.indexOf('\n') + 1;
  const source = input(content, start, start + 2);
  const result = buildInspectorTextStructure(source, { maxBefore: 1, maxAfter: 1 }, { analyze: () => { throw new Error('forced'); } });
  assertSourceInvariants(source, result);
  assert.notEqual(result.beforeRange.startOffset, content.indexOf('\n'));
  assert.notEqual(result.afterRange.endOffset, content.indexOf('\n'));
});

test('empty and whitespace-only Chapters are safe', () => {
  const empty = input('', 0, 0);
  const emptyResult = buildInspectorTextStructure(empty);
  assertSourceInvariants(empty, emptyResult);
  assert.equal(emptyResult.expansionMode, 'none');
  assert.equal(emptyResult.fallbackReason, null);

  const whitespace = input(' \n\n ', 1, 2);
  const whitespaceResult = buildInspectorTextStructure(whitespace);
  assertSourceInvariants(whitespace, whitespaceResult);
  assert.equal(whitespaceResult.expansionMode, 'character-fallback');
  assert.equal(whitespaceResult.fallbackReason, 'no_structural_node');
});

test('parser exception falls back once and records provenance', () => {
  let calls = 0;
  const content = '前の本文。対象。後の本文。';
  const source = input(content, 5, 8);
  const result = buildInspectorTextStructure(source, {}, { analyze: () => { calls += 1; throw new Error('forced'); } });
  assert.equal(calls, 1);
  assertSourceInvariants(source, result);
  assert.equal(result.parserVersion, 'unavailable');
  assert.equal(result.expansionMode, 'character-fallback');
  assert.equal(result.fallbackReason, 'parser_exception');
});

test('invalid ranges and limits are rejected without redefining Inspector 7000 rule', () => {
  const content = '本文';
  assert.throws(() => buildInspectorTextStructure(input(content, -1, 1)), RangeError);
  assert.throws(() => buildInspectorTextStructure({ content, requestedRange: { startOffset: 1, endOffset: 2 }, inspectedRange: { startOffset: 0, endOffset: 1 } }), RangeError);
  assert.throws(() => buildInspectorTextStructure(input(content, 0, 1), { maxBefore: -1 }), RangeError);
});
