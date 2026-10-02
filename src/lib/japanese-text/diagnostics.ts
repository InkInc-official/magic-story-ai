import type { LineEndingStyle, SourceLine, TextDiagnostic } from './types';

export function buildSourceDiagnostics(lines: readonly SourceLine[], lineEndingStyle: LineEndingStyle): TextDiagnostic[] {
  if (lineEndingStyle !== 'mixed') return [];
  const firstEnding = lines.find(line => line.lineEnding !== 'none')?.lineEnding;
  const firstMixedLine = lines.find(line => line.lineEnding !== 'none' && line.lineEnding !== firstEnding);
  const range = firstMixedLine?.lineEndingRange || { startOffset: 0, endOffset: 0 };
  return [{
    ...range,
    code: 'mixed_line_endings',
    severity: 'warning',
    message: 'LF、CRLF、またはCRの改行形式が混在しています。原文は変更せず、そのまま解析しました。',
  }];
}
