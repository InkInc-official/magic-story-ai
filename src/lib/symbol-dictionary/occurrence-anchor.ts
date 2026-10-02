import { createHash } from 'node:crypto';
import { getGraphemeRanges, type SourceRange } from '../japanese-text';
import type { OccurrenceMatchResult, SymbolDefinition, SymbolOccurrenceOverride } from './types';

export const SYMBOL_OCCURRENCE_ANCHOR_UTF16 = 64;

export function hashRawSymbolSource(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeAnchorRanges(content: string, range: SourceRange) {
  const graphemes = getGraphemeRanges(content);
  const desiredBefore = Math.max(0, range.startOffset - SYMBOL_OCCURRENCE_ANCHOR_UTF16);
  const desiredAfter = Math.min(content.length, range.endOffset + SYMBOL_OCCURRENCE_ANCHOR_UTF16);
  const beforeStart = graphemes.find(value => value.startOffset >= desiredBefore)?.startOffset ?? range.startOffset;
  const afterEnd = [...graphemes].reverse().find(value => value.endOffset <= desiredAfter)?.endOffset ?? range.endOffset;
  return {
    before: { startOffset: Math.min(beforeStart, range.startOffset), endOffset: range.startOffset },
    after: { startOffset: range.endOffset, endOffset: Math.max(afterEnd, range.endOffset) },
  };
}

function anchorFingerprint(input: { chapterId: string; definition: Pick<SymbolDefinition, 'openSymbol' | 'closeSymbol'>; exactExcerpt: string; anchorBefore: string; anchorAfter: string }) {
  return createHash('sha256').update(JSON.stringify({
    chapterId: input.chapterId,
    openSymbol: input.definition.openSymbol,
    closeSymbol: input.definition.closeSymbol,
    exactExcerpt: input.exactExcerpt,
    anchorBefore: input.anchorBefore,
    anchorAfter: input.anchorAfter,
  })).digest('hex');
}

export function buildSymbolOccurrenceAnchor(input: {
  id: string;
  projectId: string;
  chapterId: string;
  content: string;
  definition: SymbolDefinition;
  usageRuleId: string | null;
  status: SymbolOccurrenceOverride['status'];
  range: SourceRange;
}): SymbolOccurrenceOverride {
  const { range, content } = input;
  if (!Number.isInteger(range.startOffset) || !Number.isInteger(range.endOffset) || range.startOffset < 0 || range.endOffset <= range.startOffset || range.endOffset > content.length) throw new RangeError('Occurrence rangeが不正です。');
  const exactExcerpt = content.slice(range.startOffset, range.endOffset);
  if (!exactExcerpt.startsWith(input.definition.openSymbol) || !exactExcerpt.endsWith(input.definition.closeSymbol)) throw new RangeError('Occurrence rangeはpair全体を含む必要があります。');
  const anchors = safeAnchorRanges(content, range);
  const anchorBefore = content.slice(anchors.before.startOffset, anchors.before.endOffset);
  const anchorAfter = content.slice(anchors.after.startOffset, anchors.after.endOffset);
  return {
    id: input.id,
    projectId: input.projectId,
    chapterId: input.chapterId,
    definitionId: input.definition.id,
    usageRuleId: input.usageRuleId,
    status: input.status,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    exactExcerpt,
    anchorBefore,
    anchorAfter,
    contentHash: hashRawSymbolSource(content),
    anchorFingerprint: anchorFingerprint({ chapterId: input.chapterId, definition: input.definition, exactExcerpt, anchorBefore, anchorAfter }),
  };
}

function allOccurrences(content: string, excerpt: string): SourceRange[] {
  const result: SourceRange[] = [];
  for (let startOffset = content.indexOf(excerpt); startOffset >= 0; startOffset = content.indexOf(excerpt, startOffset + 1)) {
    result.push({ startOffset, endOffset: startOffset + excerpt.length });
  }
  return result;
}

export function matchSymbolOccurrence(content: string, override: SymbolOccurrenceOverride): OccurrenceMatchResult {
  const currentHash = hashRawSymbolSource(content);
  const validRange = override.startOffset >= 0 && override.endOffset > override.startOffset && override.endOffset <= content.length;
  if (validRange && currentHash === override.contentHash && content.slice(override.startOffset, override.endOffset) === override.exactExcerpt) {
    return { status: 'exact', range: { startOffset: override.startOffset, endOffset: override.endOffset } };
  }
  if (!override.exactExcerpt) return { status: 'stale', reason: 'invalid_range' };
  const matches = allOccurrences(content, override.exactExcerpt).filter(range => {
    const anchors = safeAnchorRanges(content, range);
    return content.slice(anchors.before.startOffset, anchors.before.endOffset) === override.anchorBefore
      && content.slice(anchors.after.startOffset, anchors.after.endOffset) === override.anchorAfter;
  });
  if (matches.length === 1) return { status: 'reanchorable', suggestedRange: matches[0] };
  return { status: 'stale', reason: matches.length > 1 ? 'ambiguous' : 'not_found' };
}
