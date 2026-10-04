import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildNavigatorContext } from './context.js';
import { classifyNavigatorFact, deriveNavigatorCurrentState, resolveNavigatorKnowledge } from './current-state.js';
import { STORY_NAVIGATOR_CONTEXT_HARD_CAP, type NavigatorSource } from './types.js';
import { STORY_NAVIGATOR_SYSTEM_PROMPT } from '../prompts/ja/story-navigator.js';
import type { BuiltinCreativeRuleAdoption, CustomCreativeRule } from '../creative-rules/types.js';

const chapter = (id: string, order: number, overrides: Partial<NavigatorSource['anchor']> = {}): NavigatorSource['anchor'] => ({
  id, order, title: `第${order + 1}章`, outlineContent: `outline-${id}`, content: `actual-content-${id}`, summary: `summary-${id}`, status: 'done', ...overrides,
});

function source(mode = 'reference'): NavigatorSource {
  const chapters = [chapter('c1', 1), chapter('c2', 2), chapter('c3', 3), chapter('c4', 4), chapter('c5', 5)];
  const fact = (id: string, revealedOrder?: number, plannedOrder?: number) => ({
    id, content: `truth-${id}`, importance: 'high', readerInitiallyKnows: false,
    revealedChapterId: revealedOrder === undefined ? null : `c${revealedOrder}`,
    revealedChapter: revealedOrder === undefined ? null : { id: `c${revealedOrder}`, order: revealedOrder },
    plannedRevealChapterId: plannedOrder === undefined ? null : `c${plannedOrder}`,
    plannedRevealChapter: plannedOrder === undefined ? null : { id: `c${plannedOrder}`, order: plannedOrder },
  });
  const storyFacts = [fact('past', 2), fact('anchor', 3), fact('future', 4, 4), fact('hidden', undefined, 4)];
  const event = (id: string, factId: string, effectiveOrder: number | null, status: string, beliefNotes = '') => ({
    id, factId, characterId: 'hero', status, beliefNotes, notes: '',
    effectiveChapterId: effectiveOrder === null ? null : `c${effectiveOrder}`,
    effectiveChapter: effectiveOrder === null ? null : { id: `c${effectiveOrder}`, order: effectiveOrder },
  });
  return {
    project: {
      id: 'p1', title: '作品', genre: 'unique-genre-token', description: '概要', authorIntent: '作者意図を最優先する',
      genreGuidanceMode: mode, genreGuidanceNotes: 'ジャンル指針メモ', narrativePerspective: 'first_person', writingStyleNotes: '簡潔',
    },
    anchor: chapter('c3', 3, { povCharacterId: 'hero', purpose: '転換点', chapterCharacters: [{ characterId: 'hero', participation: 'present', notes: '', order: 0, character: { id: 'hero', name: '太郎', role: '主角' } }] }),
    chapters,
    characters: [{ id: 'hero', name: '太郎', role: '主角' }],
    relationships: [{ id: 'r1', fromCharacterId: 'hero', toCharacterId: 'other', type: '盟友', description: '協力関係' }],
    storyFacts,
    characterKnowledge: [
      event('baseline', 'hidden', null, 'suspects'), event('past-event', 'hidden', 2, 'believes_false', '別人が犯人'),
      event('anchor-event', 'hidden', 3, 'knows'), event('future-event', 'hidden', 4, 'suspects'),
    ],
    storyStates: [
      { id: 's2', chapterId: 'c2', type: 'location', data: '旧地点', chapter: { id: 'c2', order: 2 } },
      { id: 's3', chapterId: 'c3', type: 'location', data: '現在地点', chapter: { id: 'c3', order: 3 } },
      { id: 's4', chapterId: 'c4', type: 'location', data: '未来地点', chapter: { id: 'c4', order: 4 } },
    ],
    outlines: [{ id: 'o1', content: 'planned-outline', version: 1 }],
    plots: [{ id: 'plot1', name: '予定筋', description: 'planned-plot-content', status: 'planned', priority: 1, order: 0 }],
    foreshadowings: [{ id: 'fo1', chapterId: 'c2', content: '未回収の鍵', expectedResolveChapter: 8, status: 'planted', importance: 'high' }],
    worldSettings: [{ id: 'w1', name: '世界', description: '背景', rules: '規則', type: 'background', order: 0 }],
    scenes: [{ id: 'sc1', name: '港', description: '夜の港', location: '港', atmosphere: '', timeOfDay: '', order: 0 }],
    storyNodes: [{ id: 'n1', title: '未来ノード', description: 'node detail', order: 0 }],
    storyEdges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2', label: '因果', edgeType: 'causal' }],
  };
}

const builtin = (values: Partial<BuiltinCreativeRuleAdoption> = {}): BuiltinCreativeRuleAdoption => ({
  id: 'creative', kind: 'builtin', techniqueKey: 'chapter_end_hook', mode: 'reference', priority: 0,
  overridable: true, authorAdjustment: '', notes: '', source: 'author', active: true, ...values,
});

const custom = (values: Partial<CustomCreativeRule> = {}): CustomCreativeRule => ({
  id: 'custom', kind: 'custom', title: '独自規則', instruction: 'CUSTOM_NAVIGATOR_TOKEN', category: 'structure',
  mode: 'required', priority: 100, overridable: false, notes: '', source: 'author', active: true, ...values,
});

describe('Navigator anchor-end temporal semantics', () => {
  test('treats past and anchor reveals as reader-known, and future reveals as hidden', () => {
    const value = source();
    assert.equal(classifyNavigatorFact(value.storyFacts[0], 3).readerState, 'reader-known');
    assert.equal(classifyNavigatorFact(value.storyFacts[1], 3).readerState, 'reader-known');
    assert.equal(classifyNavigatorFact(value.storyFacts[2], 3).readerState, 'reader-hidden');
    assert.equal(classifyNavigatorFact({ ...value.storyFacts[3], readerInitiallyKnows: true }, 3).readerState, 'reader-known');
  });

  test('uses the latest event through anchor, keeps baseline fallback, and excludes future from current', () => {
    const value = source();
    const resolved = resolveNavigatorKnowledge(value.characterKnowledge, value.storyFacts, value.characters, 3);
    assert.equal(resolved.current.find(item => item.fact.id === 'hidden')?.event.id, 'anchor-event');
    assert.deepEqual(resolved.future.map(item => item.event.id), ['future-event']);
    const baselineOnly = resolveNavigatorKnowledge(value.characterKnowledge.slice(0, 1), value.storyFacts, value.characters, 3);
    assert.equal(baselineOnly.current[0].event.id, 'baseline');
  });

  test('uses current Chapter.order after reorder instead of stored chapter ids', () => {
    const value = source();
    const reorderedFact = { ...value.storyFacts[2], revealedChapter: { id: 'c4', order: 2 } };
    assert.equal(classifyNavigatorFact(reorderedFact, 3).readerState, 'reader-known');
    const reorderedEvents = value.characterKnowledge.map(event => event.id === 'future-event'
      ? { ...event, effectiveChapter: { id: 'c4', order: 3 } }
      : event.id === 'anchor-event' ? { ...event, effectiveChapter: { id: 'c3', order: 4 } } : event);
    const resolved = resolveNavigatorKnowledge(reorderedEvents, value.storyFacts, value.characters, 3);
    assert.equal(resolved.current.find(item => item.fact.id === 'hidden')?.event.id, 'future-event');
    assert.ok(resolved.future.some(item => item.event.id === 'anchor-event'));
  });
});

describe('Navigator information separation and genre guidance', () => {
  test('keeps Actual, Canonical and Planned distinct', () => {
    const result = buildNavigatorContext(source());
    assert.match(result.context, /【Actual：/);
    assert.match(result.context, /【Canonical Current State：/);
    assert.match(result.context, /【Planned：/);
    assert.match(result.context, /truth-hidden/);
    assert.match(result.context, /Reader Hidden/);
    assert.match(result.context, /将来の人物認識変化（現在状態ではない）/);
    assert.equal(result.currentState.actual.chapters.some(item => item.id === 'c4'), false);
    assert.equal(result.currentState.canonical.characterKnowledge.some(item => item.event.id === 'future-event'), false);
  });

  test('omits genre guidance in off mode and distinguishes reference and required', () => {
    const off = buildNavigatorContext(source('off')).context;
    assert.doesNotMatch(off, /unique-genre-token|ジャンル指針メモ|ジャンル指針：/);
    assert.match(buildNavigatorContext(source('reference')).context, /ジャンル指針：参考/);
    const required = buildNavigatorContext(source('required')).context;
    assert.match(required, /ジャンル指針：必須/);
    assert.ok(required.indexOf('作者意図（AI提案より上位）') < required.indexOf('ジャンル指針：必須'));
  });
});

test('Navigator budget preserves required entries, degrades optional entries, and returns a source-only manifest', () => {
  const value = source();
  value.worldSettings = Array.from({ length: 100 }, (_, index) => ({ id: `world-${index}`, name: `世界${index}`, description: '背景'.repeat(600), rules: '規則'.repeat(500), type: 'background', order: index }));
  const result = buildNavigatorContext(value, '今回の明示指示');
  assert.ok(result.context.length <= STORY_NAVIGATOR_CONTEXT_HARD_CAP);
  assert.equal(result.manifest.version, '3b2-v2');
  assert.match(result.context, /Navigator Task/);
  assert.match(result.context, /今回の作者指示（最優先）/);
  assert.match(result.context, /作者意図（AI提案より上位）/);
  assert.match(result.context, /現在地：anchor章終了直後/);
  assert.match(result.context, /Authoritative Knowledge Boundary/);
  assert.ok(result.manifest.omittedSections.length > 0);
  assert.equal(result.manifest.finalContextLength, result.context.length);
  assert.ok(result.manifest.chapters.some(item => item.id === 'c3'));
  assert.ok(result.manifest.storyFactIds.includes('hidden'));
  assert.ok(result.manifest.characterKnowledgeIds.includes('anchor-event'));
  assert.ok(result.manifest.plotIds.includes('plot1'));
  assert.equal('content' in result.manifest, false);
  assert.doesNotMatch(JSON.stringify(result.manifest), /actual-content/);
});

test('huge author inputs stay bounded while required boundaries remain', () => {
  const value = source('required'); value.project.authorIntent = '作者意図'.repeat(10_000);
  const result = buildNavigatorContext(value, '今回の作者指示'.repeat(10_000));
  assert.ok(result.context.length <= STORY_NAVIGATOR_CONTEXT_HARD_CAP);
  assert.match(result.context, /今回の作者指示（最優先）/);
  assert.match(result.context, /作者意図（AI提案より上位）/);
  assert.match(result.context, /Authoritative Knowledge Boundary/);
  assert.match(result.context, /ジャンル指針：必須/);
  assert.ok(result.context.indexOf('今回の作者指示（最優先）') < result.context.indexOf('ジャンル指針：必須'));
});

test('derivation exposes no Proposed canon data in this phase', () => {
  const state = deriveNavigatorCurrentState(source());
  assert.deepEqual(state.proposed, []);
  assert.equal(state.canonical.storyStates[0].data, '現在地点');
});

test('Navigator prompt keeps proposals non-canon and separates knowledge layers', () => {
  assert.match(STORY_NAVIGATOR_SYSTEM_PROMPT, /非Canon/);
  assert.match(STORY_NAVIGATOR_SYSTEM_PROMPT, /Actual/);
  assert.match(STORY_NAVIGATOR_SYSTEM_PROMPT, /Author Truth、Reader Knowledge、Character Perception/);
  assert.match(STORY_NAVIGATOR_SYSTEM_PROMPT, /作者が意味を与える/);
});

describe('Navigator Creative Rules integration', () => {
  test('zero rows preserves the previous context and navigator surface selects only relevant built-ins', () => {
    const baseline = buildNavigatorContext(source()).context;
    const explicitZero = source(); explicitZero.creativeRules = [];
    assert.equal(buildNavigatorContext(explicitZero).context, baseline);

    const value = source();
    value.creativeRules = [
      builtin({ id: 'reference', mode: 'reference', authorAdjustment: '静かな局面では強制しない', notes: '😀\r\ne\u0301' }),
      builtin({ id: 'required', techniqueKey: 'causal_progression', mode: 'required' }),
      builtin({ id: 'forbidden', techniqueKey: 'cliffhanger', mode: 'forbidden' }),
      builtin({ id: 'prose', techniqueKey: 'sentence_ending_variety', mode: 'required' }),
      builtin({ id: 'inactive', techniqueKey: 'opening_hook', active: false }),
      builtin({ id: 'unknown', techniqueKey: 'future-technique' }),
      custom(),
    ];
    const result = buildNavigatorContext(value);
    assert.match(result.context, /創作ルール（物語ナビゲーター）/);
    assert.match(result.context, /\[必須\][\s\S]*因果による進行/);
    assert.match(result.context, /\[禁止\][\s\S]*クリフハンガー/);
    assert.match(result.context, /\[参考\][\s\S]*章末の引き/);
    assert.match(result.context, /静かな局面では強制しない/);
    assert.match(result.context, /😀\r\né/);
    assert.doesNotMatch(result.context, /文末の変化|CUSTOM_NAVIGATOR_TOKEN|冒頭の引き|future-technique/);
    assert.ok(result.manifest.omittedSections.includes('creative-rule:prose'));
    assert.ok(result.manifest.omittedSections.includes('creative-rule:custom'));
  });

  test('off, inactive and unset are not sent as guidance or forbidden', () => {
    const value = source(); value.creativeRules = [builtin({ mode: 'off' })];
    assert.doesNotMatch(buildNavigatorContext(value).context, /創作ルール（物語ナビゲーター）|章末の引き|\[禁止\]/);
    value.creativeRules = [builtin({ mode: 'off', active: false })];
    assert.doesNotMatch(buildNavigatorContext(value).context, /創作ルール（物語ナビゲーター）|章末の引き|\[禁止\]/);
    delete value.creativeRules;
    assert.doesNotMatch(buildNavigatorContext(value).context, /創作ルール（物語ナビゲーター）/);
  });

  test('Creative Rules retain Canon, Knowledge, non-canon and route-diversity contracts', () => {
    const value = source(); value.creativeRules = [builtin({ techniqueKey: 'reversal_catharsis', mode: 'required' })];
    const context = buildNavigatorContext(value).context;
    assert.match(context, /Canon、Canonical Current State/);
    assert.match(context, /Creative RuleからCanon、Knowledge、実在しない過去要素を推論せず/);
    assert.match(context, /Proposalは非Canon/);
    assert.match(context, /全Routeへ強制しない/);
    assert.match(context, /同じ展開の言い換えに収束させない/);
    assert.match(context, /Reader Hidden/);
  });

  test('required or forbidden overflow fails closed while reference overflow is diagnosed', () => {
    const navigatorKeys = [
      'scene_focus_change', 'scene_sequel_rhythm', 'opening_hook', 'chapter_end_hook', 'quiet_chapter_ending',
      'cliffhanger', 'staged_information_reveal', 'fair_play_clues', 'foreshadow_and_payoff', 'tension_escalation',
      'tension_release', 'causal_progression', 'three_act_structure', 'kishotenketsu', 'character_arc', 'reversal_catharsis',
    ] as const;
    const required = source();
    required.creativeRules = navigatorKeys.map((techniqueKey, index) => builtin({ id: `required-${index}`, techniqueKey, mode: 'required', authorAdjustment: '長い条件'.repeat(400) }));
    assert.throws(() => buildNavigatorContext(required), /処理を中止/);

    const reference = source();
    reference.creativeRules = navigatorKeys.map((techniqueKey, index) => builtin({ id: `reference-${index}`, techniqueKey, mode: 'reference', authorAdjustment: '長い参考'.repeat(400) }));
    const result = buildNavigatorContext(reference);
    assert.ok(result.manifest.omittedSections.some(id => id.startsWith('creative-rule:')));
    assert.ok(result.context.length <= STORY_NAVIGATOR_CONTEXT_HARD_CAP);
  });

  test('reference rules never push baseline Canon or Current State out of the context', () => {
    const value = source();
    value.worldSettings = Array.from({ length: 100 }, (_, index) => ({ id: `world-${index}`, name: `世界${index}`, description: '背景'.repeat(600), rules: '規則'.repeat(500), type: 'background', order: index }));
    const baseline = buildNavigatorContext(value);
    value.creativeRules = [builtin({ mode: 'reference', authorAdjustment: '参考条件'.repeat(300) })];
    const integrated = buildNavigatorContext(value);
    assert.deepEqual(integrated.manifest.storyFactIds, baseline.manifest.storyFactIds);
    assert.deepEqual(integrated.manifest.characterKnowledgeIds, baseline.manifest.characterKnowledgeIds);
    assert.deepEqual(integrated.manifest.storyStateIds, baseline.manifest.storyStateIds);
    assert.deepEqual(integrated.manifest.worldSettingIds, baseline.manifest.worldSettingIds);
    if (!/創作ルール（物語ナビゲーター）/.test(integrated.context)) {
      assert.ok(integrated.manifest.omittedSections.includes('creative-rule:creative'));
    }
  });
});
