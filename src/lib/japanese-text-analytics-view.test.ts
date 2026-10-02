import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeJapaneseTextSource } from './japanese-text/index.js';
import { buildJapaneseTextAnalyticsViewModel } from './japanese-text-analytics-view.js';

test('ending distributions and unmatched count are projected without re-analysis', () => {
  const analysis = analyzeJapaneseTextSource('歩いた。見た。海辺。');
  const model = buildJapaneseTextAnalyticsViewModel(analysis);
  assert.deepEqual(model.exactEndingDistribution.map(value => [value.value, value.count]), [['歩いた', 1], ['見た', 1], ['海辺', 1]]);
  assert.deepEqual(model.patternDistribution.map(value => [value.value, value.count]), [['た', 2]]);
  assert.equal(model.unmatchedPatternCount, 1);
  assert.equal(model.exactSurfaceMaximumGraphemes, 8);
});

test('streaks remain section-local and expose neutral source positions', () => {
  const continuous = buildJapaneseTextAnalyticsViewModel(analyzeJapaneseTextSource('歩いた。見た。笑った。'));
  assert.deepEqual(continuous.streaks.map(value => [value.pattern, value.count, value.startSentenceIndex, value.endSentenceIndex]), [['た', 3, 0, 2]]);
  const separated = buildJapaneseTextAnalyticsViewModel(analyzeJapaneseTextSource('歩いた。見た。\n***\n笑った。'));
  assert.equal(separated.streaks.length, 0);
});

test('rolling concentrations retain actual short window size and suppress overlapping duplicates', () => {
  const short = buildJapaneseTextAnalyticsViewModel(analyzeJapaneseTextSource('歩いた。見た。'));
  assert.deepEqual(short.concentrations.map(value => [value.pattern, value.windowSize, value.occurrenceCount]), [['た', 2, 2]]);
  const rolling = buildJapaneseTextAnalyticsViewModel(analyzeJapaneseTextSource('歩いた。見る。笑った。走る。止まった。振り向いた。'));
  const ta = rolling.concentrations.filter(value => value.pattern === 'た');
  assert.ok(ta.length >= 1);
  for (let index = 1; index < ta.length; index += 1) {
    assert.ok(ta[index - 1].endSentenceIndex < ta[index].startSentenceIndex);
  }
});

test('section summaries follow canonical effective sections including empty and CRLF sections', () => {
  assert.equal(buildJapaneseTextAnalyticsViewModel(analyzeJapaneseTextSource('本文。')).sectionCount, 1);
  const effective = buildJapaneseTextAnalyticsViewModel(analyzeJapaneseTextSource('前。\r\n***\r\n後。'));
  assert.equal(effective.sectionCount, 2);
  assert.deepEqual(effective.sections.map(value => [value.bodyGraphemes, value.sentenceCount, value.paragraphCount]), [[2, 1, 1], [2, 1, 1]]);
  assert.equal(buildJapaneseTextAnalyticsViewModel(analyzeJapaneseTextSource('「前。\n***\n後。」')).sectionCount, 1);
  assert.deepEqual(buildJapaneseTextAnalyticsViewModel(analyzeJapaneseTextSource('***\n***')).sections.map(value => value.bodyGraphemes), [0, 0, 0]);
});

test('view model contains observations only and no quality judgments', () => {
  const model = buildJapaneseTextAnalyticsViewModel(analyzeJapaneseTextSource('歩いた。')) as unknown as Record<string, unknown>;
  for (const key of ['score', 'warning', 'recommendation', 'good', 'bad', 'quality']) assert.equal(key in model, false);
});
