import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInspectorContext, type InspectorSources } from './inspector-context.js';
import { hasUnsavedInspectorChanges, INSPECTOR_MAX_ISSUES, NarrativeInspectorError, extractNarrativeInspectorOutput, validateNarrativeInspectorOutput } from './narrative-inspector.js';
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

test('保存済み本文・title・POV・Narratorとの差をdirtyとして検出する', () => {
  const saved = { content: '保存本文', title: '章', povCharacterId: 'a', narratorId: 'n' };
  assert.equal(hasUnsavedInspectorChanges(saved, { ...saved }), false);
  for (const draft of [{ ...saved, content: '未保存本文' }, { ...saved, title: '変更' }, { ...saved, povCharacterId: 'b' }, { ...saved, narratorId: null }]) {
    assert.equal(hasUnsavedInspectorChanges(saved, draft), true);
  }
});

test('Voice Issueを受理するが文字列からdeterministicに生成しない', async () => {
  const value = source('「俺は行く」とAは言った。');
  value.characters[0].firstPerson = '私';
  const context = buildInspectorContext(value);
  assert.deepEqual((await inspectBuiltContext(context, async () => '{"schemaVersion":1,"issues":[]}')).issues, []);
  const excerpt = '俺は行く'; const startOffset = context.inspectedText.excerpt.indexOf(excerpt);
  const voiceIssue = { category: 'voice', issueType: 'first_person_mismatch', locationKind: 'excerpt', excerpt, startOffset, endOffset: startOffset + excerpt.length, explanation: '明示された一人称と異なります。', suggestedDirection: '引用や演技など意図した変化か確認してください。', severity: 'check', evidenceRefs: ['character:a'] };
  const result = await inspectBuiltContext(context, async () => JSON.stringify({ schemaVersion: 1, issues: [voiceIssue] }));
  assert.equal(result.issues[0].category, 'voice');
});

test('方向付きRelationship overrideとNarrator/POV voiceを分離してpromptへ渡す', () => {
  const value = source('AはBに声をかけた。');
  value.characters[0].speechStyleNotes = '砕けた若者口調';
  value.characters[0].narrationVoiceNotes = '近い心理距離の地の文';
  value.narrators[0].voiceNotes = '静かで古風な語り';
  value.relationships = [
    { id: 'a-to-b', projectId: 'p1', fromCharacterId: 'a', toCharacterId: 'b', type: '先輩後輩', addressTerm: '先輩', speechRegister: '敬語', speechStyleNotes: '控えめ' },
    { id: 'b-to-a', projectId: 'p1', fromCharacterId: 'b', toCharacterId: 'a', type: '先輩後輩', addressTerm: 'A', speechRegister: 'タメ口', speechStyleNotes: '率直' },
  ];
  const context = buildInspectorContext(value); const prompt = buildNarrativeInspectorUserPrompt(context);
  assert.match(prompt, /a→b[\s\S]*呼称：先輩[\s\S]*話し方：敬語/);
  assert.match(prompt, /b→a[\s\S]*呼称：A[\s\S]*話し方：タメ口/);
  assert.match(prompt, /Narrator voice：静かで古風な語り/);
  assert.match(prompt, /POV narration voice：近い心理距離の地の文/);
});

test('allow Ruleの不使用を自動Issueにせず、forbid違反は実在Rule evidenceで受理する', async () => {
  const value = source('語り手の正体が本文で明かされた。');
  value.narrativeRules.push(
    { id: 'mind', projectId: 'p1', title: '読心を許可', description: '近距離の表層思考を知覚できる。', category: 'viewpoint', mode: 'allow', priority: 20, source: 'author', machineKey: 'can_read_minds', active: true, overridable: false },
    { id: 'hide', projectId: 'p1', title: '正体を開示しない', description: '公開前は語り手の正体を直接明記しない。', category: 'knowledge', mode: 'forbid', priority: 100, source: 'author', active: true, overridable: false },
  );
  const context = buildInspectorContext(value);
  assert.deepEqual((await inspectBuiltContext(context, async () => '{"schemaVersion":1,"issues":[]}')).issues, []);
  const excerpt = context.inspectedText.excerpt; const raw = { category: 'narrative_rule', issueType: 'forbidden_rule_violation', locationKind: 'excerpt', excerpt, startOffset: 0, endOffset: excerpt.length, explanation: '禁止ルールへの抵触候補です。', suggestedDirection: '意図した開示か確認してください。', severity: 'problem', evidenceRefs: ['rule:hide'] };
  assert.equal((await inspectBuiltContext(context, async () => JSON.stringify({ schemaVersion: 1, issues: [raw] }))).issues[0].severity, 'problem');
  assert.throws(() => validateNarrativeInspectorOutput({ schemaVersion: 1, issues: [{ ...raw, evidenceRefs: ['rule:mind'] }] }, context), NarrativeInspectorError);
});

test('全文検査のrequired欠落をchapter locationで受理し、部分rangeでは拒否する', () => {
  const value = source('静かな朝だった。');
  value.narrativeRules.push({ id: 'opening', projectId: 'p1', title: '章冒頭で観測者を匂わせる', description: '各章冒頭に観測者の存在を示唆する。', category: 'structure', mode: 'require', priority: 80, source: 'author', active: true, overridable: false });
  const raw = { category: 'narrative_rule', issueType: 'required_rule_missing', locationKind: 'chapter', excerpt: '', startOffset: 0, endOffset: 0, explanation: '章全体で必須要素を確認できません。', suggestedDirection: '作者ルールの適用意図を確認してください。', severity: 'problem', evidenceRefs: ['rule:opening'] };
  const full = buildInspectorContext(value);
  assert.equal(validateNarrativeInspectorOutput({ schemaVersion: 1, issues: [raw] }, full).issues[0].locationKind, 'chapter');
  const partial = buildInspectorContext(value, { range: { start: 1, end: value.chapter.content.length } });
  assert.throws(() => validateNarrativeInspectorOutput({ schemaVersion: 1, issues: [raw] }, partial), NarrativeInspectorError);
  assert.match(buildNarrativeInspectorUserPrompt(partial), /required_rule_missingを返さない/);
});

test('guidanceだけのproblemとspeaker_unclear problemをcheckへ補正し記録する', () => {
  const value = source('誰かが「行こう」と言った。');
  value.narrativeRules.push({ id: 'gentle', projectId: 'p1', title: '穏やかな調子', description: '可能なら穏やかな調子を保つ。', category: 'voice', mode: 'guidance', priority: 10, source: 'author', active: true, overridable: true });
  const context = buildInspectorContext(value); const excerpt = context.inspectedText.excerpt;
  const base = { locationKind: 'excerpt', excerpt, startOffset: 0, endOffset: excerpt.length, explanation: '確認してください。', suggestedDirection: '意図を確認してください。', severity: 'problem' };
  const guidance = validateNarrativeInspectorOutput({ schemaVersion: 1, issues: [{ ...base, category: 'narrative_rule', issueType: 'rule_application_unclear', evidenceRefs: ['rule:gentle'] }] }, context).issues[0];
  assert.equal(guidance.severity, 'check'); assert.deepEqual(guidance.adjustments, ['guidance_only_problem_downgraded']);
  const unclear = validateNarrativeInspectorOutput({ schemaVersion: 1, issues: [{ ...base, category: 'voice', issueType: 'speaker_unclear', evidenceRefs: ['character:a'] }] }, context).issues[0];
  assert.equal(unclear.severity, 'check'); assert.deepEqual(unclear.adjustments, ['speaker_unclear_problem_downgraded']);
});

test('foreign Voice/Rule evidenceを拒否し、concealed Narrator voice利用時もidentityをredactする', async () => {
  const value = source('誰かの声がした。');
  value.narrators[0] = { ...value.narrators[0], name: '作者用：幽霊の太郎', identityDisclosureMode: 'concealed', identityFactId: 'identity', voiceNotes: '乾いた古風な声' };
  value.storyFacts.push({ id: 'identity', projectId: 'p1', content: '観測者は太郎の幽霊である', importance: 'high', readerInitiallyKnows: false });
  const context = buildInspectorContext(value); const excerpt = context.inspectedText.excerpt;
  const raw = { category: 'voice', issueType: 'narration_voice_mismatch', locationKind: 'excerpt', excerpt, startOffset: 0, endOffset: excerpt.length, explanation: '作者用：幽霊の太郎の声と異なる。', suggestedDirection: '観測者は太郎の幽霊である設定を確認する。', severity: 'check', evidenceRefs: ['narrator:n1'] };
  const result = await inspectBuiltContext(context, async () => JSON.stringify({ schemaVersion: 1, issues: [raw] }));
  assert.doesNotMatch(result.issues[0].explanation, /太郎の幽霊/); assert.doesNotMatch(result.issues[0].suggestedDirection, /太郎の幽霊/);
  for (const evidenceRefs of [['character:foreign'], ['relationship:foreign'], ['narrator:foreign'], ['rule:foreign']]) {
    assert.throws(() => validateNarrativeInspectorOutput({ schemaVersion: 1, issues: [{ ...raw, evidenceRefs }] }, context), NarrativeInspectorError);
  }
});
