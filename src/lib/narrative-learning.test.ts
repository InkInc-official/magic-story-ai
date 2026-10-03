import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInspectorContext, type InspectorSources } from './inspector-context.js';
import { sanitizeInspectorText } from './narrative-inspector.js';
import { fallbackLearningQuestion, learningSessionIsFresh, learningStatusAfterReinspection, NarrativeLearningError, nextLearningLevel, parseLearningOutput } from './narrative-learning.js';
import { buildNarrativeLearningPrompt, NARRATIVE_LEARNING_SYSTEM_PROMPT } from './prompts/ja/narrative-learning.js';
import { buildInspectorContextFingerprint } from './inspector-fingerprint.js';

function contextSource(): InspectorSources {
  return {
    project: { id: 'p1', narrativePerspective: 'third_person_limited', defaultPovCharacterId: 'a', defaultNarratorId: 'n1' },
    chapter: { id: 'c1', projectId: 'p1', order: 1, title: '章', content: '誰かが見ていた。', povCharacterId: 'a', narratorId: 'n1' },
    characters: [{ id: 'a', projectId: 'p1', name: 'A' }], cast: [], relationships: [], narrativeRules: [], characterKnowledge: [],
    narrators: [{ id: 'n1', projectId: 'p1', name: '作者用：幽霊の太郎', identityFactId: 'secret', identityDisclosureMode: 'concealed', voiceNotes: '静かな声' }],
    storyFacts: [{ id: 'secret', projectId: 'p1', content: '観測者は太郎の幽霊である', importance: 'high', readerInitiallyKnows: false }],
  };
}

test('requested Levelだけのstructured outputを受理し、空・level飛ばし・長文を拒否する', () => {
  assert.deepEqual(parseLearningOutput('{"schemaVersion":1,"level":0,"content":"何を知覚できますか？"}', 0), { schemaVersion: 1, level: 0, content: '何を知覚できますか？' });
  assert.throws(() => parseLearningOutput('{"schemaVersion":1,"level":2,"content":"hint"}', 1), NarrativeLearningError);
  assert.throws(() => parseLearningOutput('{"schemaVersion":1,"level":1,"content":""}', 1), NarrativeLearningError);
  assert.throws(() => parseLearningOutput(JSON.stringify({ schemaVersion: 1, level: 1, content: 'a'.repeat(1201) }), 1), NarrativeLearningError);
});

test('HintはLevel 0→1→2の順だけで、Level 2より先へ進まない', () => {
  assert.equal(nextLearningLevel(0), 1); assert.equal(nextLearningLevel(1), 2);
  assert.throws(() => nextLearningLevel(2), NarrativeLearningError);
});

test('本文・Context・Issue fingerprint変更後はSessionをfresh扱いしない', () => {
  const session = { startingIssueFingerprint: 'issue', startingContentHash: 'content', startingContextFingerprint: 'context', fingerprintVersion: 'semantic-v2' };
  assert.equal(learningSessionIsFresh(session, { issueFingerprint: 'issue', contentHash: 'content', contextFingerprint: 'context', fingerprintVersion: 'semantic-v2' }), true);
  assert.equal(learningSessionIsFresh(session, { issueFingerprint: 'changed', contentHash: 'content', contextFingerprint: 'context', fingerprintVersion: 'semantic-v2' }), false);
  assert.equal(learningSessionIsFresh(session, { issueFingerprint: 'issue', contentHash: 'changed', contextFingerprint: 'context', fingerprintVersion: 'semantic-v2' }), false);
  assert.equal(learningSessionIsFresh(session, { issueFingerprint: 'issue', contentHash: 'content', contextFingerprint: 'changed', fingerprintVersion: 'semantic-v2' }), false);
  assert.equal(learningSessionIsFresh(session, { issueFingerprint: 'issue', contentHash: 'content', contextFingerprint: 'context', fingerprintVersion: 'legacy-v1' }), false);
});

test('再検査はscope内で元Issueが消えた時だけcompletedにし、残存や範囲外を成功扱いしない', () => {
  const session = { startingIssueFingerprint: 'issue', startingContentHash: 'content', startingContextFingerprint: 'context', fingerprintVersion: 'semantic-v2' };
  const same = { issueFingerprint: 'issue', contentHash: 'content', contextFingerprint: 'context', fingerprintVersion: 'semantic-v2' };
  assert.equal(learningStatusAfterReinspection(session, same, true), 'completed');
  assert.equal(learningStatusAfterReinspection(session, same, false), 'active');
  assert.equal(learningStatusAfterReinspection(session, { ...same, contentHash: 'changed' }, false), 'stale');
  assert.equal(learningStatusAfterReinspection(session, { ...same, issueFingerprint: 'different-issue' }, true), 'completed');
});

test('legacy Learningはrolloutだけなら継続しsemantic-v2再検査transitionではstaleになる', () => {
  const session = { startingIssueFingerprint: 'issue', startingContentHash: 'content', startingContextFingerprint: 'legacy', fingerprintVersion: 'legacy-v1' };
  assert.equal(learningSessionIsFresh(session, { issueFingerprint: 'issue', contentHash: 'content', contextFingerprint: 'legacy', fingerprintVersion: 'legacy-v1' }), true);
  assert.equal(learningStatusAfterReinspection(session, { issueFingerprint: 'issue', contentHash: 'content', contextFingerprint: 'semantic', fingerprintVersion: 'semantic-v2' }, false), 'stale');
});

test('semantic-v2 Learningはrolloutだけでは継続しsemantic-v3再検査transitionでstaleになる', () => {
  const session = { startingIssueFingerprint: 'issue', startingContentHash: 'content', startingContextFingerprint: 'v2-context', fingerprintVersion: 'semantic-v2' };
  assert.equal(learningSessionIsFresh(session, { issueFingerprint: 'issue', contentHash: 'content', contextFingerprint: 'v2-context', fingerprintVersion: 'semantic-v2' }), true);
  assert.equal(learningStatusAfterReinspection(session, { issueFingerprint: 'issue', contentHash: 'content', contextFingerprint: 'v3-context', fingerprintVersion: 'semantic-v3' }, false), 'stale');
});

test('semantic-v3 Learningは旧contractで継続しsemantic-v4再検査transitionでstaleになる', () => {
  const session = { startingIssueFingerprint: 'issue', startingContentHash: 'content', startingContextFingerprint: 'v3-context', fingerprintVersion: 'semantic-v3' };
  assert.equal(learningSessionIsFresh(session, { issueFingerprint: 'issue', contentHash: 'content', contextFingerprint: 'v3-context', fingerprintVersion: 'semantic-v3' }), true);
  assert.equal(learningStatusAfterReinspection(session, { issueFingerprint: 'issue', contentHash: 'content', contextFingerprint: 'v4-context', fingerprintVersion: 'semantic-v4' }, false), 'stale');
});

test('category fallbackは問いであり完成修正文を返さない', () => {
  for (const category of ['viewpoint', 'knowledge', 'voice', 'narrative_rule']) {
    const fallback = fallbackLearningQuestion(category);
    assert.match(fallback, /？$/); assert.doesNotMatch(fallback, /書き換え|正解|模範解答/);
  }
});

test('Learning promptは段階別要求と禁止事項を持ち、Hintを先行生成しない', () => {
  const context = buildInspectorContext(contextSource());
  const issue = { category: 'viewpoint' as const, issueType: 'other_character_inner_state' as const, excerpt: '誰かが見ていた。', explanation: '確認理由', suggestedDirection: '確認方向', evidenceRefs: ['pov:a'] };
  const level0 = buildNarrativeLearningPrompt({ context, issue, level: 0, previousSteps: [] });
  assert.match(level0, /開かれた問いを一つ/); assert.doesNotMatch(level0, /hint1/);
  assert.match(NARRATIVE_LEARNING_SYSTEM_PROMPT, /完成修正文、置換文、模範解答を提示しない/);
  assert.match(NARRATIVE_LEARNING_SYSTEM_PROMPT, /NarratorとPOV/);
});

test('LearningはCreative Rulesを作者方針として扱いreferenceを必須修正化しない', () => {
  const value = contextSource(); value.creativeRules = [
    { id: 'required', kind: 'builtin', techniqueKey: 'show_dont_tell', mode: 'required', priority: 10, overridable: false, source: 'author', active: true },
    { id: 'reference', kind: 'custom', title: '沈黙', instruction: '答えない選択を残す', category: 'dialogue', mode: 'reference', priority: 0, overridable: true, source: 'author', active: true },
  ];
  const context = buildInspectorContext(value);
  const issue = { category: 'narrative_rule' as const, issueType: 'rule_application_unclear' as const, excerpt: '誰かが見ていた。', explanation: '作者方針との関係を確認する', suggestedDirection: '適用意図を考える', evidenceRefs: ['creative-rule:reference'] };
  const prompt = buildNarrativeLearningPrompt({ context, issue, level: 0, previousSteps: [] });
  assert.match(prompt, /創作ルール（学習支援）/); assert.match(prompt, /参考は任意の検討材料/);
  assert.doesNotMatch(prompt, /創作ルール（Inspector）/);
  assert.match(NARRATIVE_LEARNING_SYSTEM_PROMPT, /referenceを必須修正として教えず/);
  assert.match(NARRATIVE_LEARNING_SYSTEM_PROMPT, /完成修正文、置換文、模範解答を提示しない/);
});

test('LearningではCreative Rule offをforbidden化せずinactiveを投入しない', () => {
  const value = contextSource(); value.creativeRules = [
    { id: 'off', kind: 'builtin', techniqueKey: 'sentence_ending_variety', mode: 'off', priority: 0, overridable: true, source: 'author', active: true },
    { id: 'inactive', kind: 'custom', title: '非使用', instruction: '投入されない', category: 'style', mode: 'required', priority: 100, overridable: false, source: 'author', active: false },
  ];
  const context = buildInspectorContext(value);
  assert.match(context.learningBudget.text, /offはforbiddenを意味しない/);
  assert.doesNotMatch(context.learningBudget.text, /投入されない|\[禁止\] 文末の変化/);
});

test('semantic-v4 Learning freshnessは関連Creative Rule変更でstale、inactive変更で維持する', () => {
  const base = contextSource(); base.creativeRules = [{ id: 'custom-a', kind: 'custom', title: '沈黙', instruction: '答えない選択を残す', category: 'dialogue', mode: 'reference', priority: 0, overridable: true, source: 'author', active: true }];
  const initialContext = buildInspectorContext(base); const initialFingerprint = buildInspectorContextFingerprint(initialContext, 'semantic-v4');
  const session = { startingIssueFingerprint: 'issue', startingContentHash: initialContext.inspectedText.contentHash, startingContextFingerprint: initialFingerprint, fingerprintVersion: 'semantic-v4' };
  const changed = structuredClone(base); if (changed.creativeRules?.[0].kind === 'custom') changed.creativeRules[0].instruction = '沈黙を破る';
  const changedContext = buildInspectorContext(changed);
  assert.equal(learningSessionIsFresh(session, { issueFingerprint: 'issue', contentHash: changedContext.inspectedText.contentHash, contextFingerprint: buildInspectorContextFingerprint(changedContext, 'semantic-v4'), fingerprintVersion: 'semantic-v4' }), false);
  const inactive = contextSource(); inactive.creativeRules = [{ id: 'inactive', kind: 'custom', title: '非使用', instruction: 'A', category: 'style', mode: 'required', priority: 0, overridable: false, source: 'author', active: false }];
  const inactiveChanged = structuredClone(inactive); if (inactiveChanged.creativeRules?.[0].kind === 'custom') inactiveChanged.creativeRules[0].instruction = 'B';
  assert.equal(buildInspectorContextFingerprint(buildInspectorContext(inactive), 'semantic-v4'), buildInspectorContextFingerprint(buildInspectorContext(inactiveChanged), 'semantic-v4'));
});

test('concealed Narrator名とidentity Fact本文をQuestion/Hint表示から除去する', () => {
  const value = contextSource();
  value.storyFacts.push({ id: 'father', projectId: 'p1', content: '父親は殺されていない', importance: 'high', readerInitiallyKnows: false });
  value.characterKnowledge.push({ id: 'belief', factId: 'father', characterId: 'a', status: 'believes_false', beliefNotes: '父親は殺された' });
  value.chapter.content += ' 父親は殺されていない。';
  const context = buildInspectorContext(value);
  const sanitized = sanitizeInspectorText('作者用：幽霊の太郎について、観測者は太郎の幽霊である。父親は殺されていない。', context);
  assert.doesNotMatch(sanitized, /太郎の幽霊|父親は殺されていない/); assert.match(sanitized, /秘匿中の作者設定/);
  assert.match(NARRATIVE_LEARNING_SYSTEM_PROMPT, /Reader-hiddenなAuthor Truthを答えとして明かさず/);
});
