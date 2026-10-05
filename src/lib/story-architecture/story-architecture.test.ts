import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reorderIntegerPositions, sortByPresentationOrder, sortByStoryOrder, validateStoryArchitecture,
  withDesignStatus, withPresentationOrder, withStoryOrder,
  type StoryArchitecture, type StoryArchitectureBeat, type StoryArchitectureConstraint,
  type StoryArchitectureQuestion, type StoryArchitectureThread,
} from './index.js';

const thread = (overrides: Partial<StoryArchitectureThread> = {}): StoryArchitectureThread => ({
  id: 'thread-1', architectureId: 'architecture-1', title: '主人公の選択', description: '', threadType: 'character',
  customTypeLabel: null, status: 'draft', provenance: 'author', order: 0, revision: 1, ...overrides,
});
const beat = (overrides: Partial<StoryArchitectureBeat> = {}): StoryArchitectureBeat => ({
  id: 'beat-1', architectureId: 'architecture-1', threadId: null, title: '静かな認識', summary: '', intention: '',
  storyOrder: null, presentationOrder: null, chapterId: null, rhythm: null, customRhythmLabel: null,
  status: 'draft', provenance: 'author', revision: 1, ...overrides,
});
const constraint = (overrides: Partial<StoryArchitectureConstraint> = {}): StoryArchitectureConstraint => ({
  id: 'constraint-1', architectureId: 'architecture-1', title: '秘密', statement: '第三章までは犯人を確定させない',
  mode: 'required', scope: 'architecture', threadId: null, beatId: null, order: 0,
  status: 'draft', provenance: 'author', revision: 1, ...overrides,
});
const question = (overrides: Partial<StoryArchitectureQuestion> = {}): StoryArchitectureQuestion => ({
  id: 'question-1', architectureId: 'architecture-1', question: '帰郷する理由をどうするか？', notes: '', state: 'open', resolution: null,
  scope: 'architecture', threadId: null, beatId: null, order: 0, status: 'draft', provenance: 'author', revision: 1, ...overrides,
});
const architecture = (overrides: Partial<StoryArchitecture> = {}): StoryArchitecture => ({
  id: 'architecture-1', projectId: 'project-1', title: '作品設計', frameworkMode: 'freeform', customFrameworkNotes: '',
  canonMode: 'respect_current_canon', notes: '', revision: 1, threads: [], beats: [], constraints: [], questions: [], relations: [], decisions: [], ...overrides,
});
const rejects = (value: StoryArchitecture, pattern?: RegExp) => pattern
  ? assert.throws(() => validateStoryArchitecture(value), pattern)
  : assert.throws(() => validateStoryArchitecture(value));

test('empty and every partial architecture are valid', () => {
  assert.equal(validateStoryArchitecture(architecture()).threads.length, 0);
  for (const value of [architecture({ threads: [thread()] }), architecture({ beats: [beat()] }), architecture({ constraints: [constraint()] }), architecture({ questions: [question()] })]) {
    assert.equal(validateStoryArchitecture(value), value);
  }
  const mixed = architecture({ threads: [thread()], beats: [beat({ threadId: 'thread-1' })], constraints: [constraint({ scope: 'beat', beatId: 'beat-1' })], questions: [question({ scope: 'thread', threadId: 'thread-1' })] });
  assert.equal(validateStoryArchitecture(mixed), mixed);
});

test('framework and canon modes are bounded without implying external mutation', () => {
  validateStoryArchitecture(architecture({ frameworkMode: 'custom', customFrameworkNotes: '断章形式', canonMode: 'revise_canon' }));
  rejects(architecture({ frameworkMode: 'custom', customFrameworkNotes: ' ' }), /customFrameworkNotes/);
  rejects(architecture({ frameworkMode: 'freeform', customFrameworkNotes: '三幕' }), /freeform/);
  rejects(architecture({ canonMode: 'invalid' as never }), /canonMode/);
  const revised = validateStoryArchitecture(architecture({ canonMode: 'revise_canon' }));
  assert.deepEqual(Object.keys(revised).filter(key => /canonWrite|mutation|apply/i.test(key)), []);
});

test('design status, provenance and decisions remain separate workflow concepts', () => {
  for (const status of ['draft', 'proposed', 'approved', 'retired'] as const) validateStoryArchitecture(architecture({ threads: [thread({ status })] }));
  for (const provenance of ['author', 'ai_proposal', 'imported'] as const) validateStoryArchitecture(architecture({ threads: [thread({ provenance })] }));
  const aiApproved = withDesignStatus(thread({ provenance: 'ai_proposal', status: 'proposed' }), 'approved');
  assert.equal(aiApproved.status, 'approved'); assert.equal(aiApproved.provenance, 'ai_proposal');
  for (const status of ['canon', 'applied', 'rejected']) rejects(architecture({ threads: [thread({ status: status as never })] }), /status/);
  for (const decision of ['approved', 'rejected', 'held'] as const) validateStoryArchitecture(architecture({ threads: [thread()], decisions: [{ id: `decision-${decision}`, architectureId: 'architecture-1', itemType: 'thread', itemId: 'thread-1', decision, note: '' }] }));
  rejects(architecture({ threads: [thread()], decisions: [{ id: 'decision-1', architectureId: 'architecture-1', itemType: 'thread', itemId: 'thread-1', decision: 'alternative' as never, note: '' }] }), /Decision/);
});

test('thread custom type has an exact custom-label contract', () => {
  validateStoryArchitecture(architecture({ threads: [thread({ threadType: 'custom', customTypeLabel: '記憶の継承' })] }));
  rejects(architecture({ threads: [thread({ threadType: 'custom', customTypeLabel: null })] }), /custom label/);
  rejects(architecture({ threads: [thread({ customTypeLabel: '不要' })] }), /custom以外/);
});

test('Beat may have no Thread, Chapter or order and never converts to an external model', () => {
  const value = validateStoryArchitecture(architecture({ beats: [beat()] })).beats[0];
  assert.equal(value.threadId, null); assert.equal(value.chapterId, null); assert.equal(value.storyOrder, null); assert.equal(value.presentationOrder, null);
  assert.deepEqual(Object.keys(value).filter(key => /chapterContent|scene|meaningEvent|storyFact/i.test(key)), []);
});

test('story and presentation order remain independent and nonlinear order is valid', () => {
  const values = [beat({ id: 'a', storyOrder: 1, presentationOrder: 3 }), beat({ id: 'b', storyOrder: 2, presentationOrder: 1 }), beat({ id: 'c', storyOrder: 3, presentationOrder: 2 })];
  validateStoryArchitecture(architecture({ beats: values }));
  assert.deepEqual(sortByStoryOrder(values).map(value => value.id), ['a', 'b', 'c']);
  assert.deepEqual(sortByPresentationOrder(values).map(value => value.id), ['b', 'c', 'a']);
  const storyChanged = withStoryOrder(values[0], 9); assert.equal(storyChanged.presentationOrder, 3);
  const presentationChanged = withPresentationOrder(values[0], 7); assert.equal(presentationChanged.storyOrder, 1);
});

test('qualitative rhythm is bounded and contains no numeric score', () => {
  for (const rhythm of ['build', 'release', 'quiet', 'aftermath', 'uncertainty', 'transition'] as const) validateStoryArchitecture(architecture({ beats: [beat({ rhythm })] }));
  validateStoryArchitecture(architecture({ beats: [beat({ rhythm: 'custom', customRhythmLabel: '反復する静けさ' })] }));
  rejects(architecture({ beats: [beat({ rhythm: 'custom' })] }), /custom rhythm/);
  assert.deepEqual(Object.keys(beat()).filter(key => /score/i.test(key)), []);
});

test('constraint modes and scopes enforce one source of target identity', () => {
  for (const mode of ['required', 'forbidden', 'preferred'] as const) validateStoryArchitecture(architecture({ constraints: [constraint({ mode })] }));
  validateStoryArchitecture(architecture({ threads: [thread()], constraints: [constraint({ scope: 'thread', threadId: 'thread-1' })] }));
  validateStoryArchitecture(architecture({ beats: [beat()], constraints: [constraint({ scope: 'beat', beatId: 'beat-1' })] }));
  rejects(architecture({ constraints: [constraint({ scope: 'architecture', threadId: 'thread-1' })] }), /architecture scope/);
  rejects(architecture({ threads: [thread()], beats: [beat({ threadId: 'thread-1' })], constraints: [constraint({ scope: 'beat', beatId: 'beat-1', threadId: 'thread-1' })] }), /beat scope/);
  rejects(architecture({ constraints: [constraint({ mode: 'invalid' as never })] }), /constraint mode/);
});

test('Question supports intentional uncertainty and exact resolution states', () => {
  validateStoryArchitecture(architecture({ questions: [question({ state: 'open' }), question({ id: 'q2', state: 'deferred' })] }));
  validateStoryArchitecture(architecture({ questions: [question({ state: 'resolved', resolution: '故郷の図書館を守るため' })] }));
  rejects(architecture({ questions: [question({ state: 'resolved', resolution: null })] }), /回答/);
  rejects(architecture({ questions: [question({ state: 'resolved', resolution: '   ' })] }), /resolution/);
  rejects(architecture({ questions: [question({ state: 'open', resolution: '仮回答' })] }), /未解決/);
  validateStoryArchitecture(architecture({ threads: [thread()], questions: [question({ scope: 'thread', threadId: 'thread-1' })] }));
  validateStoryArchitecture(architecture({ beats: [beat()], questions: [question({ scope: 'beat', beatId: 'beat-1' })] }));
});

test('relation ownership, self-reference and duplicate invariants are deterministic', () => {
  const beats = [beat({ id: 'a' }), beat({ id: 'b' })];
  for (const type of ['precedes', 'depends_on', 'causes', 'enables'] as const) validateStoryArchitecture(architecture({ beats, relations: [{ id: `r-${type}`, architectureId: 'architecture-1', fromBeatId: 'a', toBeatId: 'b', type }] }));
  rejects(architecture({ beats, relations: [{ id: 'r', architectureId: 'architecture-1', fromBeatId: 'a', toBeatId: 'a', type: 'precedes' }] }), /self relation/);
  rejects(architecture({ beats, relations: [{ id: 'r1', architectureId: 'architecture-1', fromBeatId: 'a', toBeatId: 'b', type: 'precedes' }, { id: 'r2', architectureId: 'architecture-1', fromBeatId: 'a', toBeatId: 'b', type: 'precedes' }] }), /重複/);
  rejects(architecture({ beats, relations: [{ id: 'r', architectureId: 'other', fromBeatId: 'a', toBeatId: 'b', type: 'precedes' }] }), /別Architecture/);
  rejects(architecture({ beats: [beat({ id: 'a' }), beat({ id: 'foreign', architectureId: 'other' })] }), /別Architecture/);
});

test('precedes and depends_on reject cycles while causes and enables permit semantic feedback', () => {
  const beats = [beat({ id: 'a' }), beat({ id: 'b' }), beat({ id: 'c' })];
  for (const type of ['precedes', 'depends_on'] as const) rejects(architecture({ beats, relations: [
    { id: `${type}-1`, architectureId: 'architecture-1', fromBeatId: 'a', toBeatId: 'b', type },
    { id: `${type}-2`, architectureId: 'architecture-1', fromBeatId: 'b', toBeatId: 'c', type },
    { id: `${type}-3`, architectureId: 'architecture-1', fromBeatId: 'c', toBeatId: 'a', type },
  ] }), /cycle/);
  for (const type of ['causes', 'enables'] as const) validateStoryArchitecture(architecture({ beats, relations: [
    { id: `${type}-1`, architectureId: 'architecture-1', fromBeatId: 'a', toBeatId: 'b', type },
    { id: `${type}-2`, architectureId: 'architecture-1', fromBeatId: 'b', toBeatId: 'a', type },
  ] }));
  validateStoryArchitecture(architecture({ beats: [beat({ storyOrder: 1, presentationOrder: 2 }), beat({ id: 'b', storyOrder: 2, presentationOrder: 1 })] }));
});

test('ordering is stable, null-last, dense and rejects incomplete reorder input', () => {
  const values = [beat({ id: 'null-a' }), beat({ id: 'two', storyOrder: 2 }), beat({ id: 'null-b' }), beat({ id: 'one', storyOrder: 1 })];
  assert.deepEqual(sortByStoryOrder(values).map(value => value.id), ['one', 'two', 'null-a', 'null-b']);
  const threads = [thread({ id: 'a', order: 8 }), thread({ id: 'b', order: 2 }), thread({ id: 'c', order: 99 })];
  assert.deepEqual(reorderIntegerPositions(threads, ['c', 'a', 'b']).map(value => [value.id, value.order]), [['c', 0], ['a', 1], ['b', 2]]);
  assert.throws(() => reorderIntegerPositions(threads, ['a', 'a', 'b']));
});

test('raw Japanese, CRLF, normalization forms, emoji, ZWJ and whitespace round-trip without rewriting', () => {
  const raw = '  日本語\r\nか\u3099 / が / 😀 / 👩‍👩‍👧‍👦  ';
  const value = architecture({ notes: raw, threads: [thread({ description: raw })], beats: [beat({ summary: raw })] });
  const result = validateStoryArchitecture(JSON.parse(JSON.stringify(value)) as StoryArchitecture);
  assert.equal(result.notes, raw); assert.equal(result.threads[0].description, raw); assert.equal(result.beats[0].summary, raw);
  assert.notEqual(result.notes.indexOf('か\u3099'), -1); assert.notEqual(result.notes.indexOf('が'), -1);
});

test('length, ID, revision and finite integer contracts reject invalid input without trimming valid storage', () => {
  rejects(architecture({ title: 'x'.repeat(201) }), /title/);
  rejects(architecture({ revision: 0 }), /revision/);
  rejects(architecture({ threads: [thread({ order: Number.POSITIVE_INFINITY })] }), /有限整数/);
  rejects(architecture({ beats: [beat({ storyOrder: -1 })] }), /有限整数/);
  const spaced = architecture({ title: '  作品設計  ' }); assert.equal(validateStoryArchitecture(spaced).title, '  作品設計  ');
});

test('literary fixtures allow mystery, romance, literary, ensemble, static, negative, open, episodic and slice-of-life designs', () => {
  const threads = [
    thread({ id: 'mystery', title: '真相の提示順', threadType: 'mystery' }),
    thread({ id: 'romance', title: '距離が縮まらない関係', threadType: 'relationship', order: 1 }),
    thread({ id: 'static', title: '変化しない観察者', description: '主人公は変化しない', threadType: 'character', order: 2 }),
    thread({ id: 'negative', title: '破滅への選択', threadType: 'character', order: 3 }),
    thread({ id: 'open', title: '未解決の問い', threadType: 'theme', order: 4 }),
    thread({ id: 'ensemble', title: '群像', threadType: 'custom', customTypeLabel: '複数視点', order: 5 }),
  ];
  const beats = [
    beat({ id: 'reveal-plan', threadId: 'mystery', title: '読者への提示を遅らせる', rhythm: 'uncertainty' }),
    beat({ id: 'quiet', threadId: 'static', title: '窓辺で季節の変化に気づく', rhythm: 'quiet' }),
    beat({ id: 'regression', threadId: 'negative', title: '以前の選択へ戻る', rhythm: 'aftermath' }),
    beat({ id: 'episode', title: '独立した一日', rhythm: 'release' }),
  ];
  const value = validateStoryArchitecture(architecture({ threads, beats }));
  assert.equal(value.relations.length, 0); assert.equal(value.threads.find(item => item.id === 'open')?.status, 'draft');
  assert.deepEqual(Object.keys(value).filter(key => /relationshipMutation|authorTruth|growthRequired|resolutionRequired|score/i.test(key)), []);
});
