import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildCharacterKnowledgeContextEntries, CHARACTER_KNOWLEDGE_REVIEW_GUIDANCE, deriveCharacterKnowledgeState, validateCharacterKnowledgeInput, type CharacterKnowledgeEvent } from './character-knowledge.js';
import type { StoryFactValue } from './story-facts.js';

const chapter = (id: string, order: number) => ({ id, order, title: id });
const event = (overrides: Partial<CharacterKnowledgeEvent> = {}): CharacterKnowledgeEvent => ({ id: 'e', factId: 'f', characterId: 'c', status: 'knows', effectiveChapterId: null, ...overrides });
const fact: StoryFactValue = { id: 'f', content: '美咲が犯人である', importance: 'high', readerInitiallyKnows: false };
const context = { chapterId: 'c5', chapterOrder: 5, chapterText: '美咲と事件を調べる' };

describe('CharacterKnowledge validation', () => {
  test('rejects invalid status and false belief without beliefNotes', () => {
    assert.ok(validateCharacterKnowledgeInput({ factId: 'f', characterId: 'c', status: 'unknown' }));
    assert.ok(validateCharacterKnowledgeInput({ factId: 'f', characterId: 'c', status: 'believes_false', beliefNotes: '' }));
    assert.equal(validateCharacterKnowledgeInput({ factId: 'f', characterId: 'c', status: 'believes_false', beliefNotes: '健一が犯人だと信じる' }), null);
  });
});

describe('CharacterKnowledge state history', () => {
  test('returns unknown when no event exists', () => assert.deepEqual(deriveCharacterKnowledgeState([], 'c5', 5), { startingState: null, currentChapterChange: null }));
  test('uses story-start event as baseline', () => assert.equal(deriveCharacterKnowledgeState([event()], 'c5', 5).startingState?.id, 'e'));
  test('latest past event overrides start and older past events', () => {
    const state = deriveCharacterKnowledgeState([
      event({ id: 'start' }),
      event({ id: 'c2', effectiveChapterId: 'c2', effectiveChapter: chapter('c2', 2), status: 'suspects' }),
      event({ id: 'c4', effectiveChapterId: 'c4', effectiveChapter: chapter('c4', 4), status: 'knows' }),
    ], 'c5', 5);
    assert.equal(state.startingState?.id, 'c4');
  });
  test('separates current change and excludes future event', () => {
    const current = event({ id: 'current', effectiveChapterId: 'c5', effectiveChapter: chapter('c5', 5), status: 'suspects' });
    const future = event({ id: 'future', effectiveChapterId: 'c6', effectiveChapter: chapter('c6', 6), status: 'knows' });
    const state = deriveCharacterKnowledgeState([event({ id: 'start' }), current, future], 'c5', 5);
    assert.equal(state.startingState?.id, 'start');
    assert.equal(state.currentChapterChange?.id, 'current');
  });
});

describe('POV and perception prompt boundaries', () => {
  const build = (events: CharacterKnowledgeEvent[], perspective = 'first_person') => buildCharacterKnowledgeContextEntries({ facts: [fact], events, characters: [{ id: 'c', name: '太郎' }], factContext: context, povCharacterId: 'c', perspective }).map(entry => entry.full).join('\n');
  test('formats knows, suspects, false belief and unknown distinctly', () => {
    assert.ok(build([event({ status: 'knows' })]).includes('真実として知っている'));
    assert.ok(build([event({ status: 'suspects', beliefNotes: '靴の泥が気になる' })]).includes('確定していない疑い'));
    const falseBelief = build([event({ status: 'believes_false', beliefNotes: '健一が犯人だと信じている' })]);
    assert.ok(falseBelief.includes('健一が犯人'));
    assert.ok(falseBelief.includes('作者の真実を人物の認識へ漏らさない'));
    assert.ok(build([]).includes('内面や台詞で確定事実として扱わない'));
  });
  test('applies limited POV strongly and objective POV to observable consistency', () => {
    assert.ok(build([], 'third_person_limited').includes('内面・地の文'));
    assert.ok(build([event({ status: 'suspects' })], 'third_person_objective').includes('客観描写へ内面を追加しない'));
  });
  test('includes author notes only in the full representation without changing the false belief', () => {
    const entries = buildCharacterKnowledgeContextEntries({
      facts: [fact],
      events: [event({ status: 'believes_false', beliefNotes: '健一が犯人だと確信している', notes: 'ただし内心では少し迷っている' })],
      characters: [{ id: 'c', name: '太郎' }], factContext: context, povCharacterId: 'c', perspective: 'first_person',
    });
    const entry = entries[0];
    assert.ok(entry.full.includes('健一が犯人だと確信している'));
    assert.ok(entry.full.includes('作者向け運用メモ：ただし内心では少し迷っている'));
    assert.ok(!entry.compact?.includes('ただし内心では少し迷っている'));
    assert.ok(!entry.minimum?.includes('ただし内心では少し迷っている'));
    assert.ok(entry.full.includes('作者の真実「美咲が犯人である」'));
  });
  test('review guidance covers leakage, certainty, false belief and timing', () => {
    assert.ok(CHARACTER_KNOWLEDGE_REVIEW_GUIDANCE.includes('知らない作者専用の真実'));
    assert.ok(CHARACTER_KNOWLEDGE_REVIEW_GUIDANCE.includes('疑いを確定知識'));
    assert.ok(CHARACTER_KNOWLEDGE_REVIEW_GUIDANCE.includes('認識変化より前'));
  });
});
