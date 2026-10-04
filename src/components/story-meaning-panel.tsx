'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrainCircuit, ChevronDown, ChevronRight, Loader2, LocateFixed, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  APP_LOCALE, displayLabel, STORY_MEANING_DECISION_LABELS, STORY_MEANING_DIMENSION_LABELS,
  STORY_MEANING_EVIDENCE_LABELS, STORY_MEANING_IMPACT_LABELS, STORY_MEANING_LAYER_LABELS, STORY_MEANING_SUPPORT_LABELS,
} from '@/lib/i18n';
import type { StoryMeaningClaimDto, StoryMeaningRunDto } from '@/lib/story-meaning/author-ui';

type MeaningState = 'unanalysed' | 'pending' | 'fresh' | 'stale' | 'failed';
const STATE_LABELS: Record<MeaningState, string> = { unanalysed: '未解析', pending: '解析中', fresh: '解析済み', stale: '再解析が必要', failed: '解析失敗' };
const ERROR_LABELS: Record<string, string> = {
  meaning_empty_chapter: '本文がないため解析できません。', meaning_oversized_chapter: 'この章は現在の意味解析で一度に扱える技術上限を超えています。',
  meaning_model_failed: 'AIによる解析を完了できませんでした。', meaning_invalid_output: '解析結果を安全に読み取れませんでした。',
  meaning_persistence_failed: '解析結果を保存できませんでした。', meaning_analysis_failed: '物語意味解析に失敗しました。',
};

export function StoryMeaningPanel({ projectId, chapterId, hasUnsavedChanges, onSelectRange }: {
  projectId: string; chapterId: string; hasUnsavedChanges: boolean; onSelectRange?: (start: number, end: number) => void;
}) {
  const [state, setState] = useState<MeaningState>('unanalysed');
  const [runs, setRuns] = useState<StoryMeaningRunDto[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [interpretations, setInterpretations] = useState<Record<string, string>>({});
  const [dimensionFilter, setDimensionFilter] = useState('all');
  const [layerFilter, setLayerFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/story-meaning?projectId=${encodeURIComponent(projectId)}&chapterId=${encodeURIComponent(chapterId)}`);
      const result = await response.json() as { state?: MeaningState; runs?: StoryMeaningRunDto[]; error?: string };
      if (!response.ok) throw new Error(result.error || '物語意味解析を読み込めませんでした。');
      const nextRuns = result.runs || [];
      setState(result.state || 'unanalysed'); setRuns(nextRuns); setError('');
      setSelectedRunId(current => current && nextRuns.some(run => run.id === current) ? current : nextRuns[0]?.id || '');
    } catch (caught) { setError(caught instanceof Error ? caught.message : '物語意味解析を読み込めませんでした。'); }
    finally { if (!quiet) setLoading(false); }
  }, [chapterId, projectId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (state !== 'pending') return;
    let attempts = 0;
    const timer = window.setInterval(() => { attempts += 1; void load(true); if (attempts >= 15) window.clearInterval(timer); }, 2_000);
    return () => window.clearInterval(timer);
  }, [load, state]);

  const selectedRun = runs.find(run => run.id === selectedRunId) || runs[0];
  const historical = Boolean(selectedRun && selectedRun.id !== runs[0]?.id);
  const navigable = Boolean(selectedRun?.fresh && !hasUnsavedChanges);
  const claims = selectedRun?.events.flatMap(event => event.claims) || [];
  const dimensions = [...new Set(claims.map(claim => claim.dimension))];
  const visibleClaims = (values: StoryMeaningClaimDto[]) => values.filter(claim => (dimensionFilter === 'all' || claim.dimension === dimensionFilter) && (layerFilter === 'all' || claim.layer === layerFilter));

  const analyze = async (force: boolean) => {
    if (hasUnsavedChanges) { setError('現在の未保存本文は解析対象になりません。先に本文を保存してください。'); return; }
    if (force && runs[0]?.fresh && !window.confirm('AIを使ってこの章を再解析します。続けますか？')) return;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/story-meaning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, chapterId, force }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '物語意味解析に失敗しました。');
      await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '物語意味解析に失敗しました。'); }
    finally { setLoading(false); }
  };

  const decide = async (claim: StoryMeaningClaimDto, decision: string) => {
    const authorInterpretation = interpretations[claim.id] || '';
    if (decision === 'alternative' && !authorInterpretation.trim()) { setError('別解釈の内容を入力してください。'); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/story-meaning/decisions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, chapterId, runId: selectedRun?.id, claimId: claim.id, decision, authorInterpretation: decision === 'alternative' ? authorInterpretation : '' }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '作者判断を保存できませんでした。');
      setInterpretations(current => ({ ...current, [claim.id]: '' })); await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '作者判断を保存できませんでした。'); }
    finally { setLoading(false); }
  };

  return <div className="flex h-full flex-col">
    <div className="border-b border-border/50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><div className="flex items-center gap-2"><BrainCircuit size={16} className="text-fuchsia-400" /><span className="text-sm font-medium">物語意味解析</span><Badge variant="outline">{STATE_LABELS[state]}</Badge></div><p className="mt-0.5 text-[10px] text-muted-foreground">AIが本文のどこを根拠に、出来事と意味をどう読んだかを作者が検討する画面です。作品評価ではありません。</p></div>
        <Button size="sm" disabled={loading || state === 'pending' || hasUnsavedChanges} onClick={() => void analyze(state === 'fresh')}>
          {loading || state === 'pending' ? <Loader2 size={13} className="mr-1 animate-spin" /> : state === 'fresh' ? <RefreshCw size={13} className="mr-1" /> : <BrainCircuit size={13} className="mr-1" />}{state === 'fresh' ? '再解析' : '解析する'}
        </Button>
      </div>
    </div>
    <ScrollArea className="flex-1"><div className="space-y-3 p-3">
      {hasUnsavedChanges && <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="p-3 text-xs text-amber-600">現在の未保存本文は解析対象になりません。保存済み本文を誤って解析しないよう、先に章を保存してください。</CardContent></Card>}
      {error && <Card className="border-destructive/30 bg-destructive/5"><CardContent className="p-3 text-xs text-destructive">{error}</CardContent></Card>}
      {selectedRun?.status === 'failed' && <p className="rounded bg-destructive/5 p-2 text-xs text-destructive">{ERROR_LABELS[selectedRun.errorCode] || '以前の解析は完了できませんでした。'}</p>}
      {runs.length > 0 && <div className="flex flex-wrap items-center gap-2"><label className="text-xs" htmlFor="meaning-run">解析履歴</label><select id="meaning-run" className="h-8 max-w-full rounded border border-input bg-secondary px-2 text-xs" value={selectedRun?.id || ''} onChange={event => setSelectedRunId(event.target.value)}>{runs.map((run, index) => <option key={run.id} value={run.id}>{index === 0 ? '現在の解析' : new Date(run.createdAt).toLocaleString(APP_LOCALE)} — {run.status === 'completed' ? run.fresh ? '解析済み' : '過去の解析' : STATE_LABELS[run.status === 'pending' ? 'pending' : 'failed']}</option>)}</select></div>}
      {selectedRun && !selectedRun.fresh && selectedRun.status === 'completed' && <p className="rounded bg-amber-500/10 p-2 text-xs text-amber-600">この解析は以前の本文または解析条件を基準にしています。本文の根拠は保存された引用として表示し、現在本文への移動は無効です。</p>}
      {historical && <p className="text-[10px] text-muted-foreground">過去の解析結果を表示しています。この結果への作者判断は履歴として保存され、新しい解析へ自動コピーされません。</p>}
      {selectedRun?.status === 'completed' && <div className="flex flex-wrap gap-2 text-xs"><Badge variant="secondary">出来事 {selectedRun.events.length}件</Badge><Badge variant="secondary">読み取り {claims.length}件</Badge></div>}
      {selectedRun?.status === 'completed' && claims.length > 0 && <div className="flex flex-wrap gap-2"><select aria-label="読み取りの種類で絞り込み" value={dimensionFilter} onChange={event => setDimensionFilter(event.target.value)} className="h-8 rounded border border-input bg-secondary px-2 text-xs"><option value="all">すべての観点</option>{dimensions.map(value => <option key={value} value={value}>{displayLabel(STORY_MEANING_DIMENSION_LABELS, value)}</option>)}</select><select aria-label="解釈層で絞り込み" value={layerFilter} onChange={event => setLayerFilter(event.target.value)} className="h-8 rounded border border-input bg-secondary px-2 text-xs"><option value="all">すべての読み方</option>{Object.entries(STORY_MEANING_LAYER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}
      {!loading && runs.length === 0 && <div className="py-10 text-center text-muted-foreground"><BrainCircuit size={28} className="mx-auto mb-2 opacity-40" /><p className="text-xs">「解析する」を押すと、保存済み本文から読み取られた出来事を表示します。</p></div>}
      {selectedRun?.status === 'completed' && selectedRun.events.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">この解析では、明確な意味イベントは抽出されませんでした。</p>}
      {selectedRun?.events.map((event, index) => {
        const open = expanded[event.id] === true; const eventClaims = visibleClaims(event.claims);
        if (eventClaims.length === 0 && (dimensionFilter !== 'all' || layerFilter !== 'all')) return null;
        return <Card key={event.id} className="border-border/60"><CardContent className="p-0"><button type="button" aria-expanded={open} onClick={() => setExpanded(current => ({ ...current, [event.id]: !open }))} className="flex w-full items-start gap-2 p-3 text-left"><span className="mt-0.5">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span><span><span className="block text-[10px] text-muted-foreground">読み取られた出来事 {index + 1}</span><span className="text-sm font-medium">{event.summary}</span></span></button>{open && <div className="space-y-4 border-t border-border/50 p-3">
          <section><h4 className="mb-2 text-xs font-medium">本文の根拠</h4><div className="space-y-2">{event.evidence.map(evidence => <button key={evidence.localEvidenceKey} type="button" disabled={!navigable} onClick={() => navigable && onSelectRange?.(evidence.startOffset, evidence.endOffset)} className="block w-full rounded border border-border/60 p-2 text-left disabled:cursor-not-allowed disabled:opacity-70" aria-label={`${displayLabel(STORY_MEANING_EVIDENCE_LABELS, evidence.evidenceType)}を本文で確認`}><span className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground"><LocateFixed size={10} />{displayLabel(STORY_MEANING_EVIDENCE_LABELS, evidence.evidenceType)}{!navigable && '（保存された引用）'}</span><q className="whitespace-pre-wrap text-xs">{evidence.exactExcerpt}</q></button>)}</div></section>
          <section className="space-y-3"><h4 className="text-xs font-medium">読み取り</h4>{eventClaims.map(claim => <div key={claim.id} className="space-y-2 rounded bg-secondary/30 p-3"><p className="text-sm">{claim.statement}</p><div className="flex flex-wrap gap-1"><Badge variant="outline" title={claim.layer === 'observed' ? '本文にその記述・発話・出来事が存在するという意味です。作品世界の客観的真実を保証するものではありません。' : undefined}>{displayLabel(STORY_MEANING_LAYER_LABELS, claim.layer)}</Badge><Badge variant="outline">{displayLabel(STORY_MEANING_DIMENSION_LABELS, claim.dimension)}</Badge><Badge variant="secondary">{displayLabel(STORY_MEANING_SUPPORT_LABELS, claim.supportLevel)}</Badge>{claim.impactScope && <Badge variant="outline">範囲：{displayLabel(STORY_MEANING_IMPACT_LABELS, claim.impactScope)}</Badge>}</div>
            <p className="text-[10px] text-muted-foreground">参照する根拠：{claim.evidenceRefs.map(ref => event.evidence.find(value => value.localEvidenceKey === ref)).filter(Boolean).map(value => displayLabel(STORY_MEANING_EVIDENCE_LABELS, value!.evidenceType)).join('、')}</p>
            {claim.relatedEntities.length > 0 && <div className="flex flex-wrap gap-1">{claim.relatedEntities.map(entity => <Badge key={`${entity.type}:${entity.id}`} variant="outline" className={entity.deleted ? 'text-muted-foreground' : ''}>{entity.label}</Badge>)}</div>}
            <div className="rounded border border-border/50 p-2"><p className="mb-1 text-[10px] text-muted-foreground">作者の判断：{claim.latestDecision ? displayLabel(STORY_MEANING_DECISION_LABELS, claim.latestDecision.decision) : '未判断'}</p>{claim.latestDecision?.authorInterpretation && <p className="mb-2 text-xs">作者の別解釈：{claim.latestDecision.authorInterpretation}</p>}<Textarea maxLength={4000} value={interpretations[claim.id] || ''} onChange={event => setInterpretations(current => ({ ...current, [claim.id]: event.target.value }))} placeholder="「別解釈」を選ぶ場合に、作者の読みを入力" className="mb-2 min-h-14 text-xs" aria-label="作者の別解釈" /><div className="flex flex-wrap gap-1">{Object.entries(STORY_MEANING_DECISION_LABELS).map(([decision, label]) => <Button key={decision} type="button" size="sm" variant="outline" className="h-7 text-[10px]" disabled={loading} title={decision === 'adopted' ? 'この解釈を作品理解として採用します。設定や正史へ自動反映されることはありません。' : undefined} onClick={() => void decide(claim, decision)}>{label}</Button>)}</div>{claim.decisionHistory.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-[10px] text-muted-foreground">判断履歴（{claim.decisionHistory.length}件）</summary><ul className="mt-1 space-y-1 text-[10px] text-muted-foreground">{claim.decisionHistory.map(decision => <li key={decision.id}>{new Date(decision.createdAt).toLocaleString(APP_LOCALE)}：{displayLabel(STORY_MEANING_DECISION_LABELS, decision.decision)}{decision.authorInterpretation ? ` — ${decision.authorInterpretation}` : ''}{!decision.fresh && '（過去の解析条件）'}</li>)}</ul></details>}</div>
          </div>)}</section>
        </div>}</CardContent></Card>;
      })}
    </div></ScrollArea>
    <div className="border-t border-border/50 p-2 text-[10px] text-muted-foreground">解析結果と作者判断は、本文・設定・正史を自動変更しません。</div>
  </div>;
}
