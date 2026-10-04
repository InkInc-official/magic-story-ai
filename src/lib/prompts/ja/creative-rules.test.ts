import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BuiltinCreativeRuleAdoption, CustomCreativeRule } from '../../creative-rules/types.js';
import { buildJapaneseNovelCommonSpec } from './common-novel.js';
import { buildJapaneseAgentSystemPrompt } from './agents.js';
import { applyCreativeRuleFallbacksToReviewInstruction, buildCreativeRulePromptContext, CREATIVE_RULE_BUDGETS } from './creative-rules.js';

const builtin = (values: Partial<BuiltinCreativeRuleAdoption> = {}): BuiltinCreativeRuleAdoption => ({
  id: 'b', kind: 'builtin', techniqueKey: 'sentence_length_variation', mode: 'reference', priority: 0,
  overridable: true, source: 'author', active: true, ...values,
});
const custom = (values: Partial<CustomCreativeRule> = {}): CustomCreativeRule => ({
  id: 'c', kind: 'custom', title: '沈黙', instruction: '答えない選択を残す', category: 'dialogue', mode: 'required',
  priority: 0, overridable: true, source: 'author', active: true, ...values,
});

test('zero rowはguidance/suppressionなしで既定commonを維持する', () => {
  const value = buildCreativeRulePromptContext([], 'writer');
  assert.equal(value.text, ''); assert.deepEqual(value.suppressedFallbackKeys, []);
  const baseline = buildJapaneseNovelCommonSpec();
  assert.match(baseline, /同じ接続詞、語尾、構文を理由なく連続させず、文の長短と段落の密度を場面の速度に合わせる。/);
  assert.match(baseline, /章やシーンには、開始時の状況、目的または焦点、中心となる変化、終了時に変わったことを持たせる。/);
  assert.doesNotMatch(baseline, /人物の選択、出来事、その結果の因果/);
});

test('reference/required/forbidden/customを作品方針としてsurface別にserializeする', () => {
  const rules = [
    builtin({ id: 'ref', mode: 'reference', authorAdjustment: '長文も許可', notes: '静かな章' }),
    builtin({ id: 'req', techniqueKey: 'causal_progression', mode: 'required' }),
    builtin({ id: 'forbid', techniqueKey: 'cliffhanger', mode: 'forbidden' }),
    custom(),
  ];
  const writer = buildCreativeRulePromptContext(rules, 'writer');
  assert.match(writer.text, /採用しない場面を違反として扱わない/);
  assert.match(writer.text, /作者調整：長文も許可/); assert.match(writer.text, /作者メモ：静かな章/);
  assert.match(writer.text, /\[必須\]/); assert.match(writer.text, /\[禁止\]/); assert.match(writer.text, /答えない選択を残す/);
  const review = buildCreativeRulePromptContext(rules, 'review');
  assert.match(review.text, /参考は未使用でも違反・問題として扱わない/);
  assert.ok(writer.text.length <= CREATIVE_RULE_BUDGETS.writer + 500);
});

test('offだけが対応fallbackを抑止しforbidden/inactive/unsetは抑止しない', () => {
  const off = buildCreativeRulePromptContext([builtin({ mode: 'off' })], 'writer');
  assert.equal(off.text, ''); assert.deepEqual(off.suppressedFallbackKeys, ['sentence_length_variation']);
  const common = buildJapaneseNovelCommonSpec(off.suppressedFallbackKeys);
  assert.doesNotMatch(common, /文の長短と段落の密度/); assert.match(common, /同じ接続詞、語尾、構文/);
  assert.deepEqual(buildCreativeRulePromptContext([builtin({ mode: 'forbidden' })], 'writer').suppressedFallbackKeys, []);
  assert.deepEqual(buildCreativeRulePromptContext([builtin({ mode: 'off', active: false })], 'writer').suppressedFallbackKeys, []);
  assert.deepEqual(buildCreativeRulePromptContext([], 'writer').suppressedFallbackKeys, []);
});

test('4 fallback keyは相互に独立して対応sectionだけを抑止する', () => {
  const cases = [
    ['sentence_length_variation', '文の長短と段落の密度', '同じ接続詞、語尾、構文'],
    ['sentence_ending_variety', '同じ接続詞、語尾、構文', '文の長短と段落の密度'],
    ['scene_focus_change', '開始時から焦点または状況を変化', '人物の選択、出来事、その結果の因果'],
    ['causal_progression', '人物の選択、出来事、その結果の因果', '開始時から焦点または状況を変化'],
  ] as const;
  for (const [key, absent, present] of cases) {
    const result = buildCreativeRulePromptContext([builtin({ techniqueKey: key, mode: 'off' })], 'writer');
    const common = buildJapaneseNovelCommonSpec(result.suppressedFallbackKeys);
    assert.doesNotMatch(common, new RegExp(absent)); assert.match(common, new RegExp(present));
  }
});

test('required/forbidden overflowはsilent omissionせずfail closedする', () => {
  const huge = Array.from({ length: 20 }, (_, index) => custom({ id: `c${index}`, title: `規則${index}`, instruction: '規則'.repeat(1000) }));
  assert.throws(() => buildCreativeRulePromptContext(huge, 'editor'), /処理を中止/);
});

test('Reviewのknown fallbackだけをoffで評価基準から外す', () => {
  const base = '構成を確認する。';
  const normal = applyCreativeRuleFallbacksToReviewInstruction(base, 'structure', []);
  assert.match(normal, /因果的なつながり/); assert.match(normal, /焦点または状況の変化/);
  const suppressed = applyCreativeRuleFallbacksToReviewInstruction(base, 'structure', ['causal_progression']);
  assert.doesNotMatch(suppressed, /因果的なつながり/); assert.match(suppressed, /焦点または状況の変化/);
  assert.equal(applyCreativeRuleFallbacksToReviewInstruction('人物を確認', 'character', ['causal_progression']), '人物を確認');
});

test('Editor system promptも共通fallback keyを構造的に抑止する', () => {
  const normal = buildJapaneseAgentSystemPrompt('editor');
  const suppressed = buildJapaneseAgentSystemPrompt('editor', ['sentence_ending_variety']);
  assert.match(normal, /語尾の単調さ/); assert.match(normal, /同じ接続詞、語尾、構文/);
  assert.doesNotMatch(suppressed, /語尾の単調さ/); assert.doesNotMatch(suppressed, /同じ接続詞、語尾、構文/);
  assert.match(suppressed, /誤文、助詞、係り受け/);
});

test('NavigatorはCatalog surfaceだけを使いCustomとprose-onlyを除外する', () => {
  const result = buildCreativeRulePromptContext([
    builtin({ id: 'navigator', techniqueKey: 'foreshadow_and_payoff', mode: 'reference' }),
    builtin({ id: 'prose', techniqueKey: 'sentence_length_variation', mode: 'required' }),
    custom({ id: 'custom', instruction: 'NAVIGATOR_CUSTOM_TOKEN' }),
  ], 'navigator');
  assert.match(result.text, /伏線と回収/);
  assert.match(result.text, /全Routeへ強制しない/);
  assert.doesNotMatch(result.text, /文の長短|NAVIGATOR_CUSTOM_TOKEN/);
  assert.deepEqual(result.omitted, ['custom', 'prose']);
});
