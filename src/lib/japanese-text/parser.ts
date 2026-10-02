import { buildSourceDiagnostics } from './diagnostics';
import { detectLineEndingStyle, scanSourceLines } from './line-scanner';
import type { JapaneseTextSourceDocument } from './types';
import { measureUnicode } from './unicode';

export const JAPANESE_TEXT_PARSER_VERSION = '5b1-v1';

export function analyzeJapaneseTextSource(text: string): JapaneseTextSourceDocument {
  const lines = scanSourceLines(text);
  const lineEndingStyle = detectLineEndingStyle(lines);
  return {
    parserVersion: JAPANESE_TEXT_PARSER_VERSION,
    source: { ...measureUnicode(text), lineEndingStyle },
    lines,
    diagnostics: buildSourceDiagnostics(lines, lineEndingStyle),
  };
}
