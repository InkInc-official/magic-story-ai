import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInspectorContext, type InspectorSources } from './inspector-context.js';
import { sanitizeInspectorText } from './narrative-inspector.js';
import { fallbackLearningQuestion, learningSessionIsFresh, learningStatusAfterReinspection, NarrativeLearningError, nextLearningLevel, parseLearningOutput } from './narrative-learning.js';
import { buildNarrativeLearningPrompt, NARRATIVE_LEARNING_SYSTEM_PROMPT } from './prompts/ja/narrative-learning.js';

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
