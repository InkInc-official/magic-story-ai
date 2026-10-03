'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Info, TextSearch } from 'lucide-react';
import type { JapaneseTextSourceDocument } from '@/lib/japanese-text';
import { buildJapaneseTextAnalyticsViewModel } from '@/lib/japanese-text-analytics-view';
import type { SymbolSemanticMetrics } from '@/lib/symbol-dictionary';

const EXACT_ENDING_LIMIT = 8;

function Distribution({ entries }: { entries: ReadonlyArray<{ value: string; count: number }> }) {
  if (entries.length === 0) return <p className="text-[11px] text-muted-foreground">該当する文はありません</p>;
  return <div className="flex flex-wrap gap-1.5">{entries.map(entry => (
    <span key={entry.value} className="rounded border border-border/60 bg-secondary/30 px-2 py-1 text-[11px] text-foreground/80">
      「{entry.value}」 {entry.count}文
    </span>
  ))}</div>;
}

function MetricValue({ label, value, percent }: { label: string; value: number; percent: number | null }) {
  return <div className="flex items-center justify-between gap-3 rounded bg-secondary/30 px-2 py-1.5 text-[11px]">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-foreground/80">{value.toLocaleString('ja-JP')}字{percent === null ? '' : `（本文の${percent.toFixed(1)}%）`}</span>
  </div>;
}

export function JapaneseTextAnalyticsPanel({ analysis, symbolMetrics, symbolMetricsLoading = false, symbolMetricsError = '', symbolMetricsDirty = false }: {
  analysis: JapaneseTextSourceDocument;
  symbolMetrics?: SymbolSemanticMetrics | null;
  symbolMetricsLoading?: boolean;
  symbolMetricsError?: string;
  symbolMetricsDirty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showAllEndings, setShowAllEndings] = useState(false);
  const model = useMemo(() => buildJapaneseTextAnalyticsViewModel(analysis), [analysis]);
  const exactEntries = showAllEndings ? model.exactEndingDistribution : model.exactEndingDistribution.slice(0, EXACT_ENDING_LIMIT);

  return (
    <div className="rounded-lg border border-border/60 bg-secondary/10">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
        <span className="flex items-center gap-2 text-xs font-medium text-foreground"><TextSearch size={14} className="text-cyan-400" />文章データ</span>
        <span className="flex items-center gap-2 text-[10px] text-muted-foreground">セクション {model.sectionCount}・文 {analysis.metrics.sentenceCount}{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
      {open && <div className="space-y-4 border-t border-border/50 px-3 py-3">
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <h4 className="text-[11px] font-medium text-foreground/80">作品表記の分析</h4>
            <span title="保存済み本文と作者が確定した作品表記辞書を基準に、書記素（見た目上の文字単位）で集計します。各分類は重複する場合があります。"><Info size={12} className="text-muted-foreground" /></span>
          </div>
          {symbolMetricsDirty && <p className="mb-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-600">作品表記の分析は保存済み本文を基準にしています。最新の分析を見るには章を保存してください。</p>}
          {symbolMetricsLoading && <p className="text-[11px] text-muted-foreground">保存済み本文の作品表記を解析中...</p>}
          {symbolMetricsError && !symbolMetricsLoading && <p className="text-[11px] text-destructive">{symbolMetricsError}</p>}
          {symbolMetrics && !symbolMetricsLoading && <>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <MetricValue label="表記の意味が確定している範囲" value={symbolMetrics.confirmedSemanticGraphemes} percent={symbolMetrics.confirmedSemanticPercent} />
              <MetricValue label="未分類・要再確認の表記" value={symbolMetrics.unresolvedSemanticGraphemes} percent={symbolMetrics.unresolvedSemanticPercent} />
              <MetricValue label="会話として指定" value={symbolMetrics.dialogueGraphemes} percent={symbolMetrics.dialoguePercent} />
              <MetricValue label="地の文として指定" value={symbolMetrics.narrationGraphemes} percent={symbolMetrics.narrationPercent} />
              <MetricValue label="内心として指定" value={symbolMetrics.innerVoiceGraphemes} percent={symbolMetrics.innerVoicePercent} />
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">保存済み本文 {symbolMetrics.bodyGraphemes.toLocaleString('ja-JP')}字を分母にしています。各分類は独立しており、重複する場合があります。</p>
            {(symbolMetrics.staleOccurrenceCount > 0 || symbolMetrics.malformedOccurrenceCount > 0) && <p className="mt-1 text-[10px] text-amber-600">要再確認：位置未確認 {symbolMetrics.staleOccurrenceCount}件・記号構造不完全 {symbolMetrics.malformedOccurrenceCount}件</p>}
          </>}
          {!symbolMetrics && !symbolMetricsLoading && !symbolMetricsError && <p className="text-[11px] text-muted-foreground">章を保存すると作品表記の分析を表示します。</p>}
        </section>

        {model.sectionCount > 1 && <section>
          <h4 className="mb-2 text-[11px] font-medium text-foreground/80">セクション</h4>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {model.sections.map(section => <div key={section.id} className="rounded bg-secondary/30 px-2 py-1.5 text-[11px] text-muted-foreground">
              <span className="text-foreground/80">セクション {section.index + 1}</span>：本文 {section.bodyGraphemes}字・{section.sentenceCount}文・{section.paragraphCount}段落
            </div>)}
          </div>
        </section>}

        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <h4 className="text-[11px] font-medium text-foreground/80">文末表現の分布</h4>
            <span title={`文末付近の表面上の文字列を、最大${model.exactSurfaceMaximumGraphemes}書記素（見た目上の文字単位）まで集計しています。文法上の分類ではありません。`}><Info size={12} className="text-muted-foreground" /></span>
          </div>
          <Distribution entries={exactEntries} />
          {model.exactEndingDistribution.length > EXACT_ENDING_LIMIT && <button type="button" onClick={() => setShowAllEndings(value => !value)} className="mt-2 text-[10px] text-cyan-400 hover:text-cyan-300">{showAllEndings ? '上位のみ表示' : `すべて表示（${model.exactEndingDistribution.length}種類）`}</button>}
        </section>

        <section>
          <h4 className="mb-2 text-[11px] font-medium text-foreground/80">文末パターン</h4>
          <Distribution entries={model.patternDistribution} />
          <p className="mt-1.5 text-[10px] text-muted-foreground">パターン未分類：{model.unmatchedPatternCount}文</p>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 text-[11px] font-medium text-foreground/80">文末表現の連続</h4>
            {model.streaks.length === 0 ? <p className="text-[11px] text-muted-foreground">該当する連続はありません</p> : <div className="space-y-1">{model.streaks.map(streak => <p key={`${streak.sectionId}:${streak.startSentenceIndex}:${streak.patternId}`} className="text-[11px] text-muted-foreground">「{streak.pattern}」 {streak.count}文連続（第{streak.startSentenceIndex + 1}〜{streak.endSentenceIndex + 1}文）</p>)}</div>}
          </div>
          <div>
            <h4 className="mb-2 text-[11px] font-medium text-foreground/80">近接する文の文末傾向</h4>
            {model.concentrations.length === 0 ? <p className="text-[11px] text-muted-foreground">該当する集中はありません</p> : <div className="space-y-1">{model.concentrations.map(value => <p key={`${value.sectionId}:${value.startSentenceIndex}:${value.patternId}`} className="text-[11px] text-muted-foreground">「{value.pattern}」 {value.windowSize}文中{value.occurrenceCount}回（第{value.startSentenceIndex + 1}〜{value.endSentenceIndex + 1}文）</p>)}</div>}
          </div>
        </section>
      </div>}
    </div>
  );
}
