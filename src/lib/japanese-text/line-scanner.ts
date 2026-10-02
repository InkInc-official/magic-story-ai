import type { LineEnding, LineEndingStyle, SourceLine } from './types';

function whitespaceOnly(text: string, startOffset: number, endOffset: number): boolean {
  if (startOffset === endOffset) return false;
  for (let offset = startOffset; offset < endOffset;) {
    const codePoint = String.fromCodePoint(text.codePointAt(offset)!);
    if (!/\s/u.test(codePoint)) return false;
    offset += codePoint.length;
  }
  return true;
}

export function scanSourceLines(text: string): SourceLine[] {
  if (text.length === 0) return [];
  const lines: SourceLine[] = [];
  let lineStart = 0;
  let offset = 0;

  const pushLine = (contentEnd: number, lineEnd: number, lineEnding: LineEnding) => {
    const isEmpty = contentEnd === lineStart;
    const isWhitespaceOnly = whitespaceOnly(text, lineStart, contentEnd);
    lines.push({
      index: lines.length,
      startOffset: lineStart,
      endOffset: lineEnd,
      contentRange: { startOffset: lineStart, endOffset: contentEnd },
      lineEndingRange: lineEnding === 'none' ? null : { startOffset: contentEnd, endOffset: lineEnd },
      lineEnding,
      isEmpty,
      isWhitespaceOnly,
      isBlank: isEmpty || isWhitespaceOnly,
    });
    lineStart = lineEnd;
  };

  while (offset < text.length) {
    const codeUnit = text.charCodeAt(offset);
    if (codeUnit === 0x0a) {
      pushLine(offset, offset + 1, 'lf');
      offset += 1;
    } else if (codeUnit === 0x0d) {
      const isCrLf = text.charCodeAt(offset + 1) === 0x0a;
      pushLine(offset, offset + (isCrLf ? 2 : 1), isCrLf ? 'crlf' : 'cr');
      offset += isCrLf ? 2 : 1;
    } else {
      offset += 1;
    }
  }
  if (lineStart < text.length) pushLine(text.length, text.length, 'none');
  return lines;
}

export function detectLineEndingStyle(lines: readonly SourceLine[]): LineEndingStyle {
  const endings = new Set(lines.map(line => line.lineEnding).filter((value): value is Exclude<LineEnding, 'none'> => value !== 'none'));
  if (endings.size === 0) return 'none';
  if (endings.size > 1) return 'mixed';
  return endings.values().next().value!;
}
