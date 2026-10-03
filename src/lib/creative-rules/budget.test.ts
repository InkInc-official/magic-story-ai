import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectCreativeRuleEntriesWithinBudget } from './budget.js';
import { selectCreativeRulesForSurface } from './resolver.js';
import { serializeCreativeRuleEntry, serializeCreativeRuleEntries } from './serializer.js';
import type { CreativeRulePromptEntry } from './types.js';
import type { BuiltinCreativeRuleAdoption } from './types.js';

const entry = (id: string, mode: CreativeRulePromptEntry['mode'], priority = 0, kind: CreativeRulePromptEntry['kind'] = 'builtin'): CreativeRulePromptEntry => ({
  stableId: id, kind, ...(kind === 'builtin' && { techniqueKey: 'show_dont_tell' }), title: id,
  category: 'description', mode, guidance: `GUIDANCE-${id}`, priority, overridable: true,
  source: 'author', semanticContractVersion: 1,
});

test('serializerはmode別の位置づけ、作者調整、custom原文を決定的に保持する', () => {
  const reference = { ...entry('参考', 'reference'), authorAdjustment: '直接説明も使う', notes: '速度優先' };
  assert.match(serializeCreativeRuleEntry(reference), /適用可能な場面で参考/);
  assert.match(serializeCreativeRuleEntry(reference), /作者調整：直接説明も使う/);
  assert.match(serializeCreativeRuleEntry(entry('必須', 'required')), /この作品で作者が採用/);
  assert.match(serializeCreativeRuleEntry(entry('禁止', 'forbidden')), /作者が避ける/);
  const custom = entry('独自', 'required', 0, 'custom'); custom.guidance = '作者が入力した原文をそのまま保持';
  assert.match(serializeCreativeRuleEntry(custom), /作者が入力した原文をそのまま保持/);
  assert.equal(serializeCreativeRuleEntries([reference, custom]), `${serializeCreativeRuleEntry(reference)}\n\n${serializeCreativeRuleEntry(custom)}`);
});

test('entryを途中切断せずrequired/forbiddenをreferenceより優先する', () => {
  const required = entry('required', 'required'); const forbidden = entry('forbidden', 'forbidden'); const reference = entry('reference', 'reference', 100);
  const exact = serializeCreativeRuleEntry(required).length + 2 + serializeCreativeRuleEntry(forbidden).length;
  const result = selectCreativeRuleEntriesWithinBudget([reference, forbidden, required], exact);
  assert.deepEqual(result.selected.map(value => value.stableId).sort(), ['forbidden', 'required']);
  assert.deepEqual(result.omitted, ['reference']); assert.equal(result.characterCount, exact);
  assert.equal(result.text, serializeCreativeRuleEntries(result.selected));
});

test('exact boundaryとone character overflowを区別する', () => {
  const value = entry('required', 'required'); const length = serializeCreativeRuleEntry(value).length;
  assert.deepEqual(selectCreativeRuleEntriesWithinBudget([value], length).omitted, []);
  const overflow = selectCreativeRuleEntriesWithinBudget([value], length - 1);
  assert.deepEqual(overflow.omitted, ['required']); assert.equal(overflow.requiredOverflow, true); assert.equal(overflow.text, '');
});

test('referenceはpriority順でcustom/builtinを同格に扱いomittedを決定的に返す', () => {
  const highCustom = entry('custom-high', 'reference', 10, 'custom');
  const lowBuiltin = entry('builtin-low', 'reference', 0, 'builtin');
  const maximum = serializeCreativeRuleEntry(highCustom).length;
  const first = selectCreativeRuleEntriesWithinBudget([lowBuiltin, highCustom], maximum);
  const second = selectCreativeRuleEntriesWithinBudget([highCustom, lowBuiltin], maximum);
  assert.deepEqual(first.selected.map(value => value.stableId), ['custom-high']);
  assert.deepEqual(first.omitted, ['builtin-low']); assert.deepEqual(second.omitted, first.omitted);
});

test('off suppressionはprose budgetの外にありresolver結果で維持されるcontract', () => {
  const offRule: BuiltinCreativeRuleAdoption = {
    id: 'off-rule', kind: 'builtin', techniqueKey: 'show_dont_tell', mode: 'off', priority: 0,
    overridable: true, source: 'author', active: true,
  };
  const resolved = selectCreativeRulesForSurface([offRule], 'writer');
  const budgeted = selectCreativeRuleEntriesWithinBudget(resolved.activeGuidanceRules, 0);
  assert.deepEqual(resolved.suppressedTechniqueKeys, ['show_dont_tell']);
  assert.equal(budgeted.requiredOverflow, false);
  assert.deepEqual(budgeted.omitted, []);
});
