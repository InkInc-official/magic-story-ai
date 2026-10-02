import { analyzeJapaneseTextSource, type JapaneseTextSourceDocument } from './japanese-text';

export interface CurrentChapterMetrics {
  bodyGraphemes: number;
  sentenceCount: number;
  paragraphCount: number;
}

export function analyzeCurrentChapterText(content: string): JapaneseTextSourceDocument {
  return analyzeJapaneseTextSource(content);
}

export function selectCurrentChapterMetrics(analysis: JapaneseTextSourceDocument): CurrentChapterMetrics {
  return {
    bodyGraphemes: analysis.metrics.bodyGraphemes,
    sentenceCount: analysis.metrics.sentenceCount,
    paragraphCount: analysis.metrics.paragraphCount,
  };
}

export function resolveCurrentChapterTarget(chapterTarget: string | number | null | undefined, projectTarget?: number | null): number | null {
  const chapterValue = typeof chapterTarget === 'string' ? Number(chapterTarget) : chapterTarget;
  if (Number.isInteger(chapterValue) && Number(chapterValue) > 0) return Number(chapterValue);
  return Number.isInteger(projectTarget) && Number(projectTarget) > 0 ? Number(projectTarget) : null;
}
