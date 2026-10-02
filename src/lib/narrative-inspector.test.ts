import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInspectorContext, type InspectorSources } from './inspector-context.js';
import { INSPECTOR_MAX_ISSUES, NarrativeInspectorError, extractNarrativeInspectorOutput, validateNarrativeInspectorOutput } from './narrative-inspector.js';
import { inspectBuiltContext } from './narrative-inspector-runner.js';
import { buildNarrativeInspectorUserPrompt, NARRATIVE_INSPECTOR_SYSTEM_PROMPT } from './prompts/ja/narrative-inspector.js';

function source(content = 'Bは悲しかった。Bは悲しそうにしていた。'): InspectorSources {
  return {
    project: { id: 'p1', narrativePerspective: 'third_person_limited', defaultPovCharacterId: 'a', defaultNarratorId: 'n1' },
    chapter: { id: 'c2', projectId: 'p1', order: 2, title: '確認章', content, povCharacterId: 'a', narratorId: 'n1' },
    characters: [
      { id: 'a', projectId: 'p1', name: 'A', firstPerson: '私', narrationVoiceNotes: 'Aの認識範囲で語る。' },
      { id: 'b', projectId: 'p1', name: 'B' },
    ],
    narrators: [{ id: 'n1', projectId: 'p1', name: '三人称語り手', linkedCharacterId: 'a', identityFactId: null, identityDisclosureMode: 'normal', voiceNotes: '静かな語り。' }],
    cast: [{ chapterId: 'c2', characterId: 'b', participation: 'present', order: 0 }],
    narrativeRules: [], storyFacts: [], characterKnowledge: [], relationships: [],
  };
}

function issue(context: ReturnType<typeof buildInspectorContext>, overrides: Record<string, unknown> = {}) {
  const excerpt = 'Bは悲しかった。'; const startOffset = context.inspectedText.excerpt.indexOf(excerpt);
  return {
    category: 'viewpoint', issueType: 'other_character_inner_state', excerpt, startOffset, endOffset: startOffset + excerpt.length,
    explanation: '現在の視点設定では、Bの内面を直接知る根拠を確認できません。',
    suggestedDirection: '観測可能な表現か、内面を知る作品設定があるか確認してください。', severity: 'check', evidenceRefs: ['pov:a'], ...overrides,
  };
}

test('他人物内面のmock Issueを実本文offset・evidence付きで受理する', async () => {
  const context = buildInspectorContext(source()); const rawIssue = issue(context);
  const result = await inspectBuiltContext(context, async () => JSON.stringify({ schemaVersion: 1, issues: [rawIssue] }));
  assert.equal(result.issues[0].issueType, 'other_character_inner_state');
  assert.equal(result.issues[0].startOffset, rawIssue.startOffset);
});

test('観測表現・一人称本人・hidden暗示をIssueなしとして正常受理し、deterministic Issueを生成しない', async () => {
  for (const content of ['Bは悲しそうにしていた。', '私は悲しかった。', '誰かの気配がした。']) {
    const context = buildInspectorContext(source(content));
    const result = await inspectBuiltContext(context, async () => '{"schemaVersion":1,"issues":[]}');
    assert.deepEqual(result.issues, []);
  }
});

test('allow Ruleの自由記述をpromptへ渡し、一般慣習より優先する指示を持つ', async () => {
  const value = source('美咲は心の中で、早く帰りたいと思っていた。');
  value.narrativeRules.push({ id: 'mind', projectId: 'p1', title: '他者の思考を知覚できる', description: 'このPOV存在は近距離にいる人物の表層思考を知覚できる。', category: 'viewpoint', mode: 'allow', priority: 100, source: 'author', machineKey: 'can_read_minds', active: true, overridable: false });
  const context = buildInspectorContext(value);
  let prompt = '';
  await inspectBuiltContext(context, async messages => { prompt = messages.map(message => message.content).join('\n'); return '{"schemaVersion":1,"issues":[]}'; });
  assert.match(prompt, /近距離にいる人物の表層思考を知覚できる/);
  assert.match(NARRATIVE_INSPECTOR_SYSTEM_PROMPT, /Narrative Ruleを一般的な叙述慣習より優先/);
});

test('Author Truthとbelieves_falseをprompt内で分離し、StoryFact差だけでIssueを作らない', async () => {
  const value = source('父はあの男に殺された。');
  value.storyFacts.push({ id: 'father', projectId: 'p1', content: '父親は殺されていない', importance: 'high', readerInitiallyKnows: false });
  value.characterKnowledge.push({ id: 'false-belief', factId: 'father', characterId: 'a', status: 'believes_false', effectiveChapterId: 'c2', beliefNotes: '父親は殺された' });
  const context = buildInspectorContext(value); const prompt = buildNarrativeInspectorUserPrompt(context);
  assert.match(prompt, /Author Truth/); assert.match(prompt, /誤認：父親は殺された/);
  assert.deepEqual((await inspectBuiltContext(context, async () => '{"schemaVersion":1,"issues":[]}')).issues, []);
});

test('hidden Factは自動Issueにせず、semantic漏洩mockだけを受理する', async () => {
  const value = source('父親は殺されていない。');
  value.storyFacts.push({ id: 'father', projectId: 'p1', content: '父親は殺されていない', importance: 'high', readerInitiallyKnows: false });
  const context = buildInspectorContext(value);
  assert.deepEqual((await inspectBuiltContext(context, async () => '{"schemaVersion":1,"issues":[]}')).issues, []);
  const excerpt = '父親は殺されていない。';
  const leak = { category: 'knowledge', issueType: 'reader_hidden_leak', excerpt, startOffset: 0, endOffset: excerpt.length, explanation: '未開示情報を確定しています。', suggestedDirection: '意図した開示か確認してください。', severity: 'problem', evidenceRefs: ['fact:father'] };
  assert.equal((await inspectBuiltContext(context, async () => JSON.stringify({ schemaVersion: 1, issues: [leak] }))).issues[0].issueType, 'reader_hidden_leak');
});

test('章内Reader reveal・Knowledge changeがあるとタイミング断定回避をpromptへ追加する', () => {
  const value = source('秘密が明かされた。');
  value.storyFacts.push({ id: 'secret', projectId: 'p1', content: '秘密が明かされた', importance: 'high', readerInitiallyKnows: false, revealedChapterId: 'c2', revealedChapter: { id: 'c2', projectId: 'p1', order: 2 } });
  value.characterKnowledge.push({ id: 'learn', factId: 'secret', characterId: 'a', status: 'knows', effectiveChapterId: 'c2', effectiveChapter: { id: 'c2', projectId: 'p1', order: 2 } });
  const prompt = buildNarrativeInspectorUserPrompt(buildInspectorContext(value));
  assert.match(prompt, /本文offsetとの対応は未登録/); assert.match(prompt, /章冒頭から既知とは扱わず/);
});

test('hallucinated excerpt・offset・evidence・category・issueTypeを拒否する', () => {
  const context = buildInspectorContext(source());
  const invalidValues = [
    issue(context, { excerpt: '本文にない引用' }),
    issue(context, { startOffset: 1 }),
    issue(context, { evidenceRefs: ['fact:foreign'] }),
    issue(context, { category: 'voice' }),
    issue(context, { issueType: 'made_up_type' }),
  ];
  invalidValues.forEach(value => assert.throws(() => validateNarrativeInspectorOutput({ schemaVersion: 1, issues: [value] }, context), NarrativeInspectorError));
});

test('Issue上限とduplicateを拒否する', () => {
  const context = buildInspectorContext(source()); const valid = issue(context);
  assert.throws(() => validateNarrativeInspectorOutput({ schemaVersion: 1, issues: Array.from({ length: INSPECTOR_MAX_ISSUES + 1 }, () => valid) }, context), NarrativeInspectorError);
  assert.throws(() => validateNarrativeInspectorOutput({ schemaVersion: 1, issues: [valid, valid] }, context), NarrativeInspectorError);
});

test('empty・invalid JSON・AI failureを明示失敗にする', async () => {
  const context = buildInspectorContext(source());
  assert.throws(() => extractNarrativeInspectorOutput('', context), (error: NarrativeInspectorError) => error.code === 'empty_response');
  assert.throws(() => extractNarrativeInspectorOutput('not json', context), (error: NarrativeInspectorError) => error.code === 'invalid_json');
  await assert.rejects(() => inspectBuiltContext(context, async () => { throw new Error('network'); }), (error: NarrativeInspectorError) => error.code === 'ai_failure');
});

test('concealed identityの本文を通常説明からredactする', async () => {
  const value = source('誰かが見ていた。');
  value.narrators[0] = { ...value.narrators[0], name: '作者用：幽霊の太郎', identityDisclosureMode: 'concealed', identityFactId: 'identity' };
  value.storyFacts.push({ id: 'identity', projectId: 'p1', content: '観測者は太郎の幽霊である', importance: 'high', readerInitiallyKnows: false });
  const context = buildInspectorContext(value); const excerpt = '誰かが見ていた。';
  const raw = { category: 'knowledge', issueType: 'reader_hidden_leak', excerpt, startOffset: 0, endOffset: excerpt.length, explanation: '観測者は太郎の幽霊であるため確認する。', suggestedDirection: '作者用：幽霊の太郎の正体を伏せる。', severity: 'check', evidenceRefs: ['fact:identity'] };
  const result = await inspectBuiltContext(context, async () => JSON.stringify({ schemaVersion: 1, issues: [raw] }));
  assert.doesNotMatch(result.issues[0].explanation, /太郎の幽霊/); assert.match(result.issues[0].explanation, /秘匿中の作者設定/);
});
