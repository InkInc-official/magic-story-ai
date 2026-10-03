import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILTIN_SYMBOL_PAIRS } from './japanese-text/index.js';
import { booleanToTriState, buildSymbolUsageMutationPayload, isLatestSymbolDictionaryRequest, mergeSymbolDictionaryDisplayItems, triStateToBoolean } from './symbol-dictionary-ui.js';

test('DB 0件でもbuilt-in 10件を意味未設定のまま表示モデルへ含める', () => {
  const items = mergeSymbolDictionaryDisplayItems(BUILTIN_SYMBOL_PAIRS, []);
  assert.equal(items.length, 10);
  assert.ok(items.every(value => value.builtIn && value.definition === null));
});

test('built-in semantic Definitionを重複表示せずcustomを追加する', () => {
  const values = [
    { id: 'builtin-semantic', projectId: 'p', openSymbol: '「', closeSymbol: '」', label: 'かぎ括弧', active: true, order: 0, defaultUsageRuleId: null },
    { id: 'custom', projectId: 'p', openSymbol: '<<', closeSymbol: '>>', label: '特殊', active: false, order: 1, defaultUsageRuleId: null },
  ];
  const items = mergeSymbolDictionaryDisplayItems(BUILTIN_SYMBOL_PAIRS, values);
  assert.equal(items.length, 11);
  assert.equal(items.filter(value => value.openSymbol === '「').length, 1);
  assert.equal(items.find(value => value.openSymbol === '「')?.definition?.id, 'builtin-semantic');
  assert.equal(items.at(-1)?.definition?.active, false);
});

test('nullable booleanを未指定・はい・いいえで往復する', () => {
  assert.deepEqual([null, true, false].map(booleanToTriState), ['unspecified', 'yes', 'no']);
  assert.deepEqual(['unspecified', 'yes', 'no'].map(value => triStateToBoolean(value as 'unspecified' | 'yes' | 'no')), [null, true, false]);
});

test('machine dimensionsは非排他的で、話者mode変更時にfixed IDを送らない', () => {
  const payload = buildSymbolUsageMutationPayload('p', 'd', { id: '', label: '特殊', description: '', semanticKind: 'special_voice',
    countsAsDialogue: true, countsAsNarration: null, countsAsInnerVoice: true, readerVisible: true, spokenAloud: false,
    speakerMode: 'contextual', fixedSpeakerId: 'old-character', active: true });
  assert.equal(payload.countsAsDialogue, true); assert.equal(payload.countsAsInnerVoice, true);
  assert.equal(payload.countsAsNarration, null); assert.equal(payload.fixedSpeakerId, null); assert.equal(payload.provenance, 'author');
});

test('Project切替後の古いrequest tokenを拒否する', () => {
  assert.equal(isLatestSymbolDictionaryRequest(4, 5), false);
  assert.equal(isLatestSymbolDictionaryRequest(5, 5), true);
});
