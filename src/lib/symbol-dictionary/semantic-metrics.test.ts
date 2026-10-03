import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSymbolOccurrenceAnchor } from './occurrence-anchor.js';
import { resolveSymbolOccurrences } from './resolver.js';
import { computeSymbolSemanticMetrics, semanticMetricsUseOlderSavedContent } from './semantic-metrics.js';
import type { SymbolDefinition, SymbolOccurrenceOverride, SymbolUsageRule } from './types.js';

const projectId = 'p'; const chapterId = 'c';
const definition = (values: Partial<SymbolDefinition> = {}): SymbolDefinition => ({ id: 'd', projectId, openSymbol: '「', closeSymbol: '」', label: '会話括弧', active: true, order: 0, defaultUsageRuleId: 'r', ...values });
const rule = (values: Partial<SymbolUsageRule> = {}): SymbolUsageRule => ({ id: 'r', projectId, definitionId: 'd', label: '会話', description: '', semanticKind: 'dialogue', countsAsDialogue: true, countsAsNarration: null, countsAsInnerVoice: null, readerVisible: null, spokenAloud: null, speakerMode: 'contextual', fixedSpeakerId: null, priority: 0, active: true, provenance: 'author', ...values });

function metrics(content: string, values: { definitions?: SymbolDefinition[]; usageRules?: SymbolUsageRule[]; overrides?: SymbolOccurrenceOverride[] } = {}) {
  const resolved = resolveSymbolOccurrences({ projectId, chapterId, content, definitions: values.definitions || [], usageRules: values.usageRules || [], overrides: values.overrides || [] });
  return computeSymbolSemanticMetrics({ content, analysis: resolved.analysis, occurrences: resolved.occurrences });
}

test('body denominatorとmarker除外をgraphemeで計算する', () => {
  const content = `${'A'.repeat(78)}「${'B'.repeat(20)}」`;
  const value = metrics(content, { definitions: [definition()], usageRules: [rule()] });
  assert.equal(value.bodyGraphemes, 100);
  assert.equal(value.confirmedSemanticGraphemes, 20);
  assert.equal(value.dialogueGraphemes, 20);
  assert.equal(value.dialoguePercent, 20);
});

test('confirmed meaningとnullable/false dimensionを分離する', () => {
  const content = '「本文」';
  const nullable = metrics(content, { definitions: [definition()], usageRules: [rule({ countsAsDialogue: null })] });
  assert.equal(nullable.confirmedSemanticGraphemes, 2); assert.equal(nullable.dialogueGraphemes, 0);
  const explicitFalse = metrics(content, { definitions: [definition()], usageRules: [rule({ countsAsDialogue: false, countsAsNarration: null })] });
  assert.equal(explicitFalse.dialogueGraphemes, 0); assert.equal(explicitFalse.narrationGraphemes, 0);
  const visibility = metrics(content, { definitions: [definition()], usageRules: [rule({ readerVisible: false, spokenAloud: true })] });
  assert.equal(visibility.readerVisibleFalseGraphemes, 2); assert.equal(visibility.readerVisibleTrueGraphemes, 0);
  assert.equal(visibility.spokenAloudTrueGraphemes, 2); assert.equal(visibility.spokenAloudFalseGraphemes, 0);
});

test('multiple trueを独立dimensionへ数え、100% partitionへnormalizeしない', () => {
  const value = metrics('「心」', { definitions: [definition()], usageRules: [rule({ countsAsDialogue: true, countsAsInnerVoice: true })] });
  assert.equal(value.dialogueGraphemes, 1); assert.equal(value.innerVoiceGraphemes, 1);
  assert.ok(Math.abs((value.dialoguePercent || 0) - 100 / 3) < 1e-10);
  assert.ok(Math.abs((value.innerVoicePercent || 0) - 100 / 3) < 1e-10);
});

test('nested same dimensionとconfirmed coverageをunionしcross-dimensionは独立する', () => {
  const outer = definition();
  const inner = definition({ id: 'inner', openSymbol: '『', closeSymbol: '』', label: '内心', defaultUsageRuleId: 'inner-rule' });
  const innerRule = rule({ id: 'inner-rule', definitionId: 'inner', label: '内心', countsAsDialogue: true, countsAsInnerVoice: true });
  const value = metrics('「外『内』外」', { definitions: [outer, inner], usageRules: [rule(), innerRule] });
  assert.equal(value.confirmedOccurrenceCount, 2);
  assert.equal(value.confirmedSemanticGraphemes, 5);
  assert.equal(value.dialogueGraphemes, 5);
  assert.equal(value.innerVoiceGraphemes, 1);
});

test('Definitionなし・defaultなし・inactive・malformedはconfirmed coverageへ入れない', () => {
  const unknown = metrics('「未定」');
  assert.equal(unknown.confirmedSemanticGraphemes, 0); assert.equal(unknown.unresolvedSemanticGraphemes, 2);
  const noDefault = definition({ defaultUsageRuleId: null });
  assert.equal(metrics('「単一」', { definitions: [noDefault], usageRules: [rule()] }).confirmedSemanticGraphemes, 0);
  assert.equal(metrics('「複数」', { definitions: [noDefault], usageRules: [rule(), rule({ id: 'r2' })] }).confirmedSemanticGraphemes, 0);
  assert.equal(metrics('「停止」', { definitions: [definition()], usageRules: [rule({ active: false })] }).confirmedSemanticGraphemes, 0);
  const malformed = metrics('「未閉鎖', { definitions: [definition()], usageRules: [rule()] });
  assert.equal(malformed.confirmedSemanticGraphemes, 0); assert.equal(malformed.malformedOccurrenceCount, 1);
});

test('convention-onlyをauthor-confirmed coverageへ含めない', () => {
  const content = '「慣習」';
  const resolved = resolveSymbolOccurrences({ projectId, chapterId, content, definitions: [], usageRules: [], overrides: [], conventionalSuggestions: [{ openSymbol: '「', closeSymbol: '」', label: '一般的な会話記号' }] });
  const value = computeSymbolSemanticMetrics({ content, analysis: resolved.analysis, occurrences: resolved.occurrences });
  assert.equal(resolved.occurrences[0].status, 'convention_only');
  assert.equal(value.confirmedSemanticGraphemes, 0); assert.equal(value.unresolvedSemanticGraphemes, 2);
});

test('exact OverrideはそのUsageでcountしstale/reanchorableはconfirmedにしない', () => {
  const content = '「内心」'; const base = definition();
  const inner = rule({ id: 'inner', label: '内心', countsAsDialogue: false, countsAsInnerVoice: true });
  const exact = buildSymbolOccurrenceAnchor({ id: 'o', projectId, chapterId, content, definition: base, usageRuleId: inner.id, status: 'confirmed', range: { startOffset: 0, endOffset: content.length } });
  const exactValue = metrics(content, { definitions: [base], usageRules: [rule(), inner], overrides: [exact] });
  assert.equal(exactValue.dialogueGraphemes, 0); assert.equal(exactValue.innerVoiceGraphemes, 2);
  const original = `${'前'.repeat(80)}「内心」`; const start = original.indexOf('「');
  const stale = buildSymbolOccurrenceAnchor({ id: 's', projectId, chapterId, content: original, definition: base, usageRuleId: inner.id, status: 'confirmed', range: { startOffset: start, endOffset: original.length } });
  const moved = metrics(`追加${original}`, { definitions: [base], usageRules: [rule(), inner], overrides: [stale] });
  assert.equal(moved.confirmedSemanticGraphemes, 0); assert.equal(moved.staleOccurrenceCount, 1);
});

test('plain textをnarrationへ分類せず、custom multigraph・emoji・combining・CRLFを正確に数える', () => {
  const plain = metrics('これは地の文。'); assert.equal(plain.narrationGraphemes, 0);
  const custom = definition({ id: 'custom', openSymbol: '<<', closeSymbol: '>>', defaultUsageRuleId: 'custom-rule' });
  const customRule = rule({ id: 'custom-rule', definitionId: 'custom' });
  assert.equal(metrics('<<本文>>', { definitions: [custom], usageRules: [customRule] }).dialogueGraphemes, 2);
  assert.equal(metrics('<<👨‍👩‍👧‍👦>>', { definitions: [custom], usageRules: [customRule] }).dialogueGraphemes, 1);
  assert.equal(metrics('<<か\u3099>>', { definitions: [custom], usageRules: [customRule] }).dialogueGraphemes, 1);
  const crlf = metrics('<<A\r\nB>>', { definitions: [custom], usageRules: [customRule] });
  assert.equal(crlf.dialogueGraphemes, 2); assert.equal(crlf.bodyGraphemes, 6);
});

test('saved/dirty policyは本文のraw source差だけを明示する', () => {
  assert.equal(semanticMetricsUseOlderSavedContent('保存本文', '保存本文'), false);
  assert.equal(semanticMetricsUseOlderSavedContent('é', 'e\u0301'), true);
  assert.equal(semanticMetricsUseOlderSavedContent('保存本文', '未保存本文'), true);
});
