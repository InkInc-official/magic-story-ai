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
}

export interface JapaneseTextSourceDocument {
  parserVersion: string;
  source: UnicodeMetrics & {
    lineEndingStyle: LineEndingStyle;
  };
  lines: SourceLine[];
  symbolRegions: PairedSymbolRegion[];
  symbolUsage: SymbolPairUsage[];
  diagnostics: TextDiagnostic[];
}
