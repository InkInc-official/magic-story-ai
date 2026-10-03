import { getGraphemeRanges, type SourceRange } from '../japanese-text';
import { matchSymbolOccurrence } from './occurrence-anchor';
import { resolveSymbolOccurrences } from './resolver';
import { computeSymbolSemanticMetrics, type SymbolSemanticMetrics } from './semantic-metrics';
import { buildPreviewSymbolSemantics, suppressPreviewDefaultsForStaleDefinitions, type PreviewSymbolSemanticRange } from './preview-semantics';
import type { ResolveSymbolOccurrencesInput, ResolvedSymbolOccurrence, SymbolOccurrenceOverride } from './types';

export type OccurrenceReanchorState = 'reanchorable' | 'ambiguous' | 'not_found' | null;

export interface SymbolOccurrenceBrowserItem {
  id: string;
  startOffset: number;
  endOffset: number;
  openSymbol: string;
  closeSymbol: string;
  rawText: string;
  contextBefore: string;
  contextAfter: string;
  depth: number;
  parentRegionId: string | null;
  status: ResolvedSymbolOccurrence['status'];
  definition: ResolvedSymbolOccurrence['definition'];
  usageRule: ResolvedSymbolOccurrence['usageRule'];
  override: SymbolOccurrenceOverride | null;
  suggestedRange: SourceRange | null;
  reanchorState: OccurrenceReanchorState;
  orphanedOverride: boolean;
}

export interface SymbolOccurrenceBrowserResult {
  parserVersion: string;
  parseCount: 1;
  items: SymbolOccurrenceBrowserItem[];
  counts: { total: number; unresolved: number; review: number; confirmed: number };
  metrics: SymbolSemanticMetrics;
  previewSemantics: PreviewSymbolSemanticRange[];
}

function safeContext(content: string, range: SourceRange, graphemes: ReturnType<typeof getGraphemeRanges>, radius = 48) {
  const wantedStart = Math.max(0, range.startOffset - radius); const wantedEnd = Math.min(content.length, range.endOffset + radius);
  let low = 0; let high = graphemes.length;
  while (low < high) { const middle = (low + high) >>> 1; if (graphemes[middle].startOffset < wantedStart) low = middle + 1; else high = middle; }
  const beforeStart = graphemes[low]?.startOffset ?? range.startOffset;
  low = 0; high = graphemes.length;
  while (low < high) { const middle = (low + high) >>> 1; if (graphemes[middle].endOffset <= wantedEnd) low = middle + 1; else high = middle; }
  const afterEnd = graphemes[Math.max(0, low - 1)]?.endOffset ?? range.endOffset;
  return { before: content.slice(Math.min(beforeStart, range.startOffset), range.startOffset), after: content.slice(range.endOffset, Math.max(afterEnd, range.endOffset)) };
}

function reanchorState(content: string, override: SymbolOccurrenceOverride | null): { state: OccurrenceReanchorState; suggestedRange: SourceRange | null } {
  if (!override) return { state: null, suggestedRange: null };
  const match = matchSymbolOccurrence(content, override);
  if (match.status === 'exact') return { state: null, suggestedRange: null };
  if (match.status === 'reanchorable') return { state: 'reanchorable', suggestedRange: match.suggestedRange };
  return { state: match.reason === 'ambiguous' ? 'ambiguous' : 'not_found', suggestedRange: null };
}

export function buildSymbolOccurrenceBrowser(input: ResolveSymbolOccurrencesInput): SymbolOccurrenceBrowserResult {
  const resolved = resolveSymbolOccurrences(input);
  const graphemes = getGraphemeRanges(input.content);
  const matchedOverrideIds = new Set<string>();
  const items: SymbolOccurrenceBrowserItem[] = resolved.occurrences.map(occurrence => {
    if (occurrence.override) matchedOverrideIds.add(occurrence.override.id);
    const context = safeContext(input.content, occurrence.region, graphemes);
    const reanchor = reanchorState(input.content, occurrence.override);
    return {
      id: occurrence.override ? `override:${occurrence.override.id}` : `region:${occurrence.region.id}`,
      startOffset: occurrence.region.startOffset, endOffset: occurrence.region.endOffset,
      openSymbol: occurrence.region.openSymbol, closeSymbol: occurrence.region.closeSymbol, rawText: occurrence.rawText,
      contextBefore: context.before, contextAfter: context.after, depth: occurrence.region.depth,
      parentRegionId: occurrence.region.parentRegionId, status: occurrence.status, definition: occurrence.definition,
      usageRule: occurrence.usageRule, override: occurrence.override, suggestedRange: occurrence.suggestedRange || reanchor.suggestedRange,
      reanchorState: reanchor.state, orphanedOverride: false,
    };
  });
  const definitions = new Map(input.definitions.map(value => [value.id, value]));
  for (const override of input.overrides) {
    if (matchedOverrideIds.has(override.id)) continue;
    const definition = definitions.get(override.definitionId) || null;
    const match = matchSymbolOccurrence(input.content, override);
    const range = match.status === 'reanchorable' ? match.suggestedRange : { startOffset: override.startOffset, endOffset: override.endOffset };
    const inBounds = range.startOffset >= 0 && range.endOffset <= input.content.length && range.endOffset > range.startOffset;
    const context = inBounds ? safeContext(input.content, range, graphemes) : { before: override.anchorBefore, after: override.anchorAfter };
    items.push({ id: `orphan:${override.id}`, startOffset: range.startOffset, endOffset: range.endOffset,
      openSymbol: definition?.openSymbol || '', closeSymbol: definition?.closeSymbol || '', rawText: override.exactExcerpt,
      contextBefore: context.before, contextAfter: context.after, depth: 0, parentRegionId: null,
      status: 'stale_override', definition, usageRule: null, override,
      suggestedRange: match.status === 'reanchorable' ? match.suggestedRange : null,
      reanchorState: match.status === 'exact' ? null : match.status === 'reanchorable' ? 'reanchorable' : match.reason === 'ambiguous' ? 'ambiguous' : 'not_found', orphanedOverride: true });
  }
  items.sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset || left.id.localeCompare(right.id));
  const counts = { total: items.length, unresolved: 0, review: 0, confirmed: 0 };
  for (const item of items) {
    if (item.status === 'unresolved' || item.status === 'convention_only') counts.unresolved += 1;
    else if (item.status === 'stale_override' || item.status === 'invalid_structure') counts.review += 1;
    else counts.confirmed += 1;
  }
  const metrics = computeSymbolSemanticMetrics({
    content: input.content,
    analysis: resolved.analysis,
    occurrences: resolved.occurrences,
    orphanedStaleOccurrenceCount: items.filter(item => item.orphanedOverride && item.status === 'stale_override').length,
  });
  const orphanedStaleDefinitionIds = new Set(items
    .filter(item => item.orphanedOverride && item.status === 'stale_override' && item.definition)
    .map(item => item.definition!.id));
  const previewSemantics = suppressPreviewDefaultsForStaleDefinitions(
    buildPreviewSymbolSemantics(resolved.occurrences),
    orphanedStaleDefinitionIds,
  );
  return { parserVersion: resolved.parserVersion, parseCount: resolved.parseCount, items, counts, metrics, previewSemantics };
}
