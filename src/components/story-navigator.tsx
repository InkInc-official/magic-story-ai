'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Compass, Loader2, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { NAVIGATOR_DECISION_STATUS_LABELS, displayLabel } from '@/lib/i18n';
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

  const selectedRun = useMemo(() => runs.find(run => run.id === selectedRunId) || runs[0], [runs, selectedRunId]);

  const loadRuns = useCallback(async (preferredId?: string) => {
    const response = await fetch(`/api/story-navigator/runs?projectId=${projectId}`);
    if (!response.ok) return;
    const data = await response.json() as NavigatorRun[];
    setRuns(data);
    setSelectedRunId(preferredId || data[0]?.id || '');
  }, [projectId]);

  useEffect(() => {
    void Promise.all([
      fetch(`/api/chapters?projectId=${projectId}`).then(async response => {
        if (!response.ok) return;
        const data = await response.json() as ChapterOption[];
        const sorted = [...data].sort((a, b) => b.order - a.order);
        setChapters([...data].sort((a, b) => a.order - b.order));
        setAnchorChapterId(selectDefaultNavigatorAnchor(sorted));
      }),
      loadRuns(),
    ]);
  }, [projectId, loadRuns]);

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
      <div className="grid gap-4">{selectedRun.proposals.map(proposal => <Card key={proposal.id} className="border-violet-500/20"><CardHeader><div className="flex items-start justify-between gap-3"><CardTitle className="text-base">{proposal.routeKey}. {proposal.title}</CardTitle><Badge variant="outline">{displayLabel(NAVIGATOR_DECISION_STATUS_LABELS, proposal.decisionStatus)}</Badge></div><p className="text-[11px] text-muted-foreground">AI提案・正史ではありません</p></CardHeader><CardContent className="space-y-3"><p className="text-sm whitespace-pre-wrap">{proposal.summary}</p><div><h4 className="text-xs font-medium text-muted-foreground">なぜ成立するか</h4><p className="text-sm whitespace-pre-wrap">{proposal.whyPossible}</p></div><div><h4 className="text-xs font-medium text-muted-foreground">作者意図との関係</h4><p className="text-sm whitespace-pre-wrap">{proposal.authorIntentRelation}</p></div><List title="必要な準備" value={proposal.preparation} /><List title="影響する要素" value={proposal.affectedEntities} /><List title="利点" value={proposal.benefits} /><List title="リスク" value={proposal.risks} /><List title="今すぐ配置できる要素" value={proposal.immediateOptions} /><div className="flex flex-wrap gap-2 pt-2"><Button size="sm" variant="outline" onClick={() => decide(proposal.id, 'accepted')}>採用</Button><Button size="sm" variant="outline" onClick={() => decide(proposal.id, 'held')}>保留</Button><Button size="sm" variant="outline" onClick={() => decide(proposal.id, 'rejected')}>却下</Button>{proposal.decisionStatus !== 'undecided' && <Button size="sm" variant="ghost" onClick={() => decide(proposal.id, 'undecided')}>未決定へ戻す</Button>}</div></CardContent></Card>)}</div>
    </>}
  </div>;
}
