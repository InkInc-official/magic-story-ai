import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeJapaneseTextSource, BUILTIN_SECTION_BREAKS } from './japanese-text/index.js';
import { renderChapterPreviewHTML } from './chapter-preview-rendering.js';
import type { PreviewSymbolSemanticRange } from './symbol-dictionary/preview-semantics.js';

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

const semantic = (startOffset: number, endOffset: number, style: PreviewSymbolSemanticRange['style'], depth = 0, source: PreviewSymbolSemanticRange['source'] = 'default'): PreviewSymbolSemanticRange => ({ startOffset, endOffset, style, depth, source, definitionId: 'definition' });

test('inline semantic rangeだけを装飾し、confirmed normalでlegacyを抑止する', () => {
  const inline = '彼は「行く」と言った。'; const start = inline.indexOf('「'); const end = inline.indexOf('」') + 1;
  const html = renderChapterPreviewHTML(inline, [], [semantic(start, end, 'dialogue')]);
  assert.match(html, /^<p class="chapter-paragraph"><span class="chapter-semantic-normal">彼は<\/span><span class="chapter-semantic-dialogue">「行く」<\/span><span class="chapter-semantic-normal">と言った。<\/span><\/p>$/u);
  const suppressed = renderChapterPreviewHTML('《表示》', [], [semantic(0, 4, 'normal')]);
  assert.doesNotMatch(suppressed, /chapter-dialogue/u);
  assert.match(suppressed, /chapter-semantic-normal/u);
});

test('nested semanticはdeeper rangeがouter visualを上書きする', () => {
  const text = '「外『内』外」'; const innerStart = text.indexOf('『'); const innerEnd = text.indexOf('』') + 1;
  const html = renderChapterPreviewHTML(text, [], [semantic(0, text.length, 'dialogue'), semantic(innerStart, innerEnd, 'normal', 1)]);
  assert.match(html, /chapter-semantic-dialogue">「外<\/span><span class="chapter-semantic-normal">『内』<\/span><span class="chapter-semantic-dialogue">外」<\/span>/u);
});

test('same occurrenceのmulti-trueは決定済みinner visualを表示できる', () => {
  assert.match(renderChapterPreviewHTML('「内心」', [], [semantic(0, 4, 'inner_voice', 0, 'override')]), /chapter-semantic-inner-thought/u);
});

test('offsetはindentation・blank line・CRLF・Unicode raw sourceでずれない', () => {
  const family = '👨‍👩‍👧‍👦'; const combining = 'か\u3099'; const text = `  前${family}\r\n\r\n「${combining}」`;
  const start = text.indexOf('「'); const end = text.length;
  const html = renderChapterPreviewHTML(text, [], [semantic(start, end, 'inner_voice')]);
  assert.match(html, new RegExp(`<span class="chapter-semantic-inner-thought">「${combining}」<\\/span>`, 'u'));
  assert.equal((html.match(/<p /g) || []).length, 2);
  assert.ok(html.includes(family));
});

test('effective Section dividerはsemantic decoration追加後も維持する', () => {
  const text = '「前」\n***\n「後」'; const analysis = analyzeJapaneseTextSource(text);
  const html = renderChapterPreviewHTML(text, analysis.effectiveSectionBreaks, [semantic(0, 3, 'inner_voice')]);
  assert.match(html, /chapter-divider[^>]*>\*\*\*</u);
});
