import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInspectorContext, INSPECTOR_CONTEXT_HARD_CAP, InspectorContextBudgetError, InspectorContextInputError, resolveInspectorCharacterTimeline, resolveReaderKnowledgeAtChapter, type InspectorSources, type InspectorStoryFact } from './inspector-context.js';
import { buildContextFingerprint, decisionIsFresh } from './narrative-inspector-persistence.js';
import { learningSessionIsFresh } from './narrative-learning.js';

const chapters = {
  previous: { id: 'c1', projectId: 'p1', order: 1, title: '前章' },
  current: { id: 'c2', projectId: 'p1', order: 2, title: '現在章' },
  future: { id: 'c3', projectId: 'p1', order: 3, title: '次章' },
};

function fact(overrides: Partial<InspectorStoryFact> = {}): InspectorStoryFact {
  return { id: 'fact', projectId: 'p1', content: '観測者は太郎の幽霊である', importance: 'high', readerInitiallyKnows: false, ...overrides };
}

function source(): InspectorSources {
  return {
    project: { id: 'p1', narrativePerspective: 'first_person', defaultPovCharacterId: 'taro', defaultNarratorId: 'ghost' },
    chapter: { id: 'c2', projectId: 'p1', order: 2, title: '友人たちの会話', content: '友人たちは、いなくなった太郎について話していた。\n誰にも見えない場所から、その声を聞いている者がいた。', povCharacterId: 'taro', narratorId: 'ghost', updatedAt: null },
    characters: [
      { id: 'taro', projectId: 'p1', name: '太郎', firstPerson: '僕', narrationVoiceNotes: '名乗らず静かに観測する。' },
      { id: 'hana', projectId: 'p1', name: '花子', firstPerson: '私', defaultSecondPerson: 'あなた', speechRegister: 'plain', speechStyleNotes: '短く話す。' },
      { id: 'irrelevant', projectId: 'p1', name: '無関係人物', speechStyleNotes: '投入しない。' },
    ],
    narrators: [{ id: 'ghost', projectId: 'p1', name: '作者用：幽霊の太郎', description: '正体を伏せた観測者', voiceNotes: '名前を明かさず描写する。', linkedCharacterId: 'taro', identityFactId: 'fact', identityDisclosureMode: 'concealed' }],
    cast: [{ chapterId: 'c2', characterId: 'hana', participation: 'present', notes: '', order: 0 }],
    narrativeRules: [{ id: 'rule', projectId: 'p1', title: '正体を伏せる', description: '開示前は観測者の名前を本文へ出さない。', category: 'disclosure', mode: 'forbid', priority: 100, source: 'author', machineKey: 'identity_hidden', active: true, overridable: false, updatedAt: '2026-10-02T00:00:00Z' }],
    storyFacts: [fact()],
    characterKnowledge: [{ id: 'belief', factId: 'fact', characterId: 'taro', status: 'believes_false', effectiveChapterId: null, beliefNotes: '自分はまだ生きている', notes: '', updatedAt: '2026-10-02T00:00:00Z', effectiveChapter: null }],
    relationships: [
      { id: 'relevant-rel', projectId: 'p1', fromCharacterId: 'taro', toCharacterId: 'hana', type: '友人', addressTerm: '花子' },
      { id: 'irrelevant-rel', projectId: 'p1', fromCharacterId: 'irrelevant', toCharacterId: 'hana', type: '知人' },
    ],
  };
}

test('Reader Knowledgeをbefore / during / hidden / futureへ分離する', () => {
  assert.equal(resolveReaderKnowledgeAtChapter(fact({ readerInitiallyKnows: true }), 'c2', 2).phase, 'known_before');
  assert.equal(resolveReaderKnowledgeAtChapter(fact({ revealedChapterId: 'c1', revealedChapter: chapters.previous }), 'c2', 2).phase, 'known_before');
  const during = resolveReaderKnowledgeAtChapter(fact({ revealedChapterId: 'c2', revealedChapter: chapters.current }), 'c2', 2);
  assert.equal(during.phase, 'revealed_during'); assert.equal(during.knownBeforeChapter, false); assert.equal(during.hiddenAtChapterStart, true);
  assert.equal(resolveReaderKnowledgeAtChapter(fact({ plannedRevealChapterId: 'c2', plannedRevealChapter: chapters.current }), 'c2', 2).phase, 'hidden_at_start');
  assert.equal(resolveReaderKnowledgeAtChapter(fact({ revealedChapterId: 'c3', revealedChapter: chapters.future }), 'c2', 2).phase, 'future_reveal');
});

test('CharacterKnowledgeを章前の最新・章中変化・未来へ分離する', () => {
  const events = [
    { id: 'base', factId: 'fact', characterId: 'taro', status: 'suspects', effectiveChapterId: null },
    { id: 'past', factId: 'fact', characterId: 'taro', status: 'believes_false', effectiveChapterId: 'c1', effectiveChapter: chapters.previous },
    { id: 'during', factId: 'fact', characterId: 'taro', status: 'knows', effectiveChapterId: 'c2', effectiveChapter: chapters.current },
    { id: 'future', factId: 'fact', characterId: 'taro', status: 'knows', effectiveChapterId: 'c3', effectiveChapter: chapters.future },
  ];
  const result = resolveInspectorCharacterTimeline(events, 'c2', 2);
  assert.equal(result.beforeChapter?.id, 'past');
  assert.deepEqual(result.changesDuringChapter.map(value => value.id), ['during']);
  assert.deepEqual(result.future.map(value => value.id), ['future']);
});

test('Secret POVのAuthor-sideとReader stateを分離し、Castを増やさない', () => {
  const result = buildInspectorContext(source());
  assert.equal(result.roles.pov?.id, 'taro');
  assert.equal(result.roles.narrator?.id, 'ghost');
  assert.deepEqual(result.roles.cast.map(value => value.characterId), ['hana']);
  assert.equal(result.roles.narratorIdentity?.authorSide, true);
  assert.equal(result.roles.narratorIdentity?.readerState?.phase, 'hidden_at_start');
  assert.equal(result.manifest.narrator?.identityFactId, 'fact');
  assert.equal(result.manifest.narrator?.identityReaderState, 'hidden_at_start');
  assert.equal(result.manifest.narrativeRules[0].id, 'rule');
});

test('identityが前章で開示済みならconcealed設定とReader既知状態を両方保持する', () => {
  const value = source();
  value.storyFacts[0] = fact({ revealedChapterId: 'c1', revealedChapter: chapters.previous });
  const result = buildInspectorContext(value);
  assert.equal(result.roles.narratorIdentity?.disclosureMode, 'concealed');
  assert.equal(result.roles.narratorIdentity?.readerState?.phase, 'known_before');
});

test('Author TruthとNarrator linked Characterの誤認を上書きせず別々に保持する', () => {
  const result = buildInspectorContext(source());
  assert.equal(result.knowledge.authorTruth[0].content, '観測者は太郎の幽霊である');
  assert.equal(result.knowledge.narratorKnowledgeSource.type, 'linked_character_default');
  const perception = result.knowledge.characters.find(value => value.characterId === 'taro' && value.factId === 'fact');
  assert.equal(perception?.beforeChapter?.status, 'believes_false');
  assert.equal(perception?.beforeChapter?.beliefNotes, '自分はまだ生きている');
});

test('Character linkなしNarratorはKnowledge sourceをunspecifiedにする', () => {
  const value = source(); value.narrators[0] = { ...value.narrators[0], linkedCharacterId: null };
  assert.equal(buildInspectorContext(value).knowledge.narratorKnowledgeSource.type, 'unspecified');
});

test('POV voiceとNarrator voiceを分離し、関連人物間のRelationshipだけを含める', () => {
  const result = buildInspectorContext(source());
  assert.equal(result.voices.povNarrationVoiceNotes, '名乗らず静かに観測する。');
  assert.equal(result.voices.narratorVoiceNotes, '名前を明かさず描写する。');
  assert.deepEqual(result.voices.relationships.map(value => value.id), ['relevant-rel']);
  assert.equal(result.voices.characters.some(value => value.id === 'irrelevant'), false);
});

test('Ruleのpriority・provenance・unknown machineKey・長文descriptionを安全に保持する', () => {
  const value = source();
  value.narrativeRules.push({ ...value.narrativeRules[0], id: 'allow', title: '読心', description: '近距離の表層思考を知覚できる。'.repeat(500), mode: 'allow', priority: 50, machineKey: 'custom_unknown', updatedAt: '2026-10-02T01:00:00Z' });
  value.narrativeRules.push({ ...value.narrativeRules[0], id: 'inactive', active: false, priority: 999 });
  const result = buildInspectorContext(value);
  assert.deepEqual(result.rules.map(rule => rule.id), ['rule', 'allow']);
  assert.equal(result.rules[1].machineKey, 'custom_unknown');
  assert.equal(result.rules[0].provenance.level, 'project');
  assert.ok(result.text.length <= INSPECTOR_CONTEXT_HARD_CAP);
  assert.equal(result.budget.included.some(item => item.representation === 'truncated'), false);
});

test('巨大本文と多数optional Knowledgeでもhard cap内でrequiredを維持する', () => {
  const value = source(); value.chapter.content = `秘密の観測者。${'長い本文。'.repeat(4000)}`;
  for (let index = 0; index < 80; index += 1) {
    value.storyFacts.push(fact({ id: `optional-${index}`, content: '秘密', notes: `任意事実${index}`, importance: 'low' }));
    value.characterKnowledge.push({ id: `event-${index}`, factId: `optional-${index}`, characterId: 'hana', status: 'suspects', effectiveChapterId: 'c1', effectiveChapter: chapters.previous });
  }
  const result = buildInspectorContext(value);
  assert.ok(result.text.length <= INSPECTOR_CONTEXT_HARD_CAP);
  assert.equal(result.manifest.truncation.inspectedText, true);
  assert.match(result.text, /検査対象本文/); assert.match(result.text, /叙述役割/); assert.match(result.text, /Authoritative Knowledge Boundary/); assert.match(result.text, /正体を伏せる/);
  assert.ok(result.manifest.omittedCategories.length > 0);
});

test('Structural surroundingを使い、検査対象rangeと14k capを維持する', () => {
  const value = source();
  value.chapter.content = '前の文。中央の文。後の文。';
  const result = buildInspectorContext(value, { range: { start: 5, end: 9 } });
  assert.deepEqual(result.inspectedText.requestedRange, { start: 5, end: 9 });
  assert.deepEqual([result.inspectedText.startOffset, result.inspectedText.endOffset, result.inspectedText.excerpt], [5, 9, value.chapter.content.slice(5, 9)]);
  assert.match(result.text, /【前後の参考文脈】/u);
  assert.doesNotMatch(result.text, /暫定文字window/u);
  assert.ok(result.text.length <= INSPECTOR_CONTEXT_HARD_CAP);
  const textStructure = result.manifest.textStructure;
  if (!textStructure) assert.fail('textStructure provenance is required');
  assert.equal(textStructure.parserVersion, '5b5-v1');
  assert.equal(textStructure.adapterVersion, 'inspector-structure-adapter-v1');
});

test('section境界を越えて通常文脈を混ぜず、区切り選択時だけ両側を参考文脈にする', () => {
  const value = source();
  value.chapter.content = '第一節の文。\n***\n第二節の文。';
  const firstSection = buildInspectorContext(value, { range: { start: 0, end: 6 } });
  assert.equal(firstSection.inspectedText.surroundingAfter.includes('第二節'), false);

  const separatorStart = value.chapter.content.indexOf('***');
  const separator = buildInspectorContext(value, { range: { start: separatorStart, end: separatorStart + 3 } });
  assert.match(separator.inspectedText.surroundingBefore, /第一節/u);
  assert.match(separator.inspectedText.surroundingAfter, /第二節/u);
});

test('巨大文と不正な括弧を安全に解析し、Inspector contextの上限を守る', () => {
  const giant = source();
  giant.chapter.content = `「${'巨大な文'.repeat(3000)}`;
  const result = buildInspectorContext(giant, { range: { start: 10, end: 30 } });
  assert.ok(result.text.length <= INSPECTOR_CONTEXT_HARD_CAP);
  const textStructure = result.manifest.textStructure;
  if (!textStructure) assert.fail('textStructure provenance is required');
  assert.ok(textStructure.diagnosticCodes.length > 0 || textStructure.fallbackReason !== null);
});

test('rollout前のlegacy fingerprintを正確に維持し、semantic変更は検知する', () => {
  const value: InspectorSources = {
    project: { id: 'p1', narrativePerspective: 'first_person', defaultPovCharacterId: 'c1' },
    chapter: { id: 'ch1', projectId: 'p1', order: 0, title: '章', content: '前の文。中央の文。後の文。', povCharacterId: 'c1', narratorId: null, updatedAt: null },
    characters: [{ id: 'c1', projectId: 'p1', name: '人物', firstPerson: '私', narrationVoiceNotes: '静かに語る' }],
    narrators: [], cast: [], narrativeRules: [], storyFacts: [], characterKnowledge: [], relationships: [],
  };
  const fingerprint = (target: InspectorSources) => buildContextFingerprint(buildInspectorContext(target, { range: { start: 5, end: 9 } }).legacyFreshnessPayload);
  const beforeAdapterFingerprint = '54a95970fbd581da2e3f9bf28ebf632ec69a20ffcae498c613fe6503bd2f3ad9';
  assert.equal(fingerprint(value), beforeAdapterFingerprint);
  const current = { contentHash: buildInspectorContext(value).inspectedText.contentHash, contextFingerprint: fingerprint(value), fingerprintVersion: 'legacy-v1' };
  assert.equal(decisionIsFresh(
    { issueFingerprint: 'issue', decidedAgainstContentHash: current.contentHash, decidedAgainstExcerpt: '本文', contextFingerprint: beforeAdapterFingerprint, fingerprintVersion: 'legacy-v1' },
    { fingerprint: 'issue', contentHash: current.contentHash, excerpt: '本文', contextFingerprint: current.contextFingerprint, fingerprintVersion: 'legacy-v1' },
    current,
  ), true);
  assert.equal(learningSessionIsFresh(
    { startingIssueFingerprint: 'issue', startingContentHash: current.contentHash, startingContextFingerprint: beforeAdapterFingerprint, fingerprintVersion: 'legacy-v1' },
    { issueFingerprint: 'issue', ...current },
  ), true);
  assert.notEqual(fingerprint({ ...value, chapter: { ...value.chapter, content: `${value.chapter.content}変更。` } }), beforeAdapterFingerprint);
  const povChanged = structuredClone(value); povChanged.characters.push({ id: 'c2', projectId: 'p1', name: '別人物' }); povChanged.chapter.povCharacterId = 'c2';
  assert.notEqual(fingerprint(povChanged), beforeAdapterFingerprint);
  const ruleChanged = structuredClone(value); ruleChanged.narrativeRules.push({ id: 'r1', projectId: 'p1', title: '規則', description: '必須条件', category: 'viewpoint', mode: 'require', priority: 10, source: 'author', active: true, overridable: false });
  assert.notEqual(fingerprint(ruleChanged), beforeAdapterFingerprint);
});

test('manifestは構造provenanceだけを持ち、作者用秘密本文を複製しない', () => {
  const result = buildInspectorContext(source());
  const textStructure = result.manifest.textStructure;
  if (!textStructure) assert.fail('textStructure provenance is required');
  assert.deepEqual(Object.keys(textStructure).sort(), ['adapterVersion', 'afterRange', 'beforeRange', 'diagnosticCodes', 'expansionMode', 'fallbackReason', 'overlappingParagraphCount', 'overlappingSentenceCount', 'parserVersion', 'sectionCount'].sort());
  assert.doesNotMatch(JSON.stringify(result.manifest), /観測者は太郎の幽霊|作者用：幽霊の太郎|自分はまだ生きている/u);
});

test('不正rangeとProject境界違反を拒否する', () => {
  assert.throws(() => buildInspectorContext(source(), { range: { start: -1, end: 2 } }), InspectorContextInputError);
  const value = source(); value.relationships[0].projectId = 'p2';
  assert.throws(() => buildInspectorContext(value), InspectorContextInputError);
  const roleValue = source(); roleValue.chapter.narratorId = 'other-project-narrator';
  assert.throws(() => buildInspectorContext(roleValue), InspectorContextInputError);
});

test('required最小表現すら収まらない場合はsemantic blockを切らず明示失敗する', () => {
  const value = source();
  for (let index = 0; index < 50; index += 1) value.narrativeRules.push({ ...value.narrativeRules[0], id: `required-rule-${index}`, title: `必須ルール${index}`, description: '必須説明'.repeat(100), priority: index });
  assert.throws(() => buildInspectorContext(value, { maxCharacters: 2000 }), InspectorContextBudgetError);
});
