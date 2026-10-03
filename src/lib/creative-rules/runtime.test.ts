import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRuntimeCreativeRuleSet } from './runtime.js';

const builtin = (values: Partial<Parameters<typeof buildRuntimeCreativeRuleSet>[0][number]> = {}) => ({
  id: 'b1', techniqueKey: 'sentence_length_variation', mode: 'reference', priority: 0, overridable: true,
  authorAdjustment: '', notes: '', source: 'author', active: true, catalogContractVersion: 1, ...values,
});

test('currentだけをruntimeへ渡しoutdated/unknownを現在Catalogの意味で再解釈しない', () => {
  const result = buildRuntimeCreativeRuleSet([
    builtin(), builtin({ id: 'old', catalogContractVersion: 0 }), builtin({ id: 'unknown', techniqueKey: 'future-technique' }),
  ], []);
  assert.deepEqual(result.rules.map(rule => rule.id), ['b1']);
  assert.deepEqual(result.excluded, [{ id: 'old', reason: 'outdated' }, { id: 'unknown', reason: 'unknown' }]);
});

test('customとUnicode原文、active=falseをruntime DTOへ意味変更せず保持する', () => {
  const instruction = '改行\r\n結合文字e\u0301・絵文字😀・「句読点」';
  const result = buildRuntimeCreativeRuleSet([builtin({ active: false, mode: 'off' })], [{
    id: 'c1', title: '独自', instruction, category: 'style', mode: 'required', priority: 3,
    overridable: false, notes: '補足\r\n行', source: 'author', active: true,
  }]);
  assert.equal(result.rules.length, 2);
  assert.equal(result.rules[0].active, false);
  assert.equal(result.rules[1].kind === 'custom' && result.rules[1].instruction, instruction);
});
