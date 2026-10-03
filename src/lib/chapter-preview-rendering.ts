import type { SectionBreakCandidate } from './japanese-text';
import type { PreviewSemanticStyle, PreviewSymbolSemanticRange } from './symbol-dictionary/preview-semantics';

function escapeHTML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const styleClass = (style: PreviewSemanticStyle) => style === 'dialogue'
  ? 'chapter-semantic-dialogue'
  : style === 'inner_voice' ? 'chapter-semantic-inner-thought' : 'chapter-semantic-normal';

function legacyStyle(value: string): PreviewSemanticStyle {
  if (/^[「"《]/u.test(value)) return 'dialogue';
  if (/^[（(]/u.test(value)) return 'inner_voice';
  return 'normal';
}

function semanticWinner(values: readonly PreviewSymbolSemanticRange[]): PreviewSymbolSemanticRange | null {
  return [...values].sort((left, right) => right.depth - left.depth
    || (left.endOffset - left.startOffset) - (right.endOffset - right.startOffset)
    || Number(right.source === 'override') - Number(left.source === 'override'))[0] || null;
}

function renderSemanticLine(
  raw: string,
  visibleStart: number,
  visibleEnd: number,
  semantics: readonly PreviewSymbolSemanticRange[],
): { className: string; html: string } {
  const visibleText = raw.slice(visibleStart, visibleEnd);
  const fallback = legacyStyle(visibleText);
  const relevant = semantics.filter(value => value.startOffset < visibleEnd && value.endOffset > visibleStart);
  if (relevant.length === 0) {
    return {
      className: fallback === 'dialogue' ? 'chapter-dialogue' : fallback === 'inner_voice' ? 'chapter-inner-thought' : 'chapter-paragraph',
      html: escapeHTML(visibleText),
    };
  }

  const boundaries = new Set<number>([visibleStart, visibleEnd]);
  for (const value of relevant) {
    boundaries.add(Math.max(visibleStart, value.startOffset));
    boundaries.add(Math.min(visibleEnd, value.endOffset));
  }
  const sorted = [...boundaries].sort((left, right) => left - right);
  const segments: Array<{ style: PreviewSemanticStyle; text: string }> = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const startOffset = sorted[index]; const endOffset = sorted[index + 1];
    if (endOffset <= startOffset) continue;
    const winner = semanticWinner(relevant.filter(value => value.startOffset <= startOffset && value.endOffset >= endOffset));
    const style = winner?.style || fallback;
    const text = raw.slice(startOffset, endOffset);
    const previous = segments.at(-1);
    if (previous?.style === style) previous.text += text;
    else segments.push({ style, text });
  }
  const firstStyle = segments[0]?.style || fallback;
  const className = firstStyle === 'dialogue' ? 'chapter-dialogue' : firstStyle === 'inner_voice' ? 'chapter-inner-thought' : 'chapter-paragraph';
  return { className, html: segments.map(value => `<span class="${styleClass(value.style)}">${escapeHTML(value.text)}</span>`).join('') };
}

/** Canonicalな有効区切りを使い、従来互換の表示へauthor-confirmed semanticsを重ねる。 */
export function renderChapterPreviewHTML(
  raw: string,
  effectiveSectionBreaks: readonly SectionBreakCandidate[],
  semantics: readonly PreviewSymbolSemanticRange[] = [],
): string {
  if (!raw.trim()) return '';

  let offset = 0;
  const parts = raw.split(/(\n+)/);
  const rendered: string[] = [];
  const sortedSemantics = [...semantics].sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset);
  let semanticCursor = 0;
  for (const part of parts) {
    const startOffset = offset;
    offset += part.length;
    if (!part || /^\n+$/u.test(part) || !part.trim()) continue;

    const leadingLength = part.length - part.trimStart().length;
    const trailingLength = part.length - part.trimEnd().length;
    const visibleStart = startOffset + leadingLength;
    const visibleEnd = offset - trailingLength;
    const trimmed = raw.slice(visibleStart, visibleEnd);
    const isEffectiveDivider = effectiveSectionBreaks.some(sectionBreak =>
      sectionBreak.markerRange.startOffset >= startOffset
      && sectionBreak.markerRange.endOffset <= offset);
    if (isEffectiveDivider) {
      rendered.push(`<p class="chapter-divider">${escapeHTML(trimmed)}</p>`);
    } else {
      while (semanticCursor < sortedSemantics.length && sortedSemantics[semanticCursor].endOffset <= visibleStart) semanticCursor += 1;
      const lineSemantics: PreviewSymbolSemanticRange[] = [];
      for (let index = semanticCursor; index < sortedSemantics.length && sortedSemantics[index].startOffset < visibleEnd; index += 1) {
        if (sortedSemantics[index].endOffset > visibleStart) lineSemantics.push(sortedSemantics[index]);
      }
      const line = renderSemanticLine(raw, visibleStart, visibleEnd, lineSemantics);
      rendered.push(`<p class="${line.className}">${line.html}</p>`);
    }
  }
  return rendered.join('');
}
