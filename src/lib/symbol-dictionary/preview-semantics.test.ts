import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSymbolOccurrenceAnchor } from './occurrence-anchor.js';
import { buildPreviewSymbolSemantics, resolvePreviewDefaultSemantics, suppressPreviewDefaultsForStaleDefinitions } from './preview-semantics.js';
import { resolveSymbolOccurrences } from './resolver.js';
import type { SymbolDefinition, SymbolOccurrenceOverride, SymbolUsageRule } from './types.js';

const projectId = 'p'; const chapterId = 'c';
const definition = (values: Partial<SymbolDefinition> = {}): SymbolDefinition => ({ id: 'd', projectId, openSymbol: '《', closeSymbol: '》', label: '表示', active: true, order: 0, defaultUsageRuleId: 'r', ...values });
const rule = (values: Partial<SymbolUsageRule> = {}): SymbolUsageRule => ({ id: 'r', projectId, definitionId: 'd', label: '表示', description: '', semanticKind: 'displayed_text', countsAsDialogue: false, countsAsNarration: null, countsAsInnerVoice: false, readerVisible: true, spokenAloud: false, speakerMode: 'none', fixedSpeakerId: null, priority: 0, active: true, provenance: 'author', ...values });

function resolve(content: string, values: { definitions?: SymbolDefinition[]; usageRules?: SymbolUsageRule[]; overrides?: SymbolOccurrenceOverride[] } = {}) {
  return resolveSymbolOccurrences({ projectId, chapterId, content, definitions: values.definitions || [], usageRules: values.usageRules || [], overrides: values.overrides || [] });
}

test('confirmed dimensionsだけでvisual styleを決め、innerVoiceをdialogueより優先する', () => {
  for (const [usage, expected] of [
    [rule({ countsAsDialogue: true, countsAsInnerVoice: false }), 'dialogue'],
    [rule({ countsAsDialogue: false, countsAsInnerVoice: true }), 'inner_voice'],
    [rule({ countsAsDialogue: true, countsAsInnerVoice: true }), 'inner_voice'],
    [rule({ countsAsDialogue: null, countsAsInnerVoice: null }), 'normal'],
    [rule({ countsAsDialogue: false, countsAsInnerVoice: false }), 'normal'],
  ] as const) {
    const occurrence = resolve('《表示》', { definitions: [definition()], usageRules: [usage] }).occurrences;
    assert.equal(buildPreviewSymbolSemantics(occurrence)[0].style, expected);
  }
});

test('semanticKindやnarrationだけから装飾を発明しない', () => {
  const usage = rule({ semanticKind: 'special_voice', countsAsDialogue: null, countsAsNarration: true, countsAsInnerVoice: null });
  const preview = buildPreviewSymbolSemantics(resolve('《声》', { definitions: [definition()], usageRules: [usage] }).occurrences);
  assert.equal(preview[0].style, 'normal');
});

test('exact Overrideはdefaultより優先し、stale Overrideはnormal suppressionになる', () => {
  const content = `${'前'.repeat(64)}《本文》`;
  const base = definition({ defaultUsageRuleId: 'r' });
  const inner = rule({ id: 'inner', countsAsDialogue: false, countsAsInnerVoice: true });
  const startOffset = content.indexOf('《');
  const override = buildSymbolOccurrenceAnchor({ id: 'o', projectId, chapterId, content, definition: base, usageRuleId: inner.id, status: 'confirmed', range: { startOffset, endOffset: content.length } });
  const exact = buildPreviewSymbolSemantics(resolve(content, { definitions: [base], usageRules: [rule(), inner], overrides: [override] }).occurrences);
  assert.deepEqual([exact[0].source, exact[0].style], ['override', 'inner_voice']);
  const stale = buildPreviewSymbolSemantics(resolve(`追加${content}`, { definitions: [base], usageRules: [rule(), inner], overrides: [override] }).occurrences);
  assert.deepEqual([stale[0].source, stale[0].style], ['suppression', 'normal']);
});

test('no default・inactive・unrelated pairはlegacyを抑止せず、malformed author pairだけ抑止する', () => {
  assert.deepEqual(buildPreviewSymbolSemantics(resolve('《未定》', { definitions: [definition({ defaultUsageRuleId: null })], usageRules: [rule()] }).occurrences), []);
  assert.deepEqual(buildPreviewSymbolSemantics(resolve('《停止》', { definitions: [definition({ active: false })], usageRules: [rule()] }).occurrences), []);
  assert.deepEqual(buildPreviewSymbolSemantics(resolve('「会話」', { definitions: [definition()], usageRules: [rule()] }).occurrences), []);
  const malformed = buildPreviewSymbolSemantics(resolve('《未閉鎖', { definitions: [definition()], usageRules: [rule()] }).occurrences);
  assert.deepEqual([malformed[0].source, malformed[0].style], ['suppression', 'normal']);
});

test('dirty policyはsaved Overrideを使わずProject defaultだけを現在本文へ解決する', () => {
  const result = resolvePreviewDefaultSemantics({ projectId, chapterId, content: '前《現在》後', defaults: { definitions: [definition()], usageRules: [rule({ countsAsDialogue: true })] } });
  assert.equal(result.length, 1); assert.equal(result[0].source, 'default'); assert.equal(result[0].style, 'dialogue');
});

test('位置を対応付けできないstale Overrideは同じDefinitionのdefault fallbackを抑止する', () => {
  const current = buildPreviewSymbolSemantics(resolve('《一》と《二》', { definitions: [definition()], usageRules: [rule({ countsAsDialogue: true })] }).occurrences);
  const suppressed = suppressPreviewDefaultsForStaleDefinitions(current, new Set(['d']));
  assert.ok(suppressed.every(value => value.style === 'normal' && value.source === 'suppression'));
});
