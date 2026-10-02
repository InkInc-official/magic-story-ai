import type { PairedSymbolRegion, SourceRange, SymbolPairDefinition, TextDiagnostic } from '../japanese-text';

export const SYMBOL_SEMANTIC_KINDS = ['dialogue', 'inner_voice', 'quotation', 'narrative_span', 'displayed_text', 'special_voice', 'custom'] as const;
export const SYMBOL_SPEAKER_MODES = ['none', 'fixed_character', 'current_pov', 'contextual', 'unknown'] as const;
export const SYMBOL_RULE_PROVENANCES = ['author', 'imported', 'ai_suggested_then_confirmed'] as const;
export const SYMBOL_OVERRIDE_STATUSES = ['confirmed', 'unresolved'] as const;

export type SymbolSemanticKind = typeof SYMBOL_SEMANTIC_KINDS[number];
export type SymbolSpeakerMode = typeof SYMBOL_SPEAKER_MODES[number];
export type SymbolRuleProvenance = typeof SYMBOL_RULE_PROVENANCES[number];
export type SymbolOccurrenceOverrideStatus = typeof SYMBOL_OVERRIDE_STATUSES[number];

export interface SymbolDefinition {
  id: string;
  projectId: string;
  openSymbol: string;
  closeSymbol: string;
  label: string;
  active: boolean;
  order: number;
  defaultUsageRuleId: string | null;
}

export interface SymbolUsageRule {
  id: string;
  projectId: string;
  definitionId: string;
  label: string;
  description: string;
  semanticKind: SymbolSemanticKind;
  countsAsDialogue: boolean | null;
  countsAsNarration: boolean | null;
  countsAsInnerVoice: boolean | null;
  readerVisible: boolean | null;
  spokenAloud: boolean | null;
  speakerMode: SymbolSpeakerMode;
  fixedSpeakerId: string | null;
  priority: number;
  active: boolean;
  provenance: SymbolRuleProvenance;
}

export interface SymbolOccurrenceOverride {
  id: string;
  projectId: string;
  chapterId: string;
  definitionId: string;
  usageRuleId: string | null;
  status: SymbolOccurrenceOverrideStatus;
  startOffset: number;
  endOffset: number;
  exactExcerpt: string;
  anchorBefore: string;
  anchorAfter: string;
  contentHash: string;
  anchorFingerprint: string;
}

export interface ConventionalSymbolSuggestion {
  openSymbol: string;
  closeSymbol: string;
  label: string;
  description?: string;
  semanticKind?: SymbolSemanticKind;
}

export type SymbolResolutionStatus =
  | 'confirmed_override'
  | 'confirmed_default'
  | 'convention_only'
  | 'unresolved'
  | 'stale_override'
  | 'invalid_structure';

export interface RuntimeSymbolPairDefinition extends SymbolPairDefinition {
  structuralKey: string;
  source: 'builtin' | 'project';
  projectDefinitionId: string | null;
}

export interface ResolvedSymbolOccurrence {
  region: PairedSymbolRegion;
  rawText: string;
  definition: SymbolDefinition | null;
  usageRule: SymbolUsageRule | null;
  conventionalSuggestion: ConventionalSymbolSuggestion | null;
  override: SymbolOccurrenceOverride | null;
  status: SymbolResolutionStatus;
  suggestedRange: SourceRange | null;
}

export interface ResolveSymbolOccurrencesInput {
  projectId: string;
  chapterId: string;
  content: string;
  definitions: SymbolDefinition[];
  usageRules: SymbolUsageRule[];
  overrides: SymbolOccurrenceOverride[];
  conventionalSuggestions?: ConventionalSymbolSuggestion[];
}

export interface ResolveSymbolOccurrencesResult {
  parserVersion: string;
  runtimeDefinitions: RuntimeSymbolPairDefinition[];
  occurrences: ResolvedSymbolOccurrence[];
  diagnostics: TextDiagnostic[];
  parseCount: 1;
}

export interface SymbolDictionaryValidationIssue {
  code: string;
  path: string;
  message: string;
}

export type OccurrenceMatchResult =
  | { status: 'exact'; range: SourceRange }
  | { status: 'reanchorable'; suggestedRange: SourceRange }
  | { status: 'stale'; reason: 'ambiguous' | 'not_found' | 'invalid_range' };
