export type Utf16Offset = number;

export interface SourceRange {
  /** Inclusive JavaScript string (UTF-16 code unit) offset. */
  startOffset: Utf16Offset;
  /** Exclusive JavaScript string (UTF-16 code unit) offset. */
  endOffset: Utf16Offset;
}

export type LineEnding = 'lf' | 'crlf' | 'cr' | 'none';
export type LineEndingStyle = 'lf' | 'crlf' | 'cr' | 'mixed' | 'none';
export type DiagnosticSeverity = 'info' | 'warning';
export type GraphemeSegmentation = 'intl-segmenter' | 'fallback-code-point-clusters';

export interface GraphemeSegment extends SourceRange {
  /** Zero-based grapheme index, independent from UTF-16 source offsets. */
  index: number;
  value: string;
}

export interface UnicodeMetrics {
  utf16CodeUnits: number;
  codePoints: number;
  graphemes: number;
  graphemeSegmentation: GraphemeSegmentation;
}

export interface PairedRegionCountByStatus {
  closed: number;
  unclosed: number;
  mismatched: number;
}

export interface SectionTextMetrics {
  sectionId: string;
  index: number;
  bodyGraphemes: number;
  paragraphCount: number;
  sentenceCount: number;
  pairedRegionGraphemes: number;
  closedPairedRegionGraphemes: number;
  structuralPairedRegionRatio: number | null;
  sentenceGraphemes: number;
  averageSentenceGraphemes: number | null;
}

export interface StructuralTextMetrics {
  source: UnicodeMetrics;
  bodyGraphemes: number;
  formattingGraphemes: number;
  whitespaceGraphemes: number;
  lineBreakCount: number;
  lineBreakGraphemes: number;
  sectionCount: number;
  nonEmptySectionCount: number;
  paragraphCount: number;
  sentenceCount: number;
  pairedRegionCount: number;
  pairedRegionCountByStatus: PairedRegionCountByStatus;
  pairedRegionGraphemes: number;
  closedPairedRegionGraphemes: number;
  structuralPairedRegionRatio: number | null;
  sentenceGraphemes: number;
  averageSentenceGraphemes: number | null;
  sections: SectionTextMetrics[];
}

/** A deterministic surface suffix, not a grammatical or morphological label. */
export interface EndingPatternDefinition {
  id: string;
  suffix: string;
}

export interface SentenceEndingResult {
  sentenceId: string;
  sentenceIndex: number;
  sectionId: string;
  exactSurfaceEnding: string | null;
  exactSurfaceRange: SourceRange | null;
  terminalText: string | null;
  terminalRange: SourceRange | null;
  patternId: string | null;
  pattern: string | null;
}

export interface EndingDistributionEntry {
  value: string;
  count: number;
  firstSentenceIndex: number;
  sentenceIds: string[];
}

export interface EndingStreak {
  patternId: string;
  pattern: string;
  sectionId: string;
  startSentenceIndex: number;
  endSentenceIndex: number;
  count: number;
  sentenceIds: string[];
}

export interface EndingWindowConcentration {
  patternId: string;
  pattern: string;
  sectionId: string;
  startSentenceIndex: number;
  endSentenceIndex: number;
  occurrenceCount: number;
  windowSize: number;
  ratio: number;
  sentenceIds: string[];
}

export interface SectionEndingAnalysis {
  sectionId: string;
  index: number;
  sentenceCount: number;
  unmatchedPatternCount: number;
  exactEndingDistribution: EndingDistributionEntry[];
  patternDistribution: EndingDistributionEntry[];
  streaks: EndingStreak[];
}

export interface SentenceEndingAnalysis {
  exactSurfaceMaximumGraphemes: number;
  minimumStreakLength: number;
  concentrationWindowSize: number;
  concentrationMinimumOccurrences: number;
  sentences: SentenceEndingResult[];
  unmatchedPatternCount: number;
  exactEndingDistribution: EndingDistributionEntry[];
  patternDistribution: EndingDistributionEntry[];
  streaks: EndingStreak[];
  concentrations: EndingWindowConcentration[];
  sections: SectionEndingAnalysis[];
}

export interface SourceLine extends SourceRange {
  index: number;
  contentRange: SourceRange;
  lineEndingRange: SourceRange | null;
  lineEnding: LineEnding;
  /** True only when the content range has zero UTF-16 code units. */
  isEmpty: boolean;
  /** True for non-empty content made entirely of Unicode whitespace. */
  isWhitespaceOnly: boolean;
  /** Convenience value: isEmpty || isWhitespaceOnly. */
  isBlank: boolean;
}

export interface TextDiagnostic extends SourceRange {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
}

export interface SymbolPairDefinition {
  id: string;
  openSymbol: string;
  closeSymbol: string;
}

export type PairedSymbolRegionStatus = 'closed' | 'unclosed' | 'mismatched';

export interface PairedSymbolRegion extends SourceRange {
  id: string;
  kind: 'paired_symbol_region';
  pairId: string;
  openSymbol: string;
  closeSymbol: string;
  openRange: SourceRange;
  closeRange: SourceRange | null;
  contentRange: SourceRange;
  depth: number;
  parentRegionId: string | null;
  status: PairedSymbolRegionStatus;
}

export interface SymbolPairUsage {
  pairId: string;
  openSymbol: string;
  closeSymbol: string;
  occurrenceCount: number;
  firstOccurrenceOffset: Utf16Offset;
  regionIds: string[];
}

export interface JapaneseTextParserOptions {
  pairedSymbols?: readonly SymbolPairDefinition[];
  maxSymbolNestingDepth?: number;
  sectionBreaks?: readonly SectionBreakDefinition[];
  /** Additional surface suffixes. They do not imply grammatical categories. */
  endingPatterns?: readonly EndingPatternDefinition[];
  exactSurfaceMaximumGraphemes?: number;
  minimumEndingStreakLength?: number;
  endingConcentrationWindowSize?: number;
  endingConcentrationMinimumOccurrences?: number;
}

export interface SectionBreakDefinition {
  id: string;
  marker: string;
}

export interface SectionBreakCandidate extends SourceRange {
  id: string;
  kind: 'section_break_candidate';
  lineIndex: number;
  marker: string;
  markerRange: SourceRange;
  definitionId: string;
}

export interface TextSection extends SourceRange {
  id: string;
  index: number;
  kind: 'text_section';
  contentRange: SourceRange;
  precedingBreakId: string | null;
  paragraphIds: string[];
}

export interface TextParagraph extends SourceRange {
  id: string;
  index: number;
  kind: 'text_paragraph';
  sectionId: string;
  lineStartIndex: number;
  lineEndIndex: number;
  contentRange: SourceRange;
  sentenceIds: string[];
}

export interface StructuralSentence extends SourceRange {
  id: string;
  index: number;
  kind: 'structural_sentence';
  sectionId: string;
  paragraphIds: string[];
  terminalRange: SourceRange | null;
  terminalText: string | null;
}

export interface JapaneseTextSourceDocument {
  parserVersion: string;
  source: UnicodeMetrics & {
    lineEndingStyle: LineEndingStyle;
  };
  lines: SourceLine[];
  symbolRegions: PairedSymbolRegion[];
  symbolUsage: SymbolPairUsage[];
  sectionBreaks: SectionBreakCandidate[];
  /** Candidate nodes adopted as actual Section boundaries. */
  effectiveSectionBreaks: SectionBreakCandidate[];
  sections: TextSection[];
  paragraphs: TextParagraph[];
  sentences: StructuralSentence[];
  metrics: StructuralTextMetrics;
  endingAnalysis: SentenceEndingAnalysis;
  diagnostics: TextDiagnostic[];
}
