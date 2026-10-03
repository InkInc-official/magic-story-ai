import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSymbolOccurrenceAnchor, buildSymbolOccurrenceBrowser, type SymbolDefinition, type SymbolOccurrenceOverride, type SymbolUsageRule,
} from './index.js';

const projectId = 'p'; const chapterId = 'c';
const definition = (values: Partial<SymbolDefinition> = {}): SymbolDefinition => ({ id: 'd', projectId, openSymbol: '「', closeSymbol: '」', label: 'かぎ括弧', active: true, order: 0, defaultUsageRuleId: null, ...values });
const rule = (values: Partial<SymbolUsageRule> = {}): SymbolUsageRule => ({ id: 'r', projectId, definitionId: 'd', label: '会話', description: '', semanticKind: 'dialogue', countsAsDialogue: true, countsAsNarration: null, countsAsInnerVoice: null, readerVisible: true, spokenAloud: true, speakerMode: 'contextual', fixedSpeakerId: null, priority: 0, active: true, provenance: 'author', ...values });
const browse = (content: string, values: Partial<Parameters<typeof buildSymbolOccurrenceBrowser>[0]> = {}) => buildSymbolOccurrenceBrowser({ projectId, chapterId, content, definitions: [], usageRules: [], overrides: [], ...values });

test('DB rowなしbuilt-inを未分類表示するだけで入力を変更しない', () => {
  const overrides: SymbolOccurrenceOverride[] = [];
  const result = browse('「本文」', { overrides });
  assert.equal(result.items[0].status, 'unresolved'); assert.equal(result.counts.unresolved, 1);
  assert.equal(result.parseCount, 1); assert.deepEqual(overrides, []);
});

test('default・override優先・nested・malformedを表示分類する', () => {
  const base = definition({ defaultUsageRuleId: 'r' }); const content = '「外『内』」';
  const inner = definition({ id: 'inner-d', openSymbol: '『', closeSymbol: '』', label: '二重', defaultUsageRuleId: 'inner-r' });
  const innerRule = rule({ id: 'inner-r', definitionId: 'inner-d', label: '引用', semanticKind: 'quotation' });
  const overrideRule = rule({ id: 'special', label: '特殊', semanticKind: 'special_voice' });
  const override = buildSymbolOccurrenceAnchor({ id: 'o', projectId, chapterId, content, definition: base, usageRuleId: 'special', status: 'confirmed', range: { startOffset: 0, endOffset: content.length } });
  const result = browse(content, { definitions: [base, inner], usageRules: [rule(), innerRule, overrideRule], overrides: [override] });
  assert.deepEqual(result.items.map(value => [value.depth, value.status, value.usageRule?.id]), [[0, 'confirmed_override', 'special'], [1, 'confirmed_default', 'inner-r']]);
  assert.equal(browse('「閉じない', { definitions: [base], usageRules: [rule()] }).items[0].status, 'invalid_structure');
});

test('前方編集を要再確認候補にするが自動確定しない', () => {
  const original = `${'前'.repeat(80)}「本文」後`; const startOffset = original.indexOf('「');
  const override = buildSymbolOccurrenceAnchor({ id: 'o', projectId, chapterId, content: original, definition: definition(), usageRuleId: 'r', status: 'confirmed', range: { startOffset, endOffset: startOffset + 4 } });
  const result = browse(`追加${original}`, { definitions: [definition()], usageRules: [rule()], overrides: [override] });
  assert.equal(result.items.find(value => value.override?.id === 'o')?.status, 'stale_override');
  assert.equal(result.items.find(value => value.override?.id === 'o')?.reanchorState, 'reanchorable');
  assert.ok(result.items.find(value => value.override?.id === 'o')?.suggestedRange);
});

test('Override解除後はdefaultへ戻り、inactive参照はsilent fallbackせず要再確認にする', () => {
  const content = '「本文」'; const base = definition({ defaultUsageRuleId: 'r' });
  const special = rule({ id: 'special', label: '特殊', semanticKind: 'special_voice' });
  const override = buildSymbolOccurrenceAnchor({ id: 'o', projectId, chapterId, content, definition: base, usageRuleId: 'special', status: 'confirmed', range: { startOffset: 0, endOffset: content.length } });
  assert.equal(browse(content, { definitions: [base], usageRules: [rule(), special], overrides: [override] }).items[0].status, 'confirmed_override');
  assert.equal(browse(content, { definitions: [base], usageRules: [rule(), special], overrides: [] }).items[0].status, 'confirmed_default');
  assert.equal(browse(content, { definitions: [base], usageRules: [rule(), { ...special, active: false }], overrides: [override] }).items[0].status, 'stale_override');
});

test('ambiguousと削除済みOverrideを孤立した要再確認項目として残す', () => {
  const unit = `${'A'.repeat(64)}「同じ」${'B'.repeat(64)}`; const startOffset = unit.indexOf('「');
  const ambiguous = buildSymbolOccurrenceAnchor({ id: 'ambiguous', projectId, chapterId, content: unit, definition: definition(), usageRuleId: 'r', status: 'confirmed', range: { startOffset, endOffset: startOffset + 4 } });
  const removed = buildSymbolOccurrenceAnchor({ id: 'removed', projectId, chapterId, content: '前「消えた」後', definition: definition(), usageRuleId: 'r', status: 'confirmed', range: { startOffset: 1, endOffset: 6 } });
  const result = browse(`${unit}区切り${unit}`, { definitions: [definition()], usageRules: [rule()], overrides: [ambiguous, removed] });
  assert.equal(result.items.find(value => value.override?.id === 'ambiguous')?.reanchorState, 'ambiguous');
  assert.equal(result.items.find(value => value.override?.id === 'removed')?.reanchorState, 'not_found');
  assert.equal(result.items.find(value => value.override?.id === 'removed')?.orphanedOverride, true);
});

test('inactive built-in semanticsは構造を残しinactive customは構造を消す', () => {
  assert.equal(browse('「本文」', { definitions: [definition({ active: false })] }).items[0].status, 'unresolved');
  const custom = definition({ id: 'custom', openSymbol: '<<', closeSymbol: '>>', active: false });
  assert.equal(browse('<<本文>>', { definitions: [custom] }).items.length, 0);
  assert.equal(browse('<<本文>>', { definitions: [{ ...custom, active: true }] }).items[0].status, 'unresolved');
});

test('inactive Definitionのexact Overrideも消さず要再確認にする', () => {
  const content = '<<本文>>'; const custom = definition({ id: 'custom', openSymbol: '<<', closeSymbol: '>>', active: false });
  const customRule = rule({ id: 'custom-rule', definitionId: 'custom' });
  const override = buildSymbolOccurrenceAnchor({ id: 'inactive', projectId, chapterId, content, definition: custom,
    usageRuleId: customRule.id, status: 'confirmed', range: { startOffset: 0, endOffset: content.length } });
  const item = browse(content, { definitions: [custom], usageRules: [customRule], overrides: [override] }).items[0];
  assert.equal(item.status, 'stale_override'); assert.equal(item.orphanedOverride, true); assert.equal(item.reanchorState, null);
});

test('raw Unicode/CRLF contextをnormalizeせず書記素境界を維持する', () => {
  const prefix = `${'👨‍👩‍👧‍👦'.repeat(8)}か\u3099\r\n`; const content = `${prefix}「本文」後`;
  const item = browse(content).items[0];
  assert.equal(item.rawText, '「本文」'); assert.ok(item.contextBefore.endsWith('\r\n'));
  assert.doesNotMatch(item.contextBefore, /^[\u0300-\u036f\u3099\uFE0F\u200D]/u);
});
