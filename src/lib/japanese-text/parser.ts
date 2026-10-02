import { buildSourceDiagnostics } from './diagnostics';
import { detectLineEndingStyle, scanSourceLines } from './line-scanner';
import { scanPairedSymbolRegions } from './paired-symbols';
import { parseStructuralText } from './structural-parser';
import { buildStructuralTextMetrics } from './metrics';
import type { JapaneseTextParserOptions, JapaneseTextSourceDocument } from './types';
import { getGraphemeRanges, measureUnicode } from './unicode';

export const JAPANESE_TEXT_PARSER_VERSION = '5b4-v1';

export function analyzeJapaneseTextSource(text: string, options: JapaneseTextParserOptions = {}): JapaneseTextSourceDocument {
  const lines = scanSourceLines(text);
  const lineEndingStyle = detectLineEndingStyle(lines);
  const symbols = scanPairedSymbolRegions(text, options);
  const structure = parseStructuralText(text, lines, symbols.regions, options);
  const graphemes = getGraphemeRanges(text);
  const source = measureUnicode(text, graphemes);
  const metrics = buildStructuralTextMetrics({ source, lines, effectiveSectionBreaks: structure.effectiveBreaks, sections: structure.sections, paragraphs: structure.paragraphs, sentences: structure.sentences, symbolRegions: symbols.regions, graphemes });
  return {
    parserVersion: JAPANESE_TEXT_PARSER_VERSION,
    source: { ...source, lineEndingStyle },
    lines,
    symbolRegions: symbols.regions,
    symbolUsage: symbols.usage,
    sectionBreaks: structure.breaks,
    effectiveSectionBreaks: structure.effectiveBreaks,
    sections: structure.sections,
    paragraphs: structure.paragraphs,
    sentences: structure.sentences,
    metrics,
    diagnostics: [...buildSourceDiagnostics(lines, lineEndingStyle), ...symbols.diagnostics, ...structure.diagnostics]
      .sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset || left.code.localeCompare(right.code)),
  };
}
