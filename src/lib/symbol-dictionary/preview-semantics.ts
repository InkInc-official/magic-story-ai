import { resolveSymbolOccurrences } from './resolver';
import type { ResolvedSymbolOccurrence, SymbolDefinition, SymbolUsageRule } from './types';

export type PreviewSemanticStyle = 'dialogue' | 'inner_voice' | 'normal';
export type PreviewSemanticSource = 'override' | 'default' | 'suppression';

export interface PreviewSymbolSemanticRange {
  startOffset: number;
  endOffset: number;
  depth: number;
  style: PreviewSemanticStyle;
  source: PreviewSemanticSource;
  definitionId: string;
}

export interface PreviewSymbolDefaults {
  definitions: SymbolDefinition[];
  usageRules: SymbolUsageRule[];
}

function visualStyle(occurrence: ResolvedSymbolOccurrence): PreviewSemanticStyle {
  // Visual precedence only: the underlying nullable dimensions remain independent.
  if (occurrence.usageRule?.countsAsInnerVoice === true) return 'inner_voice';
  if (occurrence.usageRule?.countsAsDialogue === true) return 'dialogue';
  return 'normal';
}

/** Creates a DB-independent Preview DTO from the canonical semantic resolver. */
export function buildPreviewSymbolSemantics(
  occurrences: readonly ResolvedSymbolOccurrence[],
): PreviewSymbolSemanticRange[] {
  return occurrences.flatMap<PreviewSymbolSemanticRange>(occurrence => {
    if (occurrence.status === 'confirmed_override' || occurrence.status === 'confirmed_default') {
      return [{
        startOffset: occurrence.region.startOffset,
        endOffset: occurrence.region.endOffset,
        depth: occurrence.region.depth,
        style: visualStyle(occurrence),
        source: occurrence.status === 'confirmed_override' ? 'override' as const : 'default' as const,
        definitionId: occurrence.definition!.id,
      }];
    }
    // A stale author override or malformed author-defined region must not silently
    // regain legacy/default styling. Unresolved definitions remain legacy-compatible.
    if (occurrence.definition && (occurrence.status === 'stale_override' || occurrence.status === 'invalid_structure')) {
      return [{
        startOffset: occurrence.region.startOffset,
        endOffset: occurrence.region.endOffset,
        depth: occurrence.region.depth,
        style: 'normal' as const,
        source: 'suppression' as const,
        definitionId: occurrence.definition.id,
      }];
    }
    return [];
  }).sort((left, right) => left.startOffset - right.startOffset
    || left.endOffset - right.endOffset
    || left.depth - right.depth);
}

/** An orphaned stale Override cannot be safely assigned to one occurrence. */
export function suppressPreviewDefaultsForStaleDefinitions(
  semantics: readonly PreviewSymbolSemanticRange[],
  staleDefinitionIds: ReadonlySet<string>,
): PreviewSymbolSemanticRange[] {
  if (staleDefinitionIds.size === 0) return [...semantics];
  return semantics.map(value => value.source === 'default' && staleDefinitionIds.has(value.definitionId)
    ? { ...value, style: 'normal', source: 'suppression' }
    : value);
}

/** Dirty editor policy: resolve current text from Project defaults, never saved Overrides. */
export function resolvePreviewDefaultSemantics(input: {
  projectId: string;
  chapterId: string;
  content: string;
  defaults: PreviewSymbolDefaults;
}): PreviewSymbolSemanticRange[] {
  return buildPreviewSymbolSemantics(resolveSymbolOccurrences({
    projectId: input.projectId,
    chapterId: input.chapterId,
    content: input.content,
    definitions: input.defaults.definitions,
    usageRules: input.defaults.usageRules,
    overrides: [],
  }).occurrences);
}
