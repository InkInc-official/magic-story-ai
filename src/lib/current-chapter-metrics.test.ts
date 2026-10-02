import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeCurrentChapterText, resolveCurrentChapterTarget, selectCurrentChapterMetrics } from './current-chapter-metrics.js';

test('Current Chapter表示値はcanonical body/Sentence/Paragraph metricsから得る', () => {
  const analysis = analyzeCurrentChapterText('一文目。\n二文目。');
  assert.deepEqual(selectCurrentChapterMetrics(analysis), {
    bodyGraphemes: analysis.metrics.bodyGraphemes,
    sentenceCount: analysis.metrics.sentenceCount,
    paragraphCount: analysis.metrics.paragraphCount,
  });
});

test('unsaved content相当の各入力は独立して最新本文を解析する', () => {
  assert.equal(selectCurrentChapterMetrics(analyzeCurrentChapterText('一文。')).bodyGraphemes, 3);
  assert.equal(selectCurrentChapterMetrics(analyzeCurrentChapterText('一文。追加。')).bodyGraphemes, 6);
});

test('空本文とseparator-only本文は本文文字数・文数・段落数が0', () => {
  for (const content of ['', '***']) {
    assert.deepEqual(selectCurrentChapterMetrics(analyzeCurrentChapterText(content)), { bodyGraphemes: 0, sentenceCount: 0, paragraphCount: 0 });
  }
});

test('emoji・surrogate pair・結合文字・variation selector・ZWJ emojiをgraphemeで数える', () => {
  const content = '😀𠮷か\u3099✈️👨‍👩‍👧‍👦';
  assert.equal(selectCurrentChapterMetrics(analyzeCurrentChapterText(content)).bodyGraphemes, 5);
});

test('LFとCRLFは本文文字数を変えない', () => {
  const lf = selectCurrentChapterMetrics(analyzeCurrentChapterText('A\nB'));
  const crlf = selectCurrentChapterMetrics(analyzeCurrentChapterText('A\r\nB'));
  assert.equal(lf.bodyGraphemes, crlf.bodyGraphemes);
  assert.equal(lf.paragraphCount, crlf.paragraphCount);
});

test('effective separatorは除外しclosed Region内candidateは本文として保持する', () => {
  assert.equal(selectCurrentChapterMetrics(analyzeCurrentChapterText('A\n***\nB')).bodyGraphemes, 2);
  assert.equal(selectCurrentChapterMetrics(analyzeCurrentChapterText('「A\n***\nB」')).bodyGraphemes, 7);
});

test('PreviewとEditorへ渡すview modelは同一analysisから決定的に得られる', () => {
  const analysis = analyzeCurrentChapterText('本文。\n次文。');
  const editorMetrics = selectCurrentChapterMetrics(analysis);
  const previewMetrics = selectCurrentChapterMetrics(analysis);
  assert.deepEqual(previewMetrics, editorMetrics);
});

test('章targetをProject targetより優先し未設定ならnullを返す', () => {
  assert.equal(resolveCurrentChapterTarget('3500', 3000), 3500);
  assert.equal(resolveCurrentChapterTarget('', 3000), 3000);
  assert.equal(resolveCurrentChapterTarget(null, null), null);
});
