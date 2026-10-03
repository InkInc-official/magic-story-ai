import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CREATIVE_TECHNIQUE_CATALOG } from './catalog.js';
import { selectCreativeRulesForSurface } from './resolver.js';
import { validateProjectCreativeRule } from './validation.js';
import type { BuiltinCreativeRuleAdoption, CustomCreativeRule, ProjectCreativeRule } from './types.js';

const builtin = (values: Partial<BuiltinCreativeRuleAdoption> = {}): BuiltinCreativeRuleAdoption => ({
  id: 'builtin', kind: 'builtin', techniqueKey: 'show_dont_tell', mode: 'reference', priority: 0,
  overridable: true, source: 'author', active: true, notes: null, authorAdjustment: null, ...values,
});
const custom = (values: Partial<CustomCreativeRule> = {}): CustomCreativeRule => ({
  id: 'custom', kind: 'custom', title: '沈黙を使う', instruction: '重要な場面では沈黙も選択肢にする',
  category: 'dialogue', mode: 'reference', priority: 0, overridable: true, source: 'author', active: true, notes: null, ...values,
});

test('zero adoptionとinactiveはguidanceにもsuppressionにも入らない', () => {
  assert.deepEqual(selectCreativeRulesForSurface([], 'writer').activeGuidanceRules, []);
  const result = selectCreativeRulesForSurface([
    builtin({ id: 'inactive-off', active: false, mode: 'off' }),
    builtin({ id: 'inactive-duplicate', active: false }),
    builtin({ id: 'active-reference' }),
  ], 'writer');
  assert.deepEqual(result.activeGuidanceRules.map(value => value.stableId), ['active-reference']);
  assert.deepEqual(result.suppressedTechniqueKeys, []);
  assert.ok(!result.validationIssues.some(value => value.code === 'duplicate_builtin_adoption'));
});

test('offはfallback suppressionだけに残りforbiddenへ変換されない', () => {
  const result = selectCreativeRulesForSurface([builtin({ mode: 'off' })], 'writer');
  assert.deepEqual(result.suppressedTechniqueKeys, ['show_dont_tell']);
  assert.deepEqual(result.activeGuidanceRules, []);
});

test('built-in各modeと作者調整・notes・sourceをsemantic DTOへ保持する', () => {
  const rules: ProjectCreativeRule[] = [
    builtin({ id: 'reference', techniqueKey: 'show_dont_tell', mode: 'reference', authorAdjustment: '感情は直接説明も許可', notes: '作者メモ', source: 'imported' }),
    builtin({ id: 'required', techniqueKey: 'sensory_detail', mode: 'required' }),
    builtin({ id: 'forbidden', techniqueKey: 'poetic_imagery', mode: 'forbidden' }),
  ];
  const result = selectCreativeRulesForSurface(rules, 'writer');
  assert.deepEqual(result.activeGuidanceRules.map(value => value.mode), ['forbidden', 'required', 'reference']);
  const reference = result.activeGuidanceRules.find(value => value.stableId === 'reference')!;
  assert.equal(reference.authorAdjustment, '感情は直接説明も許可'); assert.equal(reference.notes, '作者メモ'); assert.equal(reference.source, 'imported');
});

test('custom reference/required/forbiddenをbuilt-inへ変換せず保持する', () => {
  const result = selectCreativeRulesForSurface([
    custom({ id: 'r', mode: 'reference' }), custom({ id: 'q', title: '独自必須', mode: 'required' }), custom({ id: 'f', title: '独自禁止', mode: 'forbidden' }),
  ], 'writer');
  assert.equal(result.activeGuidanceRules.length, 3);
  assert.ok(result.activeGuidanceRules.every(value => value.kind === 'custom' && value.techniqueKey === undefined));
});

test('custom off、unknown key、duplicate built-inをfail closedで除外する', () => {
  const customOff = custom({ id: 'off', mode: 'off' });
  assert.ok(validateProjectCreativeRule(customOff, CREATIVE_TECHNIQUE_CATALOG).some(value => value.code === 'custom_off_not_allowed'));
  const result = selectCreativeRulesForSurface([
    customOff, builtin({ id: 'unknown', techniqueKey: 'future_key' }),
    builtin({ id: 'duplicate-a', techniqueKey: 'sensory_detail' }), builtin({ id: 'duplicate-b', techniqueKey: 'sensory_detail' }),
  ], 'writer');
  assert.deepEqual(result.activeGuidanceRules, []);
  assert.ok(result.validationIssues.some(value => value.code === 'unknown_technique_key'));
  assert.ok(result.validationIssues.some(value => value.code === 'duplicate_builtin_adoption'));
});

test('surface filteringを行いcustomをNavigatorへ自動投入しない', () => {
  const result = selectCreativeRulesForSurface([
    builtin({ id: 'chapter', techniqueKey: 'chapter_end_hook' }),
    builtin({ id: 'prose', techniqueKey: 'sentence_ending_variety' }), custom(),
  ], 'navigator');
  assert.deepEqual(result.activeGuidanceRules.map(value => value.stableId), ['chapter']);
  assert.deepEqual(result.omitted, ['custom', 'prose']);
});

test('mode strength、priority、key、idで決定的に並べる', () => {
  const values = [
    builtin({ id: 'low', techniqueKey: 'sensory_detail', priority: -1 }),
    builtin({ id: 'high', techniqueKey: 'show_dont_tell', priority: 10 }),
    custom({ id: 'required', mode: 'required', priority: -100 }),
  ];
  const first = selectCreativeRulesForSurface(values, 'writer').activeGuidanceRules.map(value => value.stableId);
  const second = selectCreativeRulesForSurface([...values].reverse(), 'writer').activeGuidanceRules.map(value => value.stableId);
  assert.deepEqual(first, ['required', 'high', 'low']); assert.deepEqual(second, first);
});

test('片方向conflict keyを双方向として一度だけ報告しfalse conflictを作らない', () => {
  const result = selectCreativeRulesForSurface([
    builtin({ id: 'cliff', techniqueKey: 'cliffhanger', mode: 'required' }),
    builtin({ id: 'quiet', techniqueKey: 'quiet_chapter_ending', mode: 'required' }),
    builtin({ id: 'show', techniqueKey: 'show_dont_tell', mode: 'required' }),
    builtin({ id: 'direct', techniqueKey: 'direct_emotion', mode: 'required' }),
  ], 'writer');
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0].ruleIds, ['cliff', 'quiet']);
  assert.ok(!result.conflicts[0].ruleIds.includes('show') && !result.conflicts[0].ruleIds.includes('direct'));
});
