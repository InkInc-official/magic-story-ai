import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildConfirmedOccurrencePersistence, hashRawSymbolSource, SymbolOccurrenceSelectionError,
  type SymbolDefinition, type SymbolUsageRule,
} from './index.js';

const projectId = 'project'; const chapterId = 'chapter';
const definition = (values: Partial<SymbolDefinition> = {}): SymbolDefinition => ({
  id: 'definition', projectId, openSymbol: '「', closeSymbol: '」', label: '会話記号', active: true,
  order: 0, defaultUsageRuleId: null, ...values,
});
const usageRule = (values: Partial<SymbolUsageRule> = {}): SymbolUsageRule => ({
  id: 'rule', projectId, definitionId: 'definition', label: '会話', description: '', semanticKind: 'dialogue',
  countsAsDialogue: true, countsAsNarration: null, countsAsInnerVoice: false, readerVisible: true,
  spokenAloud: true, speakerMode: 'contextual', fixedSpeakerId: null, priority: 0, active: true,
  provenance: 'author', ...values,
});

test('保存済み本文のbuilt-in closed Regionからserver anchor/hashを生成する', () => {
  const content = '前文\r\n「こんにちは」\r\n後文'; const startOffset = content.indexOf('「');
  const result = buildConfirmedOccurrencePersistence({ projectId, chapterId, content, definitions: [definition()],
    definition: definition(), usageRule: usageRule(), startOffset, endOffset: startOffset + '「こんにちは」'.length });
  assert.equal(result.anchor.exactExcerpt, '「こんにちは」');
  assert.equal(result.anchor.contentHash, hashRawSymbolSource(content));
  assert.ok(result.anchor.anchorBefore.endsWith('\r\n'));
  assert.ok(result.anchor.anchorFingerprint.length > 0);
  assert.equal(result.parseCount, 1);
});

test('custom pairをclosed Regionとして検証する', () => {
  const custom = definition({ openSymbol: '<<', closeSymbol: '>>' }); const content = '前<<hello>>後'; const startOffset = content.indexOf('<<');
  const result = buildConfirmedOccurrencePersistence({ projectId, chapterId, content, definitions: [custom], definition: custom,
    usageRule: usageRule(), startOffset, endOffset: startOffset + '<<hello>>'.length });
  assert.equal(result.anchor.exactExcerpt, '<<hello>>');
});

test('wrong rangeとmalformed Regionを拒否する', () => {
  const valid = { projectId, chapterId, definitions: [definition()], definition: definition(), usageRule: usageRule() };
  assert.throws(() => buildConfirmedOccurrencePersistence({ ...valid, content: '「本文」', startOffset: 1, endOffset: 3 }), SymbolOccurrenceSelectionError);
  assert.throws(() => buildConfirmedOccurrencePersistence({ ...valid, content: '「閉じない', startOffset: 0, endOffset: 5 }), SymbolOccurrenceSelectionError);
});

test('emoji/ZWJ/combiningをanchor境界で壊さずraw sourceをnormalizeしない', () => {
  const prefix = `${'👨‍👩‍👧‍👦'.repeat(8)}${'か\u3099'.repeat(8)}`; const content = `${prefix}「本文」後`; const startOffset = content.indexOf('「');
  const result = buildConfirmedOccurrencePersistence({ projectId, chapterId, content, definitions: [definition()],
    definition: definition(), usageRule: usageRule(), startOffset, endOffset: startOffset + '「本文」'.length });
  assert.equal(result.anchor.exactExcerpt, content.slice(startOffset, startOffset + '「本文」'.length));
  assert.doesNotMatch(result.anchor.anchorBefore, /^[\u0300-\u036f\u3099\uFE0F\u200D]/u);
  assert.doesNotMatch(result.anchor.anchorBefore, /[\uD800-\uDBFF]$/u);
  assert.ok(result.anchor.anchorBefore.includes('か\u3099'));
});
