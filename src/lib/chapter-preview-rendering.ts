import type { SectionBreakCandidate } from './japanese-text';

function escapeHTML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Canonicalな有効区切りを使い、従来の段落分割と装飾を維持してHTMLへ変換する。 */
export function renderChapterPreviewHTML(raw: string, effectiveSectionBreaks: readonly SectionBreakCandidate[]): string {
  if (!raw.trim()) return '';

  let offset = 0;
  const parts = raw.split(/(\n+)/);
  const rendered: string[] = [];
  for (const part of parts) {
    const startOffset = offset;
    offset += part.length;
    if (!part || /^\n+$/u.test(part) || !part.trim()) continue;

    const trimmed = part.trim();
    const isEffectiveDivider = effectiveSectionBreaks.some(sectionBreak =>
      sectionBreak.markerRange.startOffset >= startOffset
      && sectionBreak.markerRange.endOffset <= offset);
    if (isEffectiveDivider) {
      rendered.push(`<p class="chapter-divider">${escapeHTML(trimmed)}</p>`);
    } else if (/^[「"《]/u.test(trimmed)) {
      rendered.push(`<p class="chapter-dialogue">${escapeHTML(trimmed)}</p>`);
    } else if (/^[（(]/u.test(trimmed)) {
      rendered.push(`<p class="chapter-inner-thought">${escapeHTML(trimmed)}</p>`);
    } else {
      rendered.push(`<p class="chapter-paragraph">${escapeHTML(trimmed)}</p>`);
    }
  }
  return rendered.join('');
}
