'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Compass, Loader2, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { NAVIGATOR_DECISION_STATUS_LABELS, NAVIGATOR_PROMOTION_STATUS_LABELS, displayLabel } from '@/lib/i18n';
import type { StoryNavigatorDecisionStatus } from '@/lib/story-navigator/structured-output';
import { selectDefaultNavigatorAnchor } from '@/lib/story-navigator/structured-output';

interface ChapterOption { id: string; order: number; title: string; content: string }
interface Proposal {
  id: string; routeKey: string; title: string; summary: string; whyPossible: string; authorIntentRelation: string;
  preparation: string; affectedEntities: string; benefits: string; risks: string; immediateOptions: string;
  decisionStatus: StoryNavigatorDecisionStatus;
}
interface NavigatorRun {
  id: string; request: string; status: string; error: string; createdAt: string; currentPositionSummary: string; planDeviation: string;
  anchorChapter: { id: string; order: number; title: string }; proposals: Proposal[];
}
interface Observation { id: string; sourceChapterOrder: number; sourceChapterTitle: string; sourceExcerpt: string; elementSummary: string; reasonInteresting: string; possibleUses: string; currentStoryRelation: string; authorIntentRelation: string; risks: string; relevance: string; decisionStatus: StoryNavigatorDecisionStatus }
interface ExplorationRun { id: string; status: string; error: string; createdAt: string; processedBatches: number; totalBatches: number; anchorChapter: { order: number; title: string }; observations: Observation[] }
interface PromotionAction { id: string; sourceType: string; sourceProposalId?: string; sourceObservationId?: string; targetType: 'plot' | 'foreshadowing'; proposedPayload: string; reason: string; status: string; createdEntityId?: string; error: string }

function arrayValue(value: string): string[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []; } catch { return []; }
}

function List({ title, value }: { title: string; value: string }) {
  const items = arrayValue(value);
  if (items.length === 0) return null;
  return <div><h4 className="text-xs font-medium text-muted-foreground mb-1">{title}</h4><ul className="text-sm list-disc pl-5 space-y-1">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>;
}

export function StoryNavigator({ projectId }: { projectId: string }) {
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [anchorChapterId, setAnchorChapterId] = useState('');
  const [request, setRequest] = useState('');
  const [runs, setRuns] = useState<NavigatorRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [explorations, setExplorations] = useState<ExplorationRun[]>([]);
  const [selectedExplorationId, setSelectedExplorationId] = useState('');
  const [rangeMode, setRangeMode] = useState<'all' | 'recent' | 'range'>('recent');
  const [recentCount, setRecentCount] = useState(5);
  const [startChapterId, setStartChapterId] = useState('');
  const [endChapterId, setEndChapterId] = useState('');
  const [isExploring, setIsExploring] = useState(false);
  const [promotions, setPromotions] = useState<PromotionAction[]>([]);
  const [promotionBusy, setPromotionBusy] = useState('');

  const selectedRun = useMemo(() => runs.find(run => run.id === selectedRunId) || runs[0], [runs, selectedRunId]);
  const selectedExploration = useMemo(() => explorations.find(run => run.id === selectedExplorationId) || explorations[0], [explorations, selectedExplorationId]);

  const loadRuns = useCallback(async (preferredId?: string) => {
    const response = await fetch(`/api/story-navigator/runs?projectId=${projectId}`);
    if (!response.ok) return;
    const data = await response.json() as NavigatorRun[];
    setRuns(data);
    setSelectedRunId(preferredId || data[0]?.id || '');
  }, [projectId]);
  const loadExplorations = useCallback(async (preferredId?: string) => {
    const response = await fetch(`/api/story-navigator/explorations?projectId=${projectId}`);
    if (!response.ok) return;
    const data = await response.json() as ExplorationRun[];
    setExplorations(data); setSelectedExplorationId(preferredId || data[0]?.id || '');
  }, [projectId]);
  const loadPromotions = useCallback(async () => {
    const response = await fetch(`/api/story-navigator/promotions?projectId=${projectId}`);
    if (response.ok) setPromotions(await response.json() as PromotionAction[]);
  }, [projectId]);

  useEffect(() => {
    setRuns([]); setSelectedRunId(''); setExplorations([]); setSelectedExplorationId(''); setPromotions([]); setAnchorChapterId(''); setError('');
    void Promise.all([
      fetch(`/api/chapters?projectId=${projectId}`).then(async response => {
        if (!response.ok) return;
        const data = await response.json() as ChapterOption[];
        const sorted = [...data].sort((a, b) => b.order - a.order);
        setChapters([...data].sort((a, b) => a.order - b.order));
        setAnchorChapterId(selectDefaultNavigatorAnchor(sorted));
      }),
      loadRuns(), loadExplorations(), loadPromotions(),
    ]);
  }, [projectId, loadRuns, loadExplorations, loadPromotions]);

  const generate = async () => {
    if (!anchorChapterId) return;
    setIsGenerating(true); setError('');
    try {
      const response = await fetch('/api/story-navigator/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, anchorChapterId, request }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '生成に失敗しました');
      await loadRuns(data.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '生成に失敗しました'); }
    finally { setIsGenerating(false); }
  };

  const decide = async (proposalId: string, decisionStatus: StoryNavigatorDecisionStatus) => {
    const response = await fetch('/api/story-navigator/proposals', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, proposalId, decisionStatus }) });
    if (response.ok && selectedRun) await loadRuns(selectedRun.id);
  };
  const explore = async () => {
    if (!anchorChapterId) return;
    setIsExploring(true); setError('');
    try {
      const response = await fetch('/api/story-navigator/explorations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, anchorChapterId, rangeMode, recentCount, startChapterId, endChapterId }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '探索に失敗しました');
      await loadExplorations(data.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '探索に失敗しました'); } finally { setIsExploring(false); }
  };
  const decideObservation = async (observationId: string, decisionStatus: StoryNavigatorDecisionStatus) => {
    const response = await fetch('/api/story-navigator/observations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, observationId, decisionStatus }) });
    if (response.ok && selectedExploration) await loadExplorations(selectedExploration.id);
  };
  const createPromotion = async (sourceType: string, sourceId: string) => {
    setPromotionBusy(sourceId); setError('');
    try {
      const response = await fetch('/api/story-navigator/promotions/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, sourceType, sourceId }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '反映案の作成に失敗しました');
      await loadPromotions();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '反映案の作成に失敗しました'); } finally { setPromotionBusy(''); }
  };
  const reviewPromotion = async (actionId: string, status: 'approved' | 'rejected') => {
    setPromotionBusy(actionId);
    const response = await fetch('/api/story-navigator/promotions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, actionId, status }) });
    if (!response.ok) { const data = await response.json(); setError(data.error || '審査に失敗しました'); }
    await loadPromotions(); setPromotionBusy('');
  };
  const applyPromotion = async (actionId: string) => {
    setPromotionBusy(actionId);
    const response = await fetch('/api/story-navigator/promotions/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, actionId }) });
    if (!response.ok) { const data = await response.json(); setError(data.error || '反映に失敗しました'); }
    await loadPromotions(); setPromotionBusy('');
  };
  const promotionCards = (sourceType: string, sourceId: string) => promotions.filter(action => action.sourceType === sourceType && (action.sourceProposalId === sourceId || action.sourceObservationId === sourceId)).map(action => {
    let payload: Record<string, unknown> = {}; try { payload = JSON.parse(action.proposedPayload); } catch { /* display invalid legacy data safely */ }
    return <div key={action.id} className="rounded-md border p-3 space-y-2 bg-secondary/20"><div className="flex justify-between gap-2"><p className="text-sm font-medium">{action.targetType === 'plot' ? 'Plot（正式な物語計画）' : '伏線・再利用計画'}</p><Badge variant="outline">{displayLabel(NAVIGATOR_PROMOTION_STATUS_LABELS, action.status)}</Badge></div><p className="text-xs">理由：{action.reason}</p><pre className="text-xs whitespace-pre-wrap overflow-auto bg-background/60 rounded p-2">{JSON.stringify(payload, null, 2)}</pre><p className="text-[11px] text-muted-foreground">反映すると新しい{action.targetType === 'plot' ? 'Plot' : 'Foreshadowing'}が1件作成されます。元の提案・発見結果は履歴として残ります。</p>{action.error && <p className="text-xs text-destructive">{action.error}</p>}<div className="flex gap-2">{action.status === 'draft' && <><Button size="sm" onClick={() => reviewPromotion(action.id, 'approved')} disabled={promotionBusy === action.id}>反映案を承認</Button><Button size="sm" variant="outline" onClick={() => reviewPromotion(action.id, 'rejected')} disabled={promotionBusy === action.id}>反映しない</Button></>}{action.status === 'approved' && <Button size="sm" onClick={() => applyPromotion(action.id)} disabled={promotionBusy === action.id}>正式設定・計画へ反映</Button>}{action.status === 'applied' && <p className="text-xs text-emerald-500">反映済み（作成ID: {action.createdEntityId}）</p>}{action.status === 'stale' && <p className="text-xs text-amber-500">元情報が変わったため、反映案を作り直してください。</p>}</div></div>;
  });

  return <div className="max-w-5xl mx-auto space-y-5">
    <div className="flex items-center gap-2"><Compass className="text-violet-400" size={22} /><div><h2 className="text-lg font-bold">物語ナビゲーター</h2><p className="text-xs text-muted-foreground">現在地から複数の未来候補を考えます。提案はすべて非正史です。</p></div></div>
    <Card><CardHeader><CardTitle className="text-sm">未来候補を考える</CardTitle></CardHeader><CardContent className="space-y-4">
      <div><label className="block text-xs text-muted-foreground mb-1">どこまで書いた時点から考えるか</label><select value={anchorChapterId} onChange={event => setAnchorChapterId(event.target.value)} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm"><option value="">章を選択</option>{chapters.map(chapter => <option key={chapter.id} value={chapter.id}>第{chapter.order + 1}章 {chapter.title || '無題'}{chapter.content?.trim() ? '' : '（本文なし）'}</option>)}</select></div>
      <div><label className="block text-xs text-muted-foreground mb-1">作者の質問・指示</label><Textarea value={request} onChange={event => setRequest(event.target.value)} rows={3} placeholder="例：この後どう展開できる？" /></div>
      <Button onClick={generate} disabled={isGenerating || !anchorChapterId}>{isGenerating ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Compass size={15} className="mr-2" />}未来候補を考える</Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </CardContent></Card>

    {runs.length > 0 && <div><label className="block text-xs text-muted-foreground mb-1">過去の実行</label><select value={selectedRun?.id || ''} onChange={event => setSelectedRunId(event.target.value)} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm">{runs.map(run => <option key={run.id} value={run.id}>{new Date(run.createdAt).toLocaleString('ja-JP')}／第{run.anchorChapter.order + 1}章／{run.request || '質問なし'}／{run.status}</option>)}</select></div>}

    {selectedRun && <>
      <Card><CardHeader><CardTitle className="text-sm">AIが理解した現在地</CardTitle></CardHeader><CardContent className="space-y-2"><p className="text-sm whitespace-pre-wrap">{selectedRun.currentPositionSummary || (selectedRun.status === 'failed' ? selectedRun.error : '生成中')}</p>{arrayValue(selectedRun.planDeviation).length > 0 && <div><p className="text-xs text-muted-foreground">当初計画との主なズレ</p><ul className="list-disc pl-5 text-sm">{arrayValue(selectedRun.planDeviation).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>}</CardContent></Card>
      <div className="flex items-center gap-2 text-xs text-amber-500"><ShieldAlert size={14} />以下はAI提案であり、採用してもまだ正史には反映されません。</div>
      <div className="grid gap-4">{selectedRun.proposals.map(proposal => <Card key={proposal.id} className="border-violet-500/20"><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{proposal.routeKey}. {proposal.title}</CardTitle><Badge variant="outline">{displayLabel(NAVIGATOR_DECISION_STATUS_LABELS, proposal.decisionStatus)}</Badge></div><p className="text-[11px] text-muted-foreground">AI提案・正史ではありません</p></CardHeader><CardContent className="space-y-3"><p className="text-sm whitespace-pre-wrap">{proposal.summary}</p><div><h4 className="text-xs font-medium text-muted-foreground">なぜ成立するか</h4><p className="text-sm whitespace-pre-wrap">{proposal.whyPossible}</p></div><div><h4 className="text-xs font-medium text-muted-foreground">作者意図との関係</h4><p className="text-sm whitespace-pre-wrap">{proposal.authorIntentRelation}</p></div><List title="必要な準備" value={proposal.preparation} /><List title="影響する要素" value={proposal.affectedEntities} /><List title="利点" value={proposal.benefits} /><List title="リスク" value={proposal.risks} /><List title="今すぐ配置できる要素" value={proposal.immediateOptions} /><div className="flex flex-wrap gap-2 pt-2"><Button size="sm" variant="outline" onClick={() => decide(proposal.id, 'accepted')}>採用</Button><Button size="sm" variant="outline" onClick={() => decide(proposal.id, 'held')}>保留</Button><Button size="sm" variant="outline" onClick={() => decide(proposal.id, 'rejected')}>却下</Button>{proposal.decisionStatus !== 'undecided' && <Button size="sm" variant="ghost" onClick={() => decide(proposal.id, 'undecided')}>未決定へ戻す</Button>}{proposal.decisionStatus === 'accepted' && <Button size="sm" onClick={() => createPromotion('navigator_proposal', proposal.id)} disabled={promotionBusy === proposal.id}>正式設定・計画への反映案を作る</Button>}</div>{promotionCards('navigator_proposal', proposal.id)}</CardContent></Card>)}</div>
    </>}
    <div className="pt-4 border-t"><h3 className="text-base font-bold">過去要素探索</h3><p className="text-xs text-muted-foreground">過去の描写から、今後活用できる可能性を探します。発見結果は伏線でも正史でもありません。</p></div>
    <Card><CardContent className="pt-6 space-y-4"><div><label className="text-xs text-muted-foreground">探索範囲</label><select value={rangeMode} onChange={event => setRangeMode(event.target.value as typeof rangeMode)} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm"><option value="all">anchorまでの全過去章</option><option value="recent">最近N章</option><option value="range">開始章〜終了章</option></select></div>{rangeMode === 'recent' && <div><label className="text-xs text-muted-foreground">章数</label><input type="number" min={1} max={50} value={recentCount} onChange={event => setRecentCount(Number(event.target.value))} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm" /></div>}{rangeMode === 'range' && <div className="grid grid-cols-2 gap-3"><select value={startChapterId} onChange={event => setStartChapterId(event.target.value)} className="h-9 px-3 bg-secondary border border-input rounded-md text-sm"><option value="">開始章</option>{chapters.map(chapter => <option key={chapter.id} value={chapter.id}>第{chapter.order + 1}章</option>)}</select><select value={endChapterId} onChange={event => setEndChapterId(event.target.value)} className="h-9 px-3 bg-secondary border border-input rounded-md text-sm"><option value="">終了章</option>{chapters.map(chapter => <option key={chapter.id} value={chapter.id}>第{chapter.order + 1}章</option>)}</select></div>}<Button onClick={explore} disabled={isExploring || !anchorChapterId || (rangeMode === 'range' && (!startChapterId || !endChapterId))}>{isExploring && <Loader2 size={15} className="mr-2 animate-spin" />}過去要素を探す</Button></CardContent></Card>
    {explorations.length > 0 && <select value={selectedExploration?.id || ''} onChange={event => setSelectedExplorationId(event.target.value)} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm">{explorations.map(run => <option key={run.id} value={run.id}>{new Date(run.createdAt).toLocaleString('ja-JP')}／第{run.anchorChapter.order + 1}章／{run.status}</option>)}</select>}
    {selectedExploration && <div className="space-y-3"><p className="text-xs text-muted-foreground">走査batch: {selectedExploration.processedBatches}/{selectedExploration.totalBatches}</p>{selectedExploration.status === 'failed' && <p className="text-sm text-destructive">探索は完了していません：{selectedExploration.error}</p>}{selectedExploration.observations.map(observation => <Card key={observation.id}><CardHeader><div className="flex justify-between gap-2"><CardTitle className="text-sm">活用候補：{observation.elementSummary}</CardTitle><Badge variant="outline">{displayLabel(NAVIGATOR_DECISION_STATUS_LABELS, observation.decisionStatus)}</Badge></div><p className="text-[11px] text-muted-foreground">探索実行時の第{observation.sourceChapterOrder + 1}章「{observation.sourceChapterTitle}」本文抜粋（現在の本文では変更されている可能性があります）</p></CardHeader><CardContent className="space-y-3"><blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">{observation.sourceExcerpt}</blockquote><p className="text-sm">{observation.reasonInteresting}</p><List title="活用できる可能性" value={observation.possibleUses} /><div><h4 className="text-xs text-muted-foreground">現在の物語との関係</h4><p className="text-sm">{observation.currentStoryRelation}</p></div><div><h4 className="text-xs text-muted-foreground">作者意図との関係</h4><p className="text-sm">{observation.authorIntentRelation}</p></div><List title="リスク" value={observation.risks} /><p className="text-xs text-amber-500">採用しても、まだ正史には反映されません。</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => decideObservation(observation.id, 'accepted')}>採用</Button><Button size="sm" variant="outline" onClick={() => decideObservation(observation.id, 'held')}>保留</Button><Button size="sm" variant="outline" onClick={() => decideObservation(observation.id, 'rejected')}>却下</Button>{observation.decisionStatus !== 'undecided' && <Button size="sm" variant="ghost" onClick={() => decideObservation(observation.id, 'undecided')}>未決定へ戻す</Button>}{observation.decisionStatus === 'accepted' && <Button size="sm" onClick={() => createPromotion('navigator_observation', observation.id)} disabled={promotionBusy === observation.id}>正式設定・計画への反映案を作る</Button>}</div>{promotionCards('navigator_observation', observation.id)}</CardContent></Card>)}</div>}
  </div>;
}
