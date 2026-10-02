'use client';

import { useDeferredValue, useMemo } from 'react';
import { analyzeCurrentChapterText, selectCurrentChapterMetrics } from '@/lib/current-chapter-metrics';

export function useJapaneseTextAnalysis(content: string) {
  const deferredContent = useDeferredValue(content);
  const analysis = useMemo(() => analyzeCurrentChapterText(deferredContent), [deferredContent]);
  const metrics = useMemo(() => selectCurrentChapterMetrics(analysis), [analysis]);
  return { analysis, metrics, isDeferred: deferredContent !== content };
}
