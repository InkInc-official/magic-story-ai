import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeJapaneseTextSource } from './japanese-text/index.js';
import { buildInspectorSymbolSemantics, inspectorSymbolContextEntry, type InspectorSymbolSources } from './inspector-symbol-semantics.js';
import { buildRuntimeSymbolPairDefinitions } from './symbol-dictionary/runtime-definitions.js';
import { buildSymbolOccurrenceAnchor } from './symbol-dictionary/occurrence-anchor.js';

const definition = { id: 'def', projectId: 'p', openSymbol: '『', closeSymbol: '』', label: '特殊な声', active: true, order: 99, defaultUsageRuleId: 'god' };
const usage = {
  id: 'god', projectId: 'p', definitionId: 'def', label: '神の声', description: '主人公だけに聞こえる声', semanticKind: 'special_voice' as const,
  countsAsDialogue: false, countsAsNarration: true, countsAsInnerVoice: true, readerVisible: null, spokenAloud: false,
  speakerMode: 'fixed_character' as const, fixedSpeakerId: 'c1', priority: 100, active: true, provenance: 'author' as const,
};

function resolve(content: string, symbols: InspectorSymbolSources, range = { startOffset: 0, endOffset: content.length }) {
  const analysis = analyzeJapaneseTextSource(content, { pairedSymbols: buildRuntimeSymbolPairDefinitions(symbols.definitions) });
  return buildInspectorSymbolSemantics({ projectId: 'p', chapterId: 'ch', content, targetRange: range,
    beforeRange: { startOffset: 0, endOffset: range.startOffset }, afterRange: { startOffset: range.endOffset, endOffset: content.length },
    regions: analysis.symbolRegions, symbols, characterNames: new Map([['c1', '天照']]) });
}

test('author defaultの全machine dimensionsとfixed speaker名を保持しnullとfalseを区別する', () => {
  const [value] = resolve('彼は『逃げろ』と叫んだ。', { definitions: [definition], usageRules: [usage], overrides: [] });
  assert.equal(value.resolution, 'confirmed_default');
  assert.equal(value.selectedUsage?.fixedSpeakerName, '天照');
  assert.equal(value.selectedUsage?.readerVisible, null);
  assert.equal(value.selectedUsage?.spokenAloud, false);
  assert.equal(value.selectedUsage?.countsAsNarration, true);
  assert.equal(value.selectedUsage?.countsAsInnerVoice, true);
  const text = inspectorSymbolContextEntry(value).full;
  assert.match(text, /readerVisible：未指定/u);
  assert.match(text, /spokenAloud：false/u);
});

test('Definitionなしとdefaultなしをauthor-confirmed意味へ格上げしない', () => {
  assert.equal(resolve('「こんにちは」', { definitions: [], usageRules: [], overrides: [] })[0].resolution, 'meaning_unset');
  const noDefault = { ...definition, defaultUsageRuleId: null };
  const [single] = resolve('『一つ』', { definitions: [noDefault], usageRules: [usage], overrides: [] });
  assert.equal(single.resolution, 'no_default');
  const second = { ...usage, id: 'other', label: '引用', priority: 50 };
  const [multiple] = resolve('『二つ』', { definitions: [noDefault], usageRules: [usage, second], overrides: [] });
  assert.equal(multiple.resolution, 'no_default');
  assert.deepEqual(multiple.activeUsages.map(value => value.id), ['god', 'other']);
});

test('exact OverrideはそのOccurrenceだけでdefaultを上書きする', () => {
  const content = '『既定』と『電話』';
  const phone = { ...usage, id: 'phone', label: '電話越し', speakerMode: 'contextual' as const, fixedSpeakerId: null };
  const startOffset = content.lastIndexOf('『');
  const override = buildSymbolOccurrenceAnchor({ id: 'ov', projectId: 'p', chapterId: 'ch', content, definition, usageRuleId: 'phone', status: 'confirmed', range: { startOffset, endOffset: content.length } });
  const values = resolve(content, { definitions: [definition], usageRules: [usage, phone], overrides: [override] });
  assert.deepEqual(values.map(value => value.resolution), ['confirmed_default', 'confirmed_override']);
  assert.equal(values[1].selectedUsage?.id, 'phone');
  assert.match(inspectorSymbolContextEntry(values[1]).full, /ほかの箇所へ一般化しない/u);
});

test('reanchorable・removed・inactive参照をconfirmed/default fallbackにしない', () => {
  const original = `${'A'.repeat(100)}『声』`;
  const start = original.indexOf('『');
  const base = buildSymbolOccurrenceAnchor({ id: 'ov', projectId: 'p', chapterId: 'ch', content: original, definition, usageRuleId: 'god', status: 'confirmed', range: { startOffset: start, endOffset: original.length } });
  const moved = `Z${original}`;
  assert.equal(resolve(moved, { definitions: [definition], usageRules: [usage], overrides: [base] })[0].resolution, 'override_reanchorable');
  const removed = resolve(`${'A'.repeat(100)}『別』`, { definitions: [definition], usageRules: [usage], overrides: [base] })[0];
  assert.equal(removed.resolution, 'override_removed');
  const stale = resolve(original, { definitions: [definition], usageRules: [{ ...usage, active: false }], overrides: [base] })[0];
  assert.equal(stale.resolution, 'inactive_usage_reference');
  const inactiveDefault = resolve('『声』', { definitions: [definition], usageRules: [{ ...usage, active: false }], overrides: [] })[0];
  assert.equal(inactiveDefault.resolution, 'inactive_usage_reference');
});

test('ambiguous Overrideをconfirmed/default fallbackにしない', () => {
  const block = `${'A'.repeat(64)}『声』${'B'.repeat(64)}`;
  const start = block.indexOf('『');
  const override = buildSymbolOccurrenceAnchor({ id: 'ov', projectId: 'p', chapterId: 'ch', content: block, definition, usageRuleId: 'god', status: 'confirmed', range: { startOffset: start, endOffset: start + 3 } });
  const current = `${block}区切り${block}`;
  const values = resolve(current, { definitions: [definition], usageRules: [usage], overrides: [override] });
  assert.equal(values.find(value => value.overrideId === 'ov')?.resolution, 'override_ambiguous');
});

test('malformedおよびnested outer/innerを独立Occurrenceとして保持する', () => {
  assert.equal(resolve('『閉じない', { definitions: [definition], usageRules: [usage], overrides: [] })[0].resolution, 'malformed');
  const values = resolve('『外「内」外』', { definitions: [definition], usageRules: [usage], overrides: [] });
  assert.equal(values.length, 2);
  assert.deepEqual(values.map(value => value.depth), [0, 1]);
  assert.equal(values[1].resolution, 'meaning_unset');
});

test('対象・構造的前後外のOccurrenceを投入しない', () => {
  const content = '『前』。対象。『後』';
  const start = content.indexOf('対象');
  const analysis = analyzeJapaneseTextSource(content, { pairedSymbols: buildRuntimeSymbolPairDefinitions([definition]) });
  const values = buildInspectorSymbolSemantics({ projectId: 'p', chapterId: 'ch', content,
    targetRange: { startOffset: start, endOffset: start + 2 }, beforeRange: { startOffset: start, endOffset: start }, afterRange: { startOffset: start + 2, endOffset: start + 2 },
    regions: analysis.symbolRegions, symbols: { definitions: [definition], usageRules: [usage], overrides: [] }, characterNames: new Map() });
  assert.deepEqual(values, []);
});
