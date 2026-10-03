import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BUILTIN_CREATIVE_RULE_UI_MODES, buildCustomMutationPayload, buildTechniqueCreatePayload,
  buildTechniqueUpdatePayload, CREATIVE_RULE_MODE_EXPLANATIONS, CUSTOM_CREATIVE_RULE_UI_MODES,
  decideTechniqueModeMutation, filterCreativeTechniques, findExplicitCreativeRuleConflicts,
  graphemeCountLabel, isLatestCreativeRuleMutation, isLatestCreativeRulesProject,
  validateCustomCreativeRuleDraft, type CreativeTechniqueAdoptionView, type CreativeTechniqueView,
} from './creative-rules-ui.js';

const adoption = (values: Partial<CreativeTechniqueAdoptionView> = {}): CreativeTechniqueAdoptionView => ({
  id: 'a1', techniqueKey: 'show_dont_tell', mode: 'reference', priority: 0, overridable: true,
  authorAdjustment: '', notes: '', active: true, catalogContractVersion: 1, ...values,
});
const technique = (key: string, values: Partial<CreativeTechniqueView> = {}): CreativeTechniqueView => ({
  definition: { key, category: key === 'dialogue_density' ? 'dialogue' : 'description', label: key === 'dialogue_density' ? '会話密度' : '説明と描写', shortDescription: key === 'dialogue_density' ? '会話の配分' : '行動から読み取れる表現', guidance: { reference: '参考', required: '必須', forbidden: '禁止' } },
  adoption: null, contractStatus: 'current', needsReview: false, ...values,
});

test('search・category・state filterをAND条件で適用する', () => {
  const values = [technique('show_dont_tell', { adoption: adoption() }), technique('dialogue_density'), technique('review', { needsReview: true, contractStatus: 'outdated' }), technique('disabled', { adoption: adoption({ id: 'd', active: false }) })];
  assert.deepEqual(filterCreativeTechniques(values, '会話', 'dialogue', 'unset').map(value => value.definition.key), ['dialogue_density']);
  assert.deepEqual(filterCreativeTechniques(values, '', 'all', 'configured').map(value => value.definition.key), ['show_dont_tell', 'disabled']);
  assert.deepEqual(filterCreativeTechniques(values, '', 'all', 'review').map(value => value.definition.key), ['review']);
  assert.deepEqual(filterCreativeTechniques(values, '', 'all', 'disabled').map(value => value.definition.key), ['disabled']);
});

test('未設定・off・forbiddenとactive=falseを別contractとして扱う', () => {
  assert.deepEqual(BUILTIN_CREATIVE_RULE_UI_MODES, ['unset', 'off', 'reference', 'required', 'forbidden']);
  assert.notEqual(CREATIVE_RULE_MODE_EXPLANATIONS.unset, CREATIVE_RULE_MODE_EXPLANATIONS.off);
  assert.notEqual(CREATIVE_RULE_MODE_EXPLANATIONS.off, CREATIVE_RULE_MODE_EXPLANATIONS.forbidden);
  assert.equal(decideTechniqueModeMutation(null, 'reference'), 'create');
  assert.equal(decideTechniqueModeMutation(null, 'off'), 'create');
  assert.equal(decideTechniqueModeMutation(adoption({ mode: 'off' }), 'unset'), 'delete');
  assert.equal(decideTechniqueModeMutation(adoption({ active: false }), 'reference'), 'update');
});

test('Custom UI modeにoffを含めない', () => {
  assert.deepEqual(CUSTOM_CREATIVE_RULE_UI_MODES, ['reference', 'required', 'forbidden']);
  assert.ok(!CUSTOM_CREATIVE_RULE_UI_MODES.includes('off' as never));
});

test('mutation payloadは必要fieldだけでsourceとcatalog versionを送らない', () => {
  const create = buildTechniqueCreatePayload('p1', 'show_dont_tell', 'off');
  const update = buildTechniqueUpdatePayload('p1', adoption(), { mode: 'required', active: false });
  const custom = buildCustomMutationPayload('p1', { id: 'c1', title: '原文', instruction: '改行\r\n保持', category: 'style', mode: 'required', priority: 1, overridable: false, notes: '補足', active: false });
  assert.deepEqual(create, { projectId: 'p1', techniqueKey: 'show_dont_tell', mode: 'off' });
  assert.deepEqual(update, { projectId: 'p1', id: 'a1', mode: 'required', active: false });
  assert.equal('source' in custom, false); assert.equal('catalogContractVersion' in custom, false);
  assert.equal(custom.instruction, '改行\r\n保持'); assert.equal(custom.active, false);
});

test('Custom validationは空白・length・priorityをAPI contractに合わせて拒否する', () => {
  const valid = { title: '方針', instruction: '本文', notes: '', priority: 0 };
  assert.equal(validateCustomCreativeRuleDraft(valid), null);
  assert.match(validateCustomCreativeRuleDraft({ ...valid, title: '  ' })!, /タイトル/);
  assert.match(validateCustomCreativeRuleDraft({ ...valid, instruction: '\r\n' })!, /内容/);
  assert.match(validateCustomCreativeRuleDraft({ ...valid, title: 'a'.repeat(121) })!, /120/);
  assert.match(validateCustomCreativeRuleDraft({ ...valid, instruction: 'a'.repeat(2001) })!, /2000/);
  assert.match(validateCustomCreativeRuleDraft({ ...valid, notes: 'a'.repeat(1001) })!, /1000/);
  assert.match(validateCustomCreativeRuleDraft({ ...valid, priority: 101 })!, /-100/);
});

test('grapheme counterはUTF-16 lengthではなく結合文字・emojiを1文字として数える', () => {
  assert.equal('か\u3099🧭'.length, 4);
  assert.equal(graphemeCountLabel('か\u3099🧭', 120), '2/120文字（目安）');
});

test('Project responseとmutation responseのstale tokenを拒否する', () => {
  assert.equal(isLatestCreativeRulesProject('project-a', 'project-b'), false);
  assert.equal(isLatestCreativeRulesProject('project-b', 'project-b'), true);
  assert.equal(isLatestCreativeRuleMutation(1, 2), false);
  assert.equal(isLatestCreativeRuleMutation(2, 2), true);
});

test('Catalogの明示conflictだけを重複なく警告する', () => {
  const cliff = technique('cliffhanger', { adoption: adoption({ id: 'c', techniqueKey: 'cliffhanger', mode: 'required' }) }); cliff.definition.conflictKeys = ['quiet_chapter_ending'];
  const quiet = technique('quiet_chapter_ending', { adoption: adoption({ id: 'q', techniqueKey: 'quiet_chapter_ending', mode: 'required' }) });
  const direct = technique('direct_emotion', { adoption: adoption({ id: 'd', techniqueKey: 'direct_emotion', mode: 'required' }) });
  assert.deepEqual(findExplicitCreativeRuleConflicts([cliff, quiet, direct]), [['cliffhanger', 'quiet_chapter_ending']]);
  quiet.adoption = adoption({ id: 'q', techniqueKey: 'quiet_chapter_ending', mode: 'reference' });
  assert.deepEqual(findExplicitCreativeRuleConflicts([cliff, quiet, direct]), []);
});
