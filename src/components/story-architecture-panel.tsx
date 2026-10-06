'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, Bot, Check, ChevronRight, CircleHelp, GitBranch,
  Layers3, Loader2, Plus, RefreshCw, Save, Sparkles, Trash2, X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import type {
  StoryArchitecture, StoryArchitectureBeat, StoryArchitectureConstraint, StoryArchitectureItemType,
  StoryArchitectureQuestion, StoryArchitectureThread,
} from '@/lib/story-architecture/types';

type Item = StoryArchitectureThread | StoryArchitectureBeat | StoryArchitectureConstraint | StoryArchitectureQuestion;
type ItemType = StoryArchitectureItemType | 'relation';
type Selection = { type: Exclude<ItemType, 'relation'>; id: string } | null;
type ViewOrder = 'presentation' | 'story';
type ProposalRun = any;
type ApplyPreview = any;

const STATUS: Record<string, string> = { draft: '下書き', proposed: 'AI提案', approved: '承認済み設計', retired: '使用終了' };
const PROVENANCE: Record<string, string> = { author: '作者', ai_proposal: 'AI提案', imported: 'インポート' };
const THREAD_TYPE: Record<string, string> = { character: '人物', relationship: '関係', mystery: '謎', conflict: '対立', theme: '主題', world: '世界', information: '情報', goal: '目的', custom: '自由指定' };
const RHYTHM: Record<string, string> = { build: '積み上げ', release: '解放', quiet: '静けさ', aftermath: '余波', uncertainty: '不確実', transition: '移行', custom: '自由指定' };
const MODE: Record<string, string> = { required: '必須', forbidden: '禁止', preferred: '希望' };
const SCOPE: Record<string, string> = { architecture: '作品全体', thread: '物語の流れ', beat: '出来事・変化', question: '未決定事項' };
const QUESTION: Record<string, string> = { open: '未決定', deferred: '保留', resolved: '解決済み' };
const RELATION: Record<string, string> = { precedes: '前に起こる', depends_on: '依存する', causes: '原因になる', enables: '成立可能にする' };
const DECISION: Record<string, string> = { approved: '承認', held: '保留', rejected: '却下' };
const OPERATIONS: Record<string, string> = {
  design_scope: 'この範囲を設計する', deepen_thread: '物語の流れを掘り下げる', propose_beats: '出来事・変化を提案する',
  reorder_beats: '順序案を考える', propose_alternatives: '別案を考える', find_gaps: '未決定・不足箇所を探す',
  analyze_impact: '影響を考える', propose_questions: '検討すべき問いを探す', answer_question: 'この問いの案を考える',
};
const inputClass = 'h-8 text-xs';
const selectClass = 'h-8 w-full rounded-md border border-input bg-secondary px-2 text-xs';
const label = (values: Record<string, string>, value: string | null | undefined) => value ? values[value] || value : '未指定';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init); const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || '操作を完了できませんでした。'); (error as any).status = response.status; throw error; }
  return result as T;
}
const json = (body: unknown, method = 'POST'): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function StatusBadges({ item, decision }: { item: Item; decision?: string }) {
  const rejected = item.provenance === 'ai_proposal' && decision === 'rejected';
  return <span className="flex flex-wrap gap-1"><Badge variant="outline" className="text-[9px]">{rejected ? 'AI提案：却下' : label(STATUS, item.status)}</Badge><Badge variant="secondary" className="text-[9px]">{label(PROVENANCE, item.provenance)}</Badge></span>;
}

export function StoryArchitecturePanel({ projectId }: { projectId: string }) {
  const [architecture, setArchitecture] = useState<StoryArchitecture | null>(null);
  const [chapters, setChapters] = useState<Array<{ id: string; title: string; order: number }>>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [viewOrder, setViewOrder] = useState<ViewOrder>('presentation');
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [proposalOpen, setProposalOpen] = useState(false); const [proposalRuns, setProposalRuns] = useState<ProposalRun[]>([]);
  const [proposalOperation, setProposalOperation] = useState('design_scope'); const [proposalInstruction, setProposalInstruction] = useState('');
  const [proposalScope, setProposalScope] = useState('architecture'); const [proposalPending, setProposalPending] = useState(false);
  const [applyPreview, setApplyPreview] = useState<ApplyPreview | null>(null); const [applyPending, setApplyPending] = useState(false);
  const requestId = useRef(0);
  const hasPendingProposal = proposalRuns.some(run => run.status === 'pending');

  const load = useCallback(async (quiet = false) => {
    const id = ++requestId.current; if (!quiet) setLoading(true);
    try {
      const [next, chapterRows] = await Promise.all([
        request<StoryArchitecture | null>(`/api/story-architecture?projectId=${encodeURIComponent(projectId)}`),
        request<Array<{ id: string; title: string; order: number }>>(`/api/chapters?projectId=${encodeURIComponent(projectId)}`),
      ]);
      if (id !== requestId.current) return; setArchitecture(next); setChapters(chapterRows); setError('');
      if (next) {
        const runs = await request<ProposalRun[]>(`/api/story-architecture/proposals?projectId=${encodeURIComponent(projectId)}&architectureId=${encodeURIComponent(next.id)}`);
        if (id === requestId.current) setProposalRuns(runs);
      } else setProposalRuns([]);
    } catch (caught) { if (id === requestId.current) setError(caught instanceof Error ? caught.message : '物語設計を読み込めませんでした。'); }
    finally { if (id === requestId.current && !quiet) setLoading(false); }
  }, [projectId]);

  useEffect(() => {
    requestId.current += 1; setArchitecture(null); setChapters([]); setSelection(null); setDraft({}); setDirty(false); setProposalRuns([]); setProposalOpen(false); setApplyPreview(null); setError('');
    void load(); return () => { requestId.current += 1; };
  }, [load, projectId]);
  useEffect(() => {
    if (!hasPendingProposal) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1; void load(true);
      if (attempts >= 20) window.clearInterval(timer);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [hasPendingProposal, load]);

  const decisions = useMemo(() => {
    const latest = new Map<string, string>();
    for (const value of architecture?.decisions || []) {
      const key = `${value.itemType}:${value.itemId}`;
      if (!latest.has(key)) latest.set(key, value.decision);
    }
    return latest;
  }, [architecture?.decisions]);
  const selected = useMemo<Item | null>(() => {
    if (!architecture || !selection) return null;
    const key = `${selection.type}s` as 'threads' | 'beats' | 'constraints' | 'questions';
    return (architecture[key] as Item[]).find(item => item.id === selection.id) || null;
  }, [architecture, selection]);
  useEffect(() => { if (selected) { setDraft({ ...selected }); setDirty(false); } }, [selected]);

  const beats = useMemo(() => [...(architecture?.beats || [])].sort((a, b) => {
    const key = viewOrder === 'presentation' ? 'presentationOrder' : 'storyOrder';
    return (a[key] ?? Number.MAX_SAFE_INTEGER) - (b[key] ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title);
  }), [architecture?.beats, viewOrder]);
  const selectedThreadId = selection?.type === 'thread' ? selection.id : selected && 'threadId' in selected ? selected.threadId : null;
  const visibleBeats = selectedThreadId ? beats.filter(item => item.threadId === selectedThreadId) : beats;

  const createWorkspace = async () => {
    setSaving(true); setError(''); try { await request('/api/story-architecture', json({ projectId, title: '物語設計', frameworkMode: 'freeform', canonMode: 'respect_current_canon', customFrameworkNotes: '', notes: '' })); await load(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '物語設計を作成できませんでした。'); } finally { setSaving(false); }
  };
  const saveWorkspace = async (patch: Record<string, unknown>) => {
    if (!architecture) return; setSaving(true); setError('');
    try { const next = await request<StoryArchitecture>('/api/story-architecture', json({ projectId, id: architecture.id, expectedRevision: architecture.revision, ...patch }, 'PUT')); setArchitecture(next); setDirty(false); }
    catch (caught) { setError((caught as any)?.status === 409 ? '他の変更が先に保存されています。再読み込みしてください。' : caught instanceof Error ? caught.message : '保存できませんでした。'); } finally { setSaving(false); }
  };
  const newItem = async (type: Exclude<ItemType, 'relation'>) => {
    if (!architecture) return; const common = { projectId, architectureId: architecture.id, itemType: type, status: 'draft' };
    const payload = type === 'thread' ? { ...common, title: '新しい物語の流れ', description: '', threadType: 'custom', customTypeLabel: '自由設計', order: architecture.threads.length }
      : type === 'beat' ? { ...common, threadId: selectedThreadId || null, chapterId: null, title: '新しい出来事・変化', summary: '', intention: '', storyOrder: null, presentationOrder: null, rhythm: null, customRhythmLabel: null }
      : type === 'constraint' ? { ...common, title: '新しい設計条件', statement: '条件を入力してください', mode: 'preferred', scope: 'architecture', threadId: null, beatId: null, order: architecture.constraints.length }
      : { ...common, question: '検討したい未決定事項', notes: '', state: 'open', resolution: null, scope: 'architecture', threadId: null, beatId: null, order: architecture.questions.length };
    setSaving(true); try { const item = await request<Item>('/api/story-architecture/items', json(payload)); await load(true); setSelection({ type, id: item.id }); } catch (caught) { setError(caught instanceof Error ? caught.message : '作成できませんでした。'); } finally { setSaving(false); }
  };
  const saveItem = async () => {
    if (!architecture || !selection || !selected || selected.provenance !== 'author') return; setSaving(true); setError('');
    const { id: _id, architectureId: _architectureId, provenance: _provenance, proposalAlternativeId: _alternative, revision: _revision, ...fields } = draft;
    try { await request('/api/story-architecture/items', json({ projectId, architectureId: architecture.id, itemType: selection.type, id: selected.id, expectedRevision: selected.revision, ...fields }, 'PUT')); await load(true); setDirty(false); }
    catch (caught) { setError((caught as any)?.status === 409 ? '他の変更が先に保存されています。再読み込みしてください。' : caught instanceof Error ? caught.message : '保存できませんでした。'); } finally { setSaving(false); }
  };
  const deleteItem = async () => {
    if (!architecture || !selection || !selected || selected.provenance !== 'author' || !window.confirm('この項目を削除しますか？参照されている項目は削除できません。')) return;
    setSaving(true); try { await request(`/api/story-architecture/items?projectId=${encodeURIComponent(projectId)}&architectureId=${encodeURIComponent(architecture.id)}&itemType=${selection.type}&id=${encodeURIComponent(selected.id)}`, { method: 'DELETE' }); setSelection(null); await load(true); }
    catch (caught) { setError((caught as any)?.status === 409 ? '他の項目から参照されているため削除できません。関係や参照を先に確認してください。' : caught instanceof Error ? caught.message : '削除できませんでした。'); } finally { setSaving(false); }
  };
  const decide = async (item: Item, type: StoryArchitectureItemType, decision: string) => {
    if (!architecture) return; setSaving(true); try { await request('/api/story-architecture/decisions', json({ projectId, architectureId: architecture.id, itemType: type, itemId: item.id, decision, note: '' })); await load(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '作者判断を保存できませんでした。'); } finally { setSaving(false); }
  };
  const reorder = async (type: 'thread' | 'constraint' | 'question', id: string, direction: -1 | 1) => {
    if (!architecture) return; const key = `${type}s` as 'threads'|'constraints'|'questions'; const values = (architecture[key] as Item[]).filter(item => item.provenance === 'author'); const index = values.findIndex(item => item.id === id); const swap = index + direction; if (index < 0 || swap < 0 || swap >= values.length) return;
    const ids = values.map(item => item.id); [ids[index], ids[swap]] = [ids[swap], ids[index]]; setSaving(true);
    try { await request('/api/story-architecture/items/reorder', json({ projectId, architectureId: architecture.id, itemType: type, orderedIds: ids })); await load(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '並び替えできませんでした。'); } finally { setSaving(false); }
  };
  const createRelation = async (fromBeatId: string, toBeatId: string, type: string) => {
    if (!architecture) return; setSaving(true); try { await request('/api/story-architecture/items', json({ projectId, architectureId: architecture.id, itemType: 'relation', fromBeatId, toBeatId, type })); await load(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '前後関係を保存できませんでした。'); } finally { setSaving(false); }
  };
  const deleteRelation = async (id: string) => {
    if (!architecture) return; setSaving(true); try { await request(`/api/story-architecture/items?projectId=${encodeURIComponent(projectId)}&architectureId=${encodeURIComponent(architecture.id)}&itemType=relation&id=${encodeURIComponent(id)}`, { method: 'DELETE' }); await load(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '前後関係を削除できませんでした。'); } finally { setSaving(false); }
  };
  const generateProposal = async () => {
    if (!architecture) return; if (dirty || saving) { setError('AI提案を実行する前に変更を保存してください。'); return; }
    const scopeId = proposalScope === 'architecture' ? undefined : selected?.id; if (!scopeId) { setError('提案対象の項目を選択してください。'); return; }
    setProposalPending(true); setError(''); try { await request('/api/story-architecture/proposals', json({ projectId, architectureId: architecture.id, operation: proposalOperation, scope: { type: proposalScope, ...(scopeId ? { id: scopeId } : {}) }, instruction: proposalInstruction, force: false })); await load(true); setProposalOpen(false); setProposalInstruction(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'AI提案を生成できませんでした。'); } finally { setProposalPending(false); }
  };
  const startApply = async (item: Item, type: 'thread' | 'beat') => {
    if (!architecture) return; if (dirty || saving) { setError('Plot計画への反映を準備する前に変更を保存してください。'); return; }
    setApplyPending(true); setError(''); try { const action = await request<any>('/api/story-architecture/apply-actions/draft', json({ projectId, architectureId: architecture.id, sourceItemType: type, sourceItemId: item.id })); const preview = await request<any>('/api/story-architecture/apply-actions/preview', json({ projectId, actionId: action.id })); setApplyPreview(preview); }
    catch (caught) { setError(caught instanceof Error ? caught.message : '反映内容を準備できませんでした。'); } finally { setApplyPending(false); }
  };
  const applyAction = async (operation: 'approve'|'execute'|'cancel') => {
    if (!applyPreview) return; setApplyPending(true); try { const action = await request<any>(`/api/story-architecture/apply-actions/${operation}`, json({ projectId, actionId: applyPreview.action.id })); if (operation === 'cancel') setApplyPreview(null); else if (operation === 'approve') setApplyPreview({ ...applyPreview, action }); else setApplyPreview({ ...applyPreview, action }); }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : '反映操作を完了できませんでした。');
      try { setApplyPreview(await request('/api/story-architecture/apply-actions/preview', json({ projectId, actionId: applyPreview.action.id }))); } catch { /* safe message above remains */ }
    } finally { setApplyPending(false); }
  };

  if (loading) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" size={16}/>物語設計を読み込んでいます</div>;
  if (!architecture) return <div className="flex h-full items-center justify-center p-6"><Card className="max-w-lg"><CardContent className="space-y-4 p-8 text-center"><Layers3 className="mx-auto text-sky-400"/><div><h2 className="font-semibold">まだ物語設計は作成されていません。</h2><p className="mt-1 text-xs text-muted-foreground">物語の流れ、出来事、設計条件、未決定事項を、正史や本文とは分けて検討できます。</p></div>{error && <p className="text-xs text-destructive">{error}</p>}<Button onClick={() => void createWorkspace()} disabled={saving}>{saving && <Loader2 className="mr-1 animate-spin" size={13}/>}物語設計を始める</Button></CardContent></Card></div>;

  return <div className="flex h-full min-h-0 flex-col">
    <header className="shrink-0 border-b border-border/60 px-3 py-2 md:px-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="flex items-center gap-2"><Layers3 size={18} className="text-sky-400"/><h1 className="font-semibold">物語設計</h1><Badge variant="outline">{architecture.canonMode === 'revise_canon' ? '正史の改稿を検討' : '現在の正史を維持'}</Badge></div><p className="text-[10px] text-muted-foreground">AI提案・承認済み設計・正史・反映済みデータは別の状態です。</p></div><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => void load()} disabled={saving}><RefreshCw size={13}/><span className="sr-only">再読み込み</span></Button><Button size="sm" onClick={() => setProposalOpen(true)} disabled={saving || dirty || proposalPending}><Sparkles size={13} className="mr-1"/>AIに提案してもらう</Button></div></div>{architecture.canonMode === 'revise_canon' && <p className="mt-2 rounded bg-amber-500/10 p-2 text-xs text-amber-700">現在の正史を変更対象として検討できます。ここで作る案だけでは正史は変更されません。</p>}{dirty && <p className="mt-2 text-xs text-amber-600">未保存の変更があります。AI提案とPlot計画への反映は保存まで実行できません。</p>}{error && <p className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}</header>
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[240px_minmax(320px,1fr)_360px] lg:overflow-hidden">
      <aside className="border-b border-border/60 lg:border-b-0 lg:border-r"><ScrollArea className="h-full"><div className="space-y-3 p-3"><div className="flex items-center justify-between"><div><h2 className="text-xs font-semibold">物語の流れ / Thread</h2><p className="text-[10px] text-muted-foreground">作品を通して続く人物・関係・謎などの流れです。</p></div><Button size="sm" variant="ghost" aria-label="物語の流れを追加" onClick={() => void newItem('thread')}><Plus size={14}/></Button></div><button type="button" onClick={() => setSelection(null)} className={`w-full rounded p-2 text-left text-xs ${!selection ? 'bg-primary/10 text-primary' : 'bg-secondary/30'}`}>全体・未分類</button>{architecture.threads.map((item, index) => <div key={item.id} className={`rounded border p-2 ${selection?.type === 'thread' && selection.id === item.id ? 'border-primary/50 bg-primary/5' : 'border-border/50'}`}><button type="button" className="w-full text-left" onClick={() => setSelection({ type: 'thread', id: item.id })}><span className="block truncate text-xs font-medium">{item.title}</span><span className="mt-1 flex justify-between"><span className="text-[9px] text-muted-foreground">{label(THREAD_TYPE, item.threadType)}</span><StatusBadges item={item} decision={decisions.get(`thread:${item.id}`)}/></span></button>{item.provenance === 'author' && <div className="mt-1 flex justify-end"><Button size="sm" variant="ghost" className="h-6 w-6 p-0" aria-label="上へ" disabled={index === 0 || saving} onClick={() => void reorder('thread', item.id, -1)}><ArrowUp size={11}/></Button><Button size="sm" variant="ghost" className="h-6 w-6 p-0" aria-label="下へ" disabled={index === architecture.threads.length - 1 || saving} onClick={() => void reorder('thread', item.id, 1)}><ArrowDown size={11}/></Button></div>}</div>)}</div></ScrollArea></aside>
      <main className="border-b border-border/60 lg:border-b-0 lg:border-r"><ScrollArea className="h-full"><div className="space-y-3 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xs font-semibold">出来事・変化 / Beat</h2><p className="text-[10px] text-muted-foreground">物語の中で予定している意味のある出来事や変化です。</p></div><div className="flex gap-1"><Button size="sm" variant={viewOrder === 'presentation' ? 'secondary' : 'ghost'} onClick={() => setViewOrder('presentation')}>読者への提示順</Button><Button size="sm" variant={viewOrder === 'story' ? 'secondary' : 'ghost'} onClick={() => setViewOrder('story')}>作中時系列</Button><Button size="sm" variant="outline" onClick={() => void newItem('beat')}><Plus size={13} className="mr-1"/>追加</Button></div></div>{visibleBeats.length === 0 && <p className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">この範囲にはまだ出来事・変化がありません。非線形構成や静かな構造も正常な設計です。</p>}{visibleBeats.map(item => <button type="button" key={item.id} onClick={() => setSelection({ type: 'beat', id: item.id })} className={`block w-full rounded border p-3 text-left ${selection?.type === 'beat' && selection.id === item.id ? 'border-primary/50 bg-primary/5' : 'border-border/50'}`}><div className="flex justify-between gap-2"><span className="text-sm font-medium">{item.title}</span><StatusBadges item={item} decision={decisions.get(`beat:${item.id}`)}/></div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summary || '概要は未入力です。'}</p><div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"><span>作中時系列：{item.storyOrder ?? '未指定'}</span><span>読者への提示順：{item.presentationOrder ?? '未指定'}</span><span>章：{item.chapterId ? '割当済み' : '未割当'}</span><span>リズム：{label(RHYTHM, item.rhythm)}</span></div>{item.storyOrder !== null && item.presentationOrder !== null && item.storyOrder !== item.presentationOrder && <Badge variant="outline" className="mt-2 text-[9px]">非線形の提示</Badge>}</button>)}
        <section className="space-y-2 border-t pt-3"><div className="flex items-center justify-between"><div><h3 className="text-xs font-semibold">設計条件</h3><p className="text-[10px] text-muted-foreground">物語の内容・構造について守りたい条件です。創作ルールとは別に管理します。</p></div><Button size="sm" variant="ghost" onClick={() => void newItem('constraint')}><Plus size={13}/></Button></div>{architecture.constraints.map((item,index)=><div key={item.id} className="flex items-start gap-2 rounded bg-secondary/30 p-2"><button className="min-w-0 flex-1 text-left" onClick={() => setSelection({type:'constraint',id:item.id})}><span className="block text-xs font-medium">{item.title}</span><span className="text-[10px] text-muted-foreground">{label(MODE,item.mode)}・{label(SCOPE,item.scope)}</span></button>{item.provenance==='author'&&<span className="flex"><Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={index===0} onClick={()=>void reorder('constraint',item.id,-1)}><ArrowUp size={10}/></Button><Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={index===architecture.constraints.length-1} onClick={()=>void reorder('constraint',item.id,1)}><ArrowDown size={10}/></Button></span>}</div>)}</section>
        <section className="space-y-2 border-t pt-3"><div className="flex items-center justify-between"><div><h3 className="text-xs font-semibold">未決定事項</h3><p className="text-[10px] text-muted-foreground">未決定や保留はエラーではなく、正常な設計状態です。</p></div><Button size="sm" variant="ghost" onClick={() => void newItem('question')}><Plus size={13}/></Button></div>{architecture.questions.map(item=><button key={item.id} className="block w-full rounded bg-secondary/30 p-2 text-left" onClick={() => setSelection({type:'question',id:item.id})}><span className="flex justify-between gap-2 text-xs"><span>{item.question}</span><Badge variant="outline" className="text-[9px]">{label(QUESTION,item.state)}</Badge></span>{item.state==='deferred'&&<span className="text-[9px] text-muted-foreground">AI提案の回答対象には自動選択されません。</span>}</button>)}</section>
        <ProposalHistory runs={proposalRuns} architecture={architecture} decisions={decisions} onDecide={decide} saving={saving} onSelect={(type,id)=>setSelection({type,id})}/>
      </div></ScrollArea></main>
      <aside><ScrollArea className="h-full"><div className="space-y-3 p-3">{selected ? <ItemEditor item={selected} type={selection!.type} draft={draft} setDraft={value=>{setDraft(value);setDirty(true);}} architecture={architecture} chapters={chapters} saving={saving} dirty={dirty} onSave={saveItem} onDelete={deleteItem} onDecide={decision=>void decide(selected,selection!.type,decision)} onApply={() => selection && (selection.type==='thread'||selection.type==='beat') ? void startApply(selected,selection.type) : undefined} decision={decisions.get(`${selection!.type}:${selected.id}`)} createRelation={createRelation} deleteRelation={deleteRelation}/> : <WorkspaceEditor architecture={architecture} saving={saving} onDirty={()=>setDirty(true)} onSave={saveWorkspace}/>}</div></ScrollArea></aside>
    </div>
    {proposalOpen && <ProposalDialog operation={proposalOperation} setOperation={setProposalOperation} scope={proposalScope} setScope={setProposalScope} instruction={proposalInstruction} setInstruction={setProposalInstruction} selection={selection} pending={proposalPending} dirty={dirty||saving} onClose={()=>setProposalOpen(false)} onGenerate={generateProposal}/>}
    {applyPreview && <ApplyDialog preview={applyPreview} pending={applyPending} onClose={()=>setApplyPreview(null)} onApprove={()=>void applyAction('approve')} onExecute={()=>void applyAction('execute')} onCancel={()=>void applyAction('cancel')}/>}
  </div>;
}

function WorkspaceEditor({ architecture, saving, onDirty, onSave }: { architecture: StoryArchitecture; saving: boolean; onDirty:()=>void; onSave: (patch: Record<string,unknown>)=>void }) {
  const [value,setValue]=useState({title:architecture.title,frameworkMode:architecture.frameworkMode,customFrameworkNotes:architecture.customFrameworkNotes,canonMode:architecture.canonMode,notes:architecture.notes});
  useEffect(()=>setValue({title:architecture.title,frameworkMode:architecture.frameworkMode,customFrameworkNotes:architecture.customFrameworkNotes,canonMode:architecture.canonMode,notes:architecture.notes}),[architecture]);
  useEffect(()=>{if(value.title!==architecture.title||value.frameworkMode!==architecture.frameworkMode||value.customFrameworkNotes!==architecture.customFrameworkNotes||value.canonMode!==architecture.canonMode||value.notes!==architecture.notes)onDirty()},[architecture,onDirty,value]);
  return <Card><CardHeader><CardTitle className="text-sm">Workspace設定</CardTitle></CardHeader><CardContent className="space-y-3"><Field name="タイトル"><Input className={inputClass} value={value.title} onChange={e=>setValue({...value,title:e.target.value})}/></Field><Field name="設計方法"><select className={selectClass} value={value.frameworkMode} onChange={e=>setValue({...value,frameworkMode:e.target.value as any})}><option value="freeform">自由設計</option><option value="custom">カスタム</option></select></Field>{value.frameworkMode==='custom'&&<Field name="カスタム設計メモ"><Textarea value={value.customFrameworkNotes} onChange={e=>setValue({...value,customFrameworkNotes:e.target.value})}/></Field>}<Field name="正史との関係"><select className={selectClass} value={value.canonMode} onChange={e=>setValue({...value,canonMode:e.target.value as any})}><option value="respect_current_canon">現在の正史を維持</option><option value="revise_canon">正史の改稿を検討</option></select></Field><p className="text-[10px] text-muted-foreground">承認済み設計も正史ではありません。正史や本文へ自動反映されません。</p><Field name="設計メモ"><Textarea value={value.notes} onChange={e=>setValue({...value,notes:e.target.value})}/></Field><Button size="sm" disabled={saving||!value.title.trim()} onClick={()=>void onSave(value)}><Save size={13} className="mr-1"/>Workspace設定を保存</Button></CardContent></Card>;
}

function Field({name,children}:{name:string;children:React.ReactNode}){return <div className="space-y-1"><Label className="text-[10px]">{name}</Label>{children}</div>}

function ItemEditor({item,type,draft,setDraft,architecture,chapters,saving,dirty,onSave,onDelete,onDecide,onApply,decision,createRelation,deleteRelation}:{item:Item;type:Exclude<ItemType,'relation'>;draft:Record<string,any>;setDraft:(v:Record<string,any>)=>void;architecture:StoryArchitecture;chapters:Array<{id:string;title:string;order:number}>;saving:boolean;dirty:boolean;onSave:()=>void;onDelete:()=>void;onDecide:(v:string)=>void;onApply:()=>void;decision?:string;createRelation:(from:string,to:string,type:string)=>void;deleteRelation:(id:string)=>void}){
  const author=item.provenance==='author'; const update=(key:string,value:any)=>setDraft({...draft,[key]:value});
  return <><Card><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-sm">詳細</CardTitle><StatusBadges item={item} decision={decision}/></div></CardHeader><CardContent className="space-y-3">{type==='thread'&&<><Field name="タイトル"><Input className={inputClass} disabled={!author} value={draft.title||''} onChange={e=>update('title',e.target.value)}/></Field><Field name="説明"><Textarea disabled={!author} value={draft.description||''} onChange={e=>update('description',e.target.value)}/></Field><Field name="種類"><select className={selectClass} disabled={!author} value={draft.threadType||'custom'} onChange={e=>update('threadType',e.target.value)}>{Object.entries(THREAD_TYPE).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>{draft.threadType==='custom'&&<Field name="自由指定の種類"><Input className={inputClass} disabled={!author} value={draft.customTypeLabel||''} onChange={e=>update('customTypeLabel',e.target.value||null)}/></Field>}</>}{type==='beat'&&<><Field name="タイトル"><Input className={inputClass} disabled={!author} value={draft.title||''} onChange={e=>update('title',e.target.value)}/></Field><Field name="概要"><Textarea disabled={!author} value={draft.summary||''} onChange={e=>update('summary',e.target.value)}/></Field><Field name="この出来事の意図"><Textarea disabled={!author} value={draft.intention||''} onChange={e=>update('intention',e.target.value)}/></Field><Field name="物語の流れ"><select className={selectClass} disabled={!author} value={draft.threadId||''} onChange={e=>update('threadId',e.target.value||null)}><option value="">全体・未分類</option>{architecture.threads.map(v=><option key={v.id} value={v.id}>{v.title}</option>)}</select></Field><Field name="割り当てる章"><select className={selectClass} disabled={!author} value={draft.chapterId||''} onChange={e=>update('chapterId',e.target.value||null)}><option value="">未割当</option>{chapters.sort((a,b)=>a.order-b.order).map(v=><option key={v.id} value={v.id}>{v.order+1}. {v.title}</option>)}</select></Field><div className="grid grid-cols-2 gap-2"><Field name="作中時系列"><Input type="number" min={0} className={inputClass} disabled={!author} value={draft.storyOrder??''} onChange={e=>update('storyOrder',e.target.value===''?null:Number(e.target.value))}/></Field><Field name="読者への提示順"><Input type="number" min={0} className={inputClass} disabled={!author} value={draft.presentationOrder??''} onChange={e=>update('presentationOrder',e.target.value===''?null:Number(e.target.value))}/></Field></div><Field name="リズム"><select className={selectClass} disabled={!author} value={draft.rhythm||''} onChange={e=>update('rhythm',e.target.value||null)}><option value="">未指定</option>{Object.entries(RHYTHM).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field></>}{type==='constraint'&&<><Field name="条件名"><Input className={inputClass} disabled={!author} value={draft.title||''} onChange={e=>update('title',e.target.value)}/></Field><Field name="条件"><Textarea disabled={!author} value={draft.statement||''} onChange={e=>update('statement',e.target.value)}/></Field><Field name="扱い"><select className={selectClass} disabled={!author} value={draft.mode||'preferred'} onChange={e=>update('mode',e.target.value)}>{Object.entries(MODE).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field><Field name="範囲"><select className={selectClass} disabled={!author} value={draft.scope||'architecture'} onChange={e=>setDraft({...draft,scope:e.target.value,threadId:null,beatId:null})}>{Object.entries(SCOPE).filter(([v])=>v!=='question').map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>{draft.scope==='thread'&&<Field name="対象の物語の流れ"><select className={selectClass} disabled={!author} value={draft.threadId||''} onChange={e=>update('threadId',e.target.value||null)}><option value="">選択</option>{architecture.threads.map(v=><option key={v.id} value={v.id}>{v.title}</option>)}</select></Field>}{draft.scope==='beat'&&<Field name="対象の出来事・変化"><select className={selectClass} disabled={!author} value={draft.beatId||''} onChange={e=>update('beatId',e.target.value||null)}><option value="">選択</option>{architecture.beats.map(v=><option key={v.id} value={v.id}>{v.title}</option>)}</select></Field>}</>}{type==='question'&&<><Field name="未決定事項"><Textarea disabled={!author} value={draft.question||''} onChange={e=>update('question',e.target.value)}/></Field><Field name="検討メモ"><Textarea disabled={!author} value={draft.notes||''} onChange={e=>update('notes',e.target.value)}/></Field><Field name="状態"><select className={selectClass} disabled={!author} value={draft.state||'open'} onChange={e=>setDraft({...draft,state:e.target.value,resolution:e.target.value==='resolved'?draft.resolution:null})}>{Object.entries(QUESTION).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>{draft.state==='resolved'&&<Field name="決定内容"><Textarea disabled={!author} value={draft.resolution||''} onChange={e=>update('resolution',e.target.value||null)}/></Field>}</>}
      {author?<div className="flex flex-wrap gap-1"><Button size="sm" disabled={saving||!dirty} onClick={onSave}><Save size={12} className="mr-1"/>保存</Button><Button size="sm" variant="outline" disabled={saving} onClick={()=>update('status',item.status==='approved'?'draft':'approved')}>{draft.status==='approved'?'承認済み設計':'設計として承認'}</Button><Button size="sm" variant="ghost" disabled={saving} onClick={()=>update('status','retired')}>使用終了にする</Button><Button size="sm" variant="ghost" className="text-destructive" disabled={saving} onClick={onDelete}><Trash2 size={12}/><span className="sr-only">削除</span></Button></div>:<div className="space-y-2 rounded border p-2"><p className="text-[10px] text-muted-foreground">AI提案への作者判断。承認しても正史や本文には反映されません。</p><div className="flex gap-1">{Object.entries(DECISION).map(([v,l])=><Button key={v} size="sm" variant="outline" disabled={saving} onClick={()=>onDecide(v)}>{l}</Button>)}</div></div>}
      {(type==='thread'||type==='beat')&&item.status==='approved'&&<div className="rounded border border-sky-500/30 bg-sky-500/5 p-2"><p className="mb-2 text-[10px] text-muted-foreground">承認済み設計です。正史ではなく、まだPlotにも反映されていません。</p><Button size="sm" variant="outline" disabled={saving||dirty} onClick={onApply}>Plot計画への反映を準備</Button></div>}</CardContent></Card>{type==='beat'&&<RelationEditor beat={item as StoryArchitectureBeat} architecture={architecture} disabled={saving} createRelation={createRelation} deleteRelation={deleteRelation}/>}</>;
}

function RelationEditor({beat,architecture,disabled,createRelation,deleteRelation}:{beat:StoryArchitectureBeat;architecture:StoryArchitecture;disabled:boolean;createRelation:(from:string,to:string,type:string)=>void;deleteRelation:(id:string)=>void}){
  const [target,setTarget]=useState('');const [type,setType]=useState('precedes');const rows=architecture.relations.filter(v=>v.fromBeatId===beat.id||v.toBeatId===beat.id);
  return <Card><CardHeader><CardTitle className="text-xs">前後関係・依存</CardTitle></CardHeader><CardContent className="space-y-2">{rows.map(row=><div key={row.id} className="flex items-center justify-between rounded bg-secondary/30 p-2 text-[10px]"><span>{architecture.beats.find(v=>v.id===row.fromBeatId)?.title} → {label(RELATION,row.type)} → {architecture.beats.find(v=>v.id===row.toBeatId)?.title}</span><Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={disabled} onClick={()=>deleteRelation(row.id)}><X size={11}/></Button></div>)}<select aria-label="関係先" className={selectClass} value={target} onChange={e=>setTarget(e.target.value)}><option value="">関係先を選択</option>{architecture.beats.filter(v=>v.id!==beat.id).map(v=><option key={v.id} value={v.id}>{v.title}</option>)}</select><select aria-label="関係の種類" className={selectClass} value={type} onChange={e=>setType(e.target.value)}>{Object.entries(RELATION).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><Button size="sm" variant="outline" disabled={disabled||!target} onClick={()=>{createRelation(beat.id,target,type);setTarget('')}}>関係を追加</Button></CardContent></Card>;
}

function ProposalHistory({runs,architecture,decisions,onDecide,saving,onSelect}:{runs:ProposalRun[];architecture:StoryArchitecture;decisions:Map<string,string>;onDecide:(item:Item,type:StoryArchitectureItemType,decision:string)=>void;saving:boolean;onSelect:(type:Exclude<ItemType,'relation'>,id:string)=>void}){
  return <section className="space-y-2 border-t pt-3"><h3 className="text-xs font-semibold">AI提案と過去の提案</h3>{runs.length===0&&<p className="text-[10px] text-muted-foreground">AI提案はまだありません。画面を開くだけでは生成されません。</p>}{runs.map((run,index)=><details key={run.id} open={index===0} className="rounded border border-border/50 p-2"><summary className="cursor-pointer text-xs"><span className="font-medium">{index===0?'最新の提案':'過去の提案'}</span> — {run.status==='pending'?'生成中':run.status==='completed'?'生成完了':'失敗'} — {OPERATIONS[run.operation]||run.operation}</summary>{run.status==='failed'&&<p className="mt-2 text-xs text-destructive">この提案は生成を完了できませんでした。</p>}{run.alternatives?.map((alternative:any,altIndex:number)=><div key={alternative.id} className="mt-3 rounded bg-secondary/20 p-3"><h4 className="text-sm font-semibold">{alternative.label||`案${String.fromCharCode(65+altIndex)}`}</h4><p className="mt-1 text-xs">{alternative.rationale}</p>{alternative.tradeoffs?.length>0&&<ul className="mt-1 list-disc pl-4 text-[10px] text-muted-foreground">{alternative.tradeoffs.map((v:string)=><li key={v}>{v}</li>)}</ul>}<ProposalItems title="物語の流れ" type="thread" items={alternative.threads} decisions={decisions} saving={saving} onDecide={onDecide} onSelect={onSelect}/><ProposalItems title="出来事・変化" type="beat" items={alternative.beats} decisions={decisions} saving={saving} onDecide={onDecide} onSelect={onSelect}/><ProposalItems title="設計条件" type="constraint" items={alternative.constraints} decisions={decisions} saving={saving} onDecide={onDecide} onSelect={onSelect}/><ProposalItems title="未決定事項" type="question" items={alternative.questions} decisions={decisions} saving={saving} onDecide={onDecide} onSelect={onSelect}/>{alternative.relations?.length>0&&<p className="mt-2 text-[10px] text-muted-foreground">前後関係・依存：{alternative.relations.length}件</p>}</div>)}</details>)}</section>;
}
function ProposalItems({title,type,items,decisions,saving,onDecide,onSelect}:{title:string;type:StoryArchitectureItemType;items:Item[];decisions:Map<string,string>;saving:boolean;onDecide:(item:Item,type:StoryArchitectureItemType,decision:string)=>void;onSelect:(type:Exclude<ItemType,'relation'>,id:string)=>void}){if(!items?.length)return null;return <div className="mt-2 space-y-1"><h5 className="text-[10px] font-semibold">{title}</h5>{items.map(item=>{const current=decisions.get(`${type}:${item.id}`);const text=type==='question'?(item as StoryArchitectureQuestion).question:(item as any).title;return <div key={item.id} className="rounded border border-border/40 p-2"><button className="text-left text-xs" onClick={()=>onSelect(type,item.id)}>{text}</button><div className="mt-1 flex flex-wrap items-center gap-1">{current&&<Badge variant="outline" className="text-[9px]">作者判断：{DECISION[current]}</Badge>}{Object.entries(DECISION).map(([v,l])=><Button key={v} size="sm" variant="ghost" className="h-6 text-[9px]" disabled={saving} onClick={()=>onDecide(item,type,v)}>{l}</Button>)}</div></div>})}</div>}

function ProposalDialog({operation,setOperation,scope,setScope,instruction,setInstruction,selection,pending,dirty,onClose,onGenerate}:{operation:string;setOperation:(v:string)=>void;scope:string;setScope:(v:string)=>void;instruction:string;setInstruction:(v:string)=>void;selection:Selection;pending:boolean;dirty:boolean;onClose:()=>void;onGenerate:()=>void}){return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="proposal-title"><Card className="w-full max-w-lg"><CardHeader><CardTitle id="proposal-title" className="flex items-center gap-2"><Bot size={16}/>AIに設計案を提案してもらう</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">AI提案は設計候補です。正史・承認済み設計・Plotへ自動反映されません。</p><Field name="依頼内容"><select className={selectClass} value={operation} onChange={e=>setOperation(e.target.value)}>{Object.entries(OPERATIONS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field><Field name="対象範囲"><select className={selectClass} value={scope} onChange={e=>setScope(e.target.value)}><option value="architecture">作品全体</option>{selection?.type==='thread'&&<option value="thread">選択中の物語の流れ</option>}{selection?.type==='beat'&&<option value="beat">選択中の出来事・変化</option>}{selection?.type==='question'&&<option value="question">選択中の未決定事項</option>}</select></Field><Field name="作者からの指示"><Textarea maxLength={5000} value={instruction} onChange={e=>setInstruction(e.target.value)} placeholder="何を検討してほしいか具体的に入力"/></Field>{dirty&&<p className="text-xs text-amber-600">AI提案を実行する前に変更を保存してください。</p>}<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>閉じる</Button><Button disabled={pending||dirty||!instruction.trim()} onClick={onGenerate}>{pending&&<Loader2 size={13} className="mr-1 animate-spin"/>}AIに提案してもらう</Button></div></CardContent></Card></div>}

function ApplyDialog({preview,pending,onClose,onApprove,onExecute,onCancel}:{preview:any;pending:boolean;onClose:()=>void;onApprove:()=>void;onExecute:()=>void;onCancel:()=>void}){const payload=preview.target.payload;const status=preview.action.status;const fresh=preview.source.fresh;return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="apply-title"><Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto"><CardHeader><CardTitle id="apply-title">Plot計画への反映内容</CardTitle></CardHeader><CardContent className="space-y-3">{!fresh&&<p className="rounded bg-amber-500/10 p-2 text-xs text-amber-700">この反映案は元の設計または作品状態が変更されたため、再作成が必要です。</p>}<div className="grid grid-cols-2 gap-2 text-xs"><span>反映先：Plot</span><span>操作：新規作成</span><span>状態：計画（planned）</span><span>作成：1 / 更新：0 / 削除：0</span></div><div className="rounded border p-3 text-xs"><p><b>名前：</b>{payload.name}</p><p className="whitespace-pre-wrap"><b>説明：</b>{payload.description||'なし'}</p><p><b>Plot type：</b>main（初期版ではメインPlotとして作成）</p><p><b>状態：</b>planned</p><p><b>優先度：</b>0</p><p><b>タグ：</b>なし</p><p><b>順序：</b>{payload.order}</p></div><div className="rounded bg-secondary/30 p-3 text-xs"><p className="font-medium">変更されないもの</p><p>StoryFact：変更なし / 登場人物の知識：変更なし / 人物関係：変更なし</p><p>章本文：変更なし / 伏線状態：変更なし / 正史：変更なし</p></div>{status==='draft'&&<p className="text-xs">次に「この反映内容を承認」を押しても、Plotはまだ作成されません。</p>}{status==='approved'&&<p className="text-xs font-medium">反映内容は承認済みです。「Plotを作成する」を押したときだけ新規Plotを作成します。</p>}{status==='applied'&&<p className="rounded bg-emerald-500/10 p-2 text-xs text-emerald-700">Plotを作成しました。作成済みPlotはここから自動削除されません。結果ID：{preview.action.resultTargetId}</p>}<div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={onClose}>閉じる</Button>{(status==='draft'||status==='approved')&&<Button variant="outline" disabled={pending} onClick={onCancel}>反映を取り消す</Button>}{status==='draft'&&<Button disabled={pending||!fresh} onClick={onApprove}><Check size={13} className="mr-1"/>この反映内容を承認</Button>}{status==='approved'&&<Button disabled={pending||!fresh} onClick={onExecute}>{pending&&<Loader2 size={13} className="mr-1 animate-spin"/>}Plotを作成する</Button>}</div></CardContent></Card></div>}
