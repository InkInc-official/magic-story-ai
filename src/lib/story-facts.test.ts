import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildStoryFactContextEntries, classifyStoryFact, STORY_FACT_REVIEW_GUIDANCE, validateStoryFactInput, type StoryFactValue } from './story-facts.js';

const chapter = (id: string, order: number) => ({ id, order, title: `章${order}` });
const fact = (overrides: Partial<StoryFactValue> = {}): StoryFactValue => ({
  id: 'fact', content: '犯人は美咲である', importance: 'high', readerInitiallyKnows: false,
  plannedRevealChapterId: null, revealedChapterId: null, notes: '', ...overrides,
});
const context = { chapterId: 'c5', chapterOrder: 5, chapterText: '美咲が事件現場を訪れる' };

describe('StoryFact input validation', () => {
  test('rejects empty content and invalid importance', () => {
    assert.ok(validateStoryFactInput({ content: ' ', importance: 'medium', readerInitiallyKnows: false }));
    assert.ok(validateStoryFactInput({ content: '真実', importance: 'urgent', readerInitiallyKnows: false }));
  });
  test('accepts valid create and partial update values', () => {
    assert.equal(validateStoryFactInput({ content: '真実', importance: 'high', readerInitiallyKnows: false, notes: '' }), null);
    assert.equal(validateStoryFactInput({ revealedChapterId: null }, true), null);
  });
});

describe('Reader Knowledge derivation', () => {
  test('classifies initially known and previously revealed facts as reader-known', () => {
    assert.equal(classifyStoryFact(fact({ readerInitiallyKnows: true }), context), 'reader-known');
    assert.equal(classifyStoryFact(fact({ revealedChapterId: 'c4', revealedChapter: chapter('c4', 4) }), context), 'reader-known');
  });
  test('classifies current planned or actual reveal as reveal-now', () => {
    assert.equal(classifyStoryFact(fact({ plannedRevealChapterId: 'c5', plannedRevealChapter: chapter('c5', 5) }), context), 'reveal-now');
    assert.equal(classifyStoryFact(fact({ revealedChapterId: 'c5', revealedChapter: chapter('c5', 5) }), context), 'reveal-now');
  });
  test('uses actual reveal chronology for previous, current and future chapters', () => {
    assert.equal(classifyStoryFact(fact({ revealedChapterId: 'c4', revealedChapter: chapter('c4', 4) }), context), 'reader-known');
    assert.equal(classifyStoryFact(fact({ revealedChapterId: 'c5', revealedChapter: chapter('c5', 5) }), context), 'reveal-now');
    assert.equal(classifyStoryFact(fact({ revealedChapterId: 'c6', revealedChapter: chapter('c6', 6) }), context), 'hidden-relevant');
  });
  test('uses only future-near plans as proximity relevance', () => {
    assert.equal(classifyStoryFact(fact({ plannedRevealChapterId: 'c6', plannedRevealChapter: chapter('c6', 6) }), context), 'hidden-relevant');
    assert.equal(classifyStoryFact(fact({ plannedRevealChapterId: 'c3', plannedRevealChapter: chapter('c3', 3) }), context), 'hidden-relevant');
    assert.equal(classifyStoryFact(fact({ content: '王はすでに死亡している', plannedRevealChapterId: 'c4', plannedRevealChapter: chapter('c4', 4) }), context), 'excluded');
  });
  test('actual earlier reveal overrides a later plan', () => {
    assert.equal(classifyStoryFact(fact({ plannedRevealChapterId: 'c8', plannedRevealChapter: chapter('c8', 8), revealedChapterId: 'c4', revealedChapter: chapter('c4', 4) }), context), 'reader-known');
  });
  test('excludes unrelated hidden facts even when high importance', () => {
    assert.equal(classifyStoryFact(fact({ content: '王はすでに死亡している', notes: '' }), context), 'excluded');
  });
});

describe('StoryFact prompt boundaries', () => {
  test('separates known, reveal-now and hidden-relevant sections', () => {
    const entries = buildStoryFactContextEntries([
      fact({ id: 'known', readerInitiallyKnows: true }),
      fact({ id: 'now', plannedRevealChapterId: 'c5', plannedRevealChapter: chapter('c5', 5) }),
      fact({ id: 'hidden' }),
      fact({ id: 'unrelated', content: '王はすでに死亡している' }),
    ], context);
    const text = entries.map(entry => entry.full).join('\n');
    assert.ok(text.includes('読者に開示済み'));
    assert.ok(text.includes('この章で読者へ開示してよい'));
    assert.ok(text.includes('作者専用：この章では直接明かさない'));
    assert.ok(!text.includes('王はすでに死亡している'));
    assert.ok(entries.every(entry => !entry.required));
  });
  test('keeps future-near facts author-only and excludes overdue unrelated facts', () => {
    const entries = buildStoryFactContextEntries([
      fact({ id: 'future-near', content: '王はすでに死亡している', plannedRevealChapterId: 'c6', plannedRevealChapter: chapter('c6', 6) }),
      fact({ id: 'overdue-unrelated', content: '遠い国の姫は生存している', plannedRevealChapterId: 'c4', plannedRevealChapter: chapter('c4', 4) }),
    ], context);
    const text = entries.map(entry => entry.full).join('\n');
    assert.ok(text.includes('王はすでに死亡している'));
    assert.ok(text.includes('作者専用：この章では直接明かさない事実'));
    assert.ok(text.includes('本文で直接明かさず'));
    assert.ok(!text.includes('遠い国の姫は生存している'));
  });
  test('review guidance checks early disclosure, planned reveal and reader-known consistency', () => {
    assert.ok(STORY_FACT_REVIEW_GUIDANCE.includes('予定より早く直接開示'));
    assert.ok(STORY_FACT_REVIEW_GUIDANCE.includes('未開示を機械的に誤りと断定しない'));
    assert.ok(STORY_FACT_REVIEW_GUIDANCE.includes('読者が知らない前提'));
  });
});
