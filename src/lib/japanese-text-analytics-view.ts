import type {
  EndingDistributionEntry,
  EndingStreak,
  EndingWindowConcentration,
  JapaneseTextSourceDocument,
} from './japanese-text';

export interface JapaneseTextAnalyticsSection {
  id: string;
  index: number;
  bodyGraphemes: number;
  sentenceCount: number;
  paragraphCount: number;
}

export interface JapaneseTextAnalyticsViewModel {
  sectionCount: number;
  sections: JapaneseTextAnalyticsSection[];
  exactSurfaceMaximumGraphemes: number;
  exactEndingDistribution: EndingDistributionEntry[];
  patternDistribution: EndingDistributionEntry[];
  unmatchedPatternCount: number;
  streaks: EndingStreak[];
  concentrations: EndingWindowConcentration[];
}

function overlaps(left: EndingWindowConcentration, right: EndingWindowConcentration): boolean {
  return left.sectionId === right.sectionId
    && left.patternId === right.patternId
    && left.startSentenceIndex <= right.endSentenceIndex
    && right.startSentenceIndex <= left.endSentenceIndex;
}

/** UI向けの軽量な射影。本文解析や語尾解析は行わない。 */
export function buildJapaneseTextAnalyticsViewModel(
  analysis: JapaneseTextSourceDocument,
  concentrationLimit = 6,
): JapaneseTextAnalyticsViewModel {
  const concentrations = [...analysis.endingAnalysis.concentrations]
    .sort((left, right) =>
      right.occurrenceCount - left.occurrenceCount
      || right.ratio - left.ratio
      || left.startSentenceIndex - right.startSentenceIndex
      || left.pattern.localeCompare(right.pattern))
    .reduce<EndingWindowConcentration[]>((selected, candidate) => {
      if (selected.length >= concentrationLimit || selected.some(value => overlaps(value, candidate))) return selected;
      selected.push(candidate);
      return selected;
    }, []);

  return {
    sectionCount: analysis.metrics.sectionCount,
    sections: analysis.metrics.sections.map(section => ({
      id: section.sectionId,
      index: section.index,
      bodyGraphemes: section.bodyGraphemes,
      sentenceCount: section.sentenceCount,
      paragraphCount: section.paragraphCount,
    })),
    exactSurfaceMaximumGraphemes: analysis.endingAnalysis.exactSurfaceMaximumGraphemes,
    exactEndingDistribution: analysis.endingAnalysis.exactEndingDistribution,
    patternDistribution: analysis.endingAnalysis.patternDistribution,
    unmatchedPatternCount: analysis.endingAnalysis.unmatchedPatternCount,
    streaks: analysis.endingAnalysis.streaks,
    concentrations,
  };
}
