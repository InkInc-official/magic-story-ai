export { analyzeJapaneseTextSource, JAPANESE_TEXT_PARSER_VERSION } from './parser';
export { detectLineEndingStyle, scanSourceLines } from './line-scanner';
export { BUILTIN_SYMBOL_PAIRS, DEFAULT_MAX_SYMBOL_NESTING_DEPTH, scanPairedSymbolRegions } from './paired-symbols';
export { BUILTIN_SECTION_BREAKS, parseStructuralText } from './structural-parser';
export { buildStructuralTextMetrics, countGraphemesInRanges } from './metrics';
export {
  analyzeSentenceEndings,
  BUILTIN_ENDING_PATTERNS,
  DEFAULT_ENDING_CONCENTRATION_MINIMUM_OCCURRENCES,
  DEFAULT_ENDING_CONCENTRATION_WINDOW_SIZE,
  DEFAULT_EXACT_SURFACE_MAXIMUM_GRAPHEMES,
  DEFAULT_MINIMUM_ENDING_STREAK_LENGTH,
} from './ending-analysis';
export { countCodePoints, countGraphemes, getGraphemeRanges, getGraphemeSegmentation, measureUnicode } from './unicode';
export type {
  DiagnosticSeverity,
  EndingDistributionEntry,
  EndingPatternDefinition,
  EndingStreak,
  EndingWindowConcentration,
  GraphemeSegmentation,
  GraphemeSegment,
  JapaneseTextSourceDocument,
  JapaneseTextParserOptions,
  LineEnding,
  LineEndingStyle,
  PairedSymbolRegion,
  PairedSymbolRegionStatus,
  PairedRegionCountByStatus,
  SectionBreakCandidate,
  SectionEndingAnalysis,
  SectionBreakDefinition,
  SourceLine,
  SourceRange,
  StructuralSentence,
  StructuralTextMetrics,
  SentenceEndingAnalysis,
  SentenceEndingResult,
  SymbolPairDefinition,
  SymbolPairUsage,
  TextDiagnostic,
  TextParagraph,
  SectionTextMetrics,
  TextSection,
  UnicodeMetrics,
  Utf16Offset,
} from './types';
