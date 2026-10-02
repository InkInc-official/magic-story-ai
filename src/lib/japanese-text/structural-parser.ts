import type {
  JapaneseTextParserOptions,
  PairedSymbolRegion,
  SectionBreakCandidate,
  SectionBreakDefinition,
  SourceLine,
  SourceRange,
  StructuralSentence,
  TextDiagnostic,
  TextParagraph,
  TextSection,
} from './types';

export const BUILTIN_SECTION_BREAKS: readonly SectionBreakDefinition[] = Object.freeze([
  { id: 'fullwidth-three-asterisks', marker: '＊＊＊' },
  { id: 'ascii-three-asterisks', marker: '***' },
  { id: 'white-diamond', marker: '◇' },
  { id: 'black-diamond', marker: '◆' },
  { id: 'fullwidth-asterisk', marker: '＊' },
  { id: 'ascii-three-hyphens', marker: '---' },
]);

export interface StructuralParseResult {
  breaks: SectionBreakCandidate[];
  effectiveBreaks: SectionBreakCandidate[];
  sections: TextSection[];
  paragraphs: TextParagraph[];
  sentences: StructuralSentence[];
  diagnostics: TextDiagnostic[];
}

function selectEffectiveBreaks(breaks: readonly SectionBreakCandidate[], regions: readonly PairedSymbolRegion[]): SectionBreakCandidate[] {
  const closedRegions = regions.filter(region => region.status === 'closed' && region.closeRange);
  return breaks.filter(sectionBreak => !closedRegions.some(region =>
    region.openRange.endOffset <= sectionBreak.markerRange.startOffset
    && sectionBreak.markerRange.endOffset <= region.closeRange!.startOffset));
}

function trimWhitespaceRange(text: string, range: SourceRange): SourceRange {
  let startOffset = range.startOffset;
  let endOffset = range.endOffset;
  while (startOffset < endOffset) {
    const value = String.fromCodePoint(text.codePointAt(startOffset)!);
    if (!/\s/u.test(value)) break;
    startOffset += value.length;
  }
  while (endOffset > startOffset) {
    const previous = text.codePointAt(endOffset - 1)!;
    const width = previous >= 0xdc00 && previous <= 0xdfff ? 2 : 1;
    const value = text.slice(endOffset - width, endOffset);
    if (!/\s/u.test(value)) break;
    endOffset -= width;
  }
  return { startOffset, endOffset };
}

function resolveSectionDefinitions(definitions: readonly SectionBreakDefinition[]): { definitions: SectionBreakDefinition[]; diagnostics: TextDiagnostic[] } {
  const accepted: SectionBreakDefinition[] = [];
  const diagnostics: TextDiagnostic[] = [];
  const markers = new Set<string>();
  for (const definition of definitions) {
    if (!definition.id || !definition.marker || /[\r\n]/u.test(definition.marker)) {
      diagnostics.push({ startOffset: 0, endOffset: 0, code: 'malformed_section_definition', severity: 'warning', message: 'Section break definitionには空でないIDと改行を含まないmarkerが必要です。' });
      continue;
    }
    if (markers.has(definition.marker)) {
      diagnostics.push({ startOffset: 0, endOffset: 0, code: 'duplicate_section_definition', severity: 'warning', message: `Section break marker「${definition.marker}」が重複しているため、先のdefinitionを使用します。` });
      continue;
    }
    markers.add(definition.marker);
    accepted.push(definition);
  }
  return { definitions: accepted, diagnostics };
}

function findSectionBreaks(text: string, lines: readonly SourceLine[], definitions: readonly SectionBreakDefinition[]): SectionBreakCandidate[] {
  const byMarker = new Map(definitions.map(definition => [definition.marker, definition]));
  const result: SectionBreakCandidate[] = [];
  for (const line of lines) {
    const markerRange = trimWhitespaceRange(text, line.contentRange);
    const marker = text.slice(markerRange.startOffset, markerRange.endOffset);
    const definition = byMarker.get(marker);
    if (!definition) continue;
    result.push({
      id: `section-break:${result.length}:${definition.id}:${markerRange.startOffset}`,
      kind: 'section_break_candidate',
      startOffset: line.startOffset,
      endOffset: line.endOffset,
      lineIndex: line.index,
      marker,
      markerRange,
      definitionId: definition.id,
    });
  }
  return result;
}

function buildSections(text: string, breaks: readonly SectionBreakCandidate[]): TextSection[] {
  if (text.length === 0) return [];
  const sections: TextSection[] = [];
  let startOffset = 0;
  let precedingBreakId: string | null = null;
  for (const sectionBreak of breaks) {
    const index = sections.length;
    sections.push({ id: `section:${index}:${startOffset}`, index, kind: 'text_section', startOffset, endOffset: sectionBreak.startOffset, contentRange: { startOffset, endOffset: sectionBreak.startOffset }, precedingBreakId, paragraphIds: [] });
    startOffset = sectionBreak.endOffset;
    precedingBreakId = sectionBreak.id;
  }
  const index = sections.length;
  sections.push({ id: `section:${index}:${startOffset}`, index, kind: 'text_section', startOffset, endOffset: text.length, contentRange: { startOffset, endOffset: text.length }, precedingBreakId, paragraphIds: [] });
  return sections;
}

function buildParagraphs(lines: readonly SourceLine[], breaks: readonly SectionBreakCandidate[], sections: TextSection[]): TextParagraph[] {
  const breakLines = new Set(breaks.map(value => value.lineIndex));
  const paragraphs: TextParagraph[] = [];
  let sectionIndex = 0;
  for (const line of lines) {
    if (breakLines.has(line.index) || line.isBlank) continue;
    while (sectionIndex + 1 < sections.length && line.startOffset >= sections[sectionIndex].endOffset) sectionIndex += 1;
    const section = sections[sectionIndex];
    if (!section || line.startOffset < section.startOffset || line.endOffset > section.endOffset) continue;
    const index = paragraphs.length;
    const paragraph: TextParagraph = {
      id: `paragraph:${index}:${line.contentRange.startOffset}`,
      index,
      kind: 'text_paragraph',
      sectionId: section.id,
      lineStartIndex: line.index,
      lineEndIndex: line.index,
      startOffset: line.startOffset,
      endOffset: line.endOffset,
      contentRange: { ...line.contentRange },
      sentenceIds: [],
    };
    paragraphs.push(paragraph);
    section.paragraphIds.push(paragraph.id);
  }
  return paragraphs;
}

function terminalEnd(text: string, offset: number): number | null {
  if (!/[。！？!?]/u.test(text[offset] || '')) return null;
  let endOffset = offset + 1;
  while (endOffset < text.length && /[。！？!?]/u.test(text[endOffset])) endOffset += 1;
  return endOffset;
}

function firstNonWhitespace(text: string, startOffset: number, endOffset: number): number {
  let offset = startOffset;
  while (offset < endOffset) {
    const value = String.fromCodePoint(text.codePointAt(offset)!);
    if (!/\s/u.test(value)) break;
    offset += value.length;
  }
  return offset;
}

function parseSentences(text: string, sections: readonly TextSection[], paragraphs: TextParagraph[], regions: readonly PairedSymbolRegion[]): StructuralSentence[] {
  const paragraphsByStart = new Map(paragraphs.map(paragraph => [paragraph.contentRange.startOffset, paragraph]));
  const paragraphsByEnd = new Map(paragraphs.map(paragraph => [paragraph.contentRange.endOffset, paragraph]));
  const opensAt = new Map<number, PairedSymbolRegion[]>();
  const closesAt = new Map<number, PairedSymbolRegion[]>();
  const closesStartingAt = new Map<number, PairedSymbolRegion[]>();
  for (const region of regions) {
    const opening = opensAt.get(region.openRange.startOffset) || [];
    opening.push(region); opensAt.set(region.openRange.startOffset, opening);
    if (region.closeRange) {
      const closing = closesAt.get(region.closeRange.endOffset) || [];
      closing.push(region); closesAt.set(region.closeRange.endOffset, closing);
      const starting = closesStartingAt.get(region.closeRange.startOffset) || [];
      starting.push(region); closesStartingAt.set(region.closeRange.startOffset, starting);
    }
  }
  opensAt.forEach(values => values.sort((a, b) => a.depth - b.depth));
  closesAt.forEach(values => values.sort((a, b) => b.depth - a.depth));
  closesStartingAt.forEach(values => values.sort((a, b) => b.depth - a.depth));

  const paragraphsBySection = new Map<string, TextParagraph[]>();
  for (const paragraph of paragraphs) {
    const values = paragraphsBySection.get(paragraph.sectionId) || [];
    values.push(paragraph); paragraphsBySection.set(paragraph.sectionId, values);
  }

  const sentences: StructuralSentence[] = [];
  const active: PairedSymbolRegion[] = [];
  let sentenceStart: number | null = null;
  let currentSection: TextSection | null = null;
  let currentParagraph: TextParagraph | null = null;

  const overlappingParagraphs = (sectionId: string, startOffset: number, endOffset: number): TextParagraph[] => {
    const values = paragraphsBySection.get(sectionId) || [];
    let low = 0; let high = values.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (values[middle].contentRange.endOffset <= startOffset) low = middle + 1; else high = middle;
    }
    const result: TextParagraph[] = [];
    for (let index = low; index < values.length && values[index].contentRange.startOffset < endOffset; index += 1) result.push(values[index]);
    return result;
  };

  const addSentence = (endOffset: number, terminalRange: SourceRange | null) => {
    if (sentenceStart === null || !currentSection) return;
    if (endOffset <= sentenceStart) { sentenceStart = null; return; }
    const index = sentences.length;
    const overlapping = overlappingParagraphs(currentSection.id, sentenceStart, endOffset);
    const sentence: StructuralSentence = {
      id: `sentence:${index}:${sentenceStart}`,
      index,
      kind: 'structural_sentence',
      sectionId: currentSection.id,
      paragraphIds: overlapping.map(paragraph => paragraph.id),
      startOffset: sentenceStart,
      endOffset,
      terminalRange,
      terminalText: terminalRange ? text.slice(terminalRange.startOffset, terminalRange.endOffset) : null,
    };
    sentences.push(sentence);
    overlapping.forEach(paragraph => paragraph.sentenceIds.push(sentence.id));
    sentenceStart = null;
  };

  for (const section of sections) {
    currentSection = section;
    sentenceStart = null;
    currentParagraph = null;
    let offset = section.startOffset;
    while (offset <= section.endOffset) {
      const closed = closesAt.get(offset);
      if (closed) for (const region of closed) {
        const index = active.findIndex(value => value.id === region.id);
        if (index >= 0) active.splice(index, 1);
      }
      const paragraphStart = paragraphsByStart.get(offset);
      if (paragraphStart?.sectionId === section.id) {
        currentParagraph = paragraphStart;
        if (sentenceStart === null) sentenceStart = offset;
      }
      const opened = opensAt.get(offset);
      if (opened) for (const region of opened) if (!active.some(value => value.id === region.id)) active.push(region);

      const paragraphEnd = paragraphsByEnd.get(offset);
      if (paragraphEnd?.sectionId === section.id && sentenceStart !== null) {
        const crossesBoundary = active.some(region => region.endOffset > offset);
        if (!crossesBoundary) addSentence(offset, null);
        if (sentenceStart !== null && sentenceStart >= offset) sentenceStart = null;
        currentParagraph = null;
      }
      if (offset >= section.endOffset) break;

      const ending = sentenceStart !== null ? terminalEnd(text, offset) : null;
      if (ending !== null) {
        const terminalRange = { startOffset: offset, endOffset: ending };
        const containing = [...active].reverse().find(region => region.openRange.endOffset <= offset && region.endOffset >= ending);
        let boundary: number | null = containing ? null : ending;
        if (containing) {
          const closeStart = containing.closeRange?.startOffset ?? containing.endOffset;
          const moreInside = firstNonWhitespace(text, ending, closeStart) < closeStart;
          if (moreInside) boundary = ending;
          else if (containing.closeRange) {
            let attachedEnd = containing.closeRange.endOffset;
            let attached = true;
            while (attached) {
              attached = false;
              const next = closesStartingAt.get(attachedEnd)?.find(region => active.some(value => value.id === region.id));
              if (next?.closeRange) { attachedEnd = next.closeRange.endOffset; attached = true; }
            }
            const paragraphLimit = currentParagraph?.contentRange.endOffset ?? section.endOffset;
            const nextContent = firstNonWhitespace(text, attachedEnd, paragraphLimit);
            if (nextContent >= paragraphLimit || opensAt.has(nextContent)) boundary = attachedEnd;
          }
        }
        if (boundary !== null) {
          addSentence(boundary, terminalRange);
          sentenceStart = boundary;
        }
        offset = ending;
        continue;
      }
      const codePoint = text.codePointAt(offset)!;
      offset += codePoint > 0xffff ? 2 : 1;
    }
    if (sentenceStart !== null) addSentence(section.contentRange.endOffset, null);
  }
  return sentences;
}

export function parseStructuralText(text: string, lines: readonly SourceLine[], regions: readonly PairedSymbolRegion[], options: JapaneseTextParserOptions = {}): StructuralParseResult {
  const resolved = resolveSectionDefinitions(options.sectionBreaks ?? BUILTIN_SECTION_BREAKS);
  const breaks = findSectionBreaks(text, lines, resolved.definitions);
  const effectiveBreaks = selectEffectiveBreaks(breaks, regions);
  const sections = buildSections(text, effectiveBreaks);
  const paragraphs = buildParagraphs(lines, effectiveBreaks, sections);
  const sentences = parseSentences(text, sections, paragraphs, regions);
  return { breaks, effectiveBreaks, sections, paragraphs, sentences, diagnostics: resolved.diagnostics };
}
