import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeJapaneseTextSource, BUILTIN_SECTION_BREAKS } from './japanese-text/index.js';
import { renderChapterPreviewHTML } from './chapter-preview-rendering.js';

const render = (text: string) => {
  const analysis = analyzeJapaneseTextSource(text);
  return renderChapterPreviewHTML(text, analysis.effectiveSectionBreaks);
};

test('canonical effective separator wins preview divider styling', () => {
  assert.match(render('A\n***\nB'), /chapter-divider[^>]*>\*\*\*</u);
});

test('closed region candidate and inline marker are not preview dividers', () => {
  assert.doesNotMatch(render('「これは演出\n***\nなんだ」'), /chapter-divider/u);
  assert.doesNotMatch(render('彼は***そう思った。'), /chapter-divider/u);
});

test('all built-in effective separators receive divider styling including CRLF', () => {
  for (const definition of BUILTIN_SECTION_BREAKS) {
    assert.match(render(`前\r\n${definition.marker}\r\n後`), new RegExp(`chapter-divider[^>]*>${definition.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`));
  }
});

test('dialogue, title brackets, and inner thought keep their established styles', () => {
  const html = render('「会話」\n《題》\n（内心）\n地の文');
  assert.equal((html.match(/chapter-dialogue/g) || []).length, 2);
  assert.equal((html.match(/chapter-inner-thought/g) || []).length, 1);
  assert.equal((html.match(/chapter-paragraph/g) || []).length, 1);
});
