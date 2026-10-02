import { buildSourceDiagnostics } from './diagnostics';
import { detectLineEndingStyle, scanSourceLines } from './line-scanner';
import { scanPairedSymbolRegions } from './paired-symbols';
import type { JapaneseTextParserOptions, JapaneseTextSourceDocument } from './types';
import { measureUnicode } from './unicode';

export const JAPANESE_TEXT_PARSER_VERSION = '5b2-v1';

export function analyzeJapaneseTextSource(text: string, options: JapaneseTextParserOptions = {}): JapaneseTextSourceDocument {
  const lines = scanSourceLines(text);
  const lineEndingStyle = detectLineEndingStyle(lines);
  const symbols = scanPairedSymbolRegions(text, options);
  return {
    parserVersion: JAPANESE_TEXT_PARSER_VERSION,
    source: { ...measureUnicode(text), lineEndingStyle },
    lines,
    symbolRegions: symbols.regions,
    symbolUsage: symbols.usage,
    diagnostics: [...buildSourceDiagnostics(lines, lineEndingStyle), ...symbols.diagnostics]
      .sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset || left.code.localeCompare(right.code)),
  };
}
