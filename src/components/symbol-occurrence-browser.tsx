'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { displayLabel, SYMBOL_RESOLUTION_STATUS_LABELS } from '@/lib/i18n';

interface ChapterOption { id: string; order: number; title: string }
interface UsageOption { id: string; label: string; active: boolean }
interface DefinitionOption { id: string; openSymbol: string; closeSymbol: string; label: string; active: boolean; defaultUsageRuleId: string | null; usageRules: UsageOption[] }
interface OccurrenceItem {
  id: string; startOffset: number; endOffset: number; openSymbol: string; closeSymbol: string; rawText: string;
  contextBefore: string; contextAfter: string; depth: number; status: string; definition: DefinitionOption | null;
  usageRule: UsageOption | null; override: { id: string; usageRuleId: string | null } | null;
  suggestedRange: { startOffset: number; endOffset: number } | null; reanchorState: 'reanchorable' | 'ambiguous' | 'not_found' | null;
  orphanedOverride: boolean;
}
interface AnalysisValue {
  chapter: ChapterOption; definitions: DefinitionOption[]; items: OccurrenceItem[];
  counts: { total: number; unresolved: number; review: number; confirmed: number }; parseCount: 1;
}
type Filter = 'all' | 'unresolved' | 'review' | 'confirmed';

const FILTERS: Array<[Filter, string]> = [['all', 'すべて'], ['unresolved', '未分類'], ['review', '要再確認'], ['confirmed', '分類済み']];
const groupFor = (status: string): Exclude<Filter, 'all'> => status === 'unresolved' || status === 'convention_only' ? 'unresolved' : status === 'stale_override' || status === 'invalid_structure' ? 'review' : 'confirmed';

async function errorMessage(response: Response) {
  const data = await response.json().catch(() => ({})) as { error?: string };
  return data.error || '操作に失敗しました。';
}

export function SymbolOccurrenceBrowser({ projectId }: { projectId: string }) {
  const [chapters, setChapters] = useState<ChapterOption[]>([]); const [chapterId, setChapterId] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisValue | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all'); const [pairFilter, setPairFilter] = useState(''); const [selection, setSelection] = useState<Record<string, string>>({});
  const requestToken = useRef(0);

  useEffect(() => {
    const controller = new AbortController(); const token = ++requestToken.current;
    setChapters([]); setChapterId(''); setAnalysis(null); setError('');
    fetch(`/api/chapters?projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('章一覧を読み込めませんでした。');
      const values = await response.json() as ChapterOption[];
      if (token === requestToken.current) { setChapters(values); setChapterId(values[0]?.id || ''); }
    }).catch(caught => { if (!controller.signal.aborted && token === requestToken.current) setError(caught instanceof Error ? caught.message : '章一覧を読み込めませんでした。'); });
    return () => controller.abort();
  }, [projectId]);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!chapterId) { setAnalysis(null); return; }
    const token = ++requestToken.current; setLoading(true); setError('');
    try {
      const response = await fetch(`/api/symbol-occurrences?projectId=${encodeURIComponent(projectId)}&chapterId=${encodeURIComponent(chapterId)}`, { signal });
      if (!response.ok) throw new Error(await errorMessage(response));
      const value = await response.json() as AnalysisValue;
      if (!signal?.aborted && token === requestToken.current) { setAnalysis(value); setSelection({}); }
    } catch (caught) {
      if (!signal?.aborted && token === requestToken.current) setError(caught instanceof Error ? caught.message : '本文中の表記を読み込めませんでした。');
    } finally { if (!signal?.aborted && token === requestToken.current) setLoading(false); }
  }, [chapterId, projectId]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener('symbol-dictionary-changed', refresh); return () => window.removeEventListener('symbol-dictionary-changed', refresh);
  }, [load]);

  const mutate = async (url: string, method: string, body?: unknown) => {
    const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) { const message = await errorMessage(response); setError(message); toast.error(message); return false; }
    window.dispatchEvent(new CustomEvent('symbol-dictionary-changed', { detail: { source: 'browser' } })); return true;
  };

  const applyUsage = async (item: OccurrenceItem, usageRuleId: string) => {
    if (!usageRuleId || !item.definition) return;
    const range = item.status === 'stale_override' ? item.suggestedRange : { startOffset: item.startOffset, endOffset: item.endOffset };
    if (!range) return;
    const body = { projectId, chapterId, definitionId: item.definition.id, usageRuleId, startOffset: range.startOffset, endOffset: range.endOffset, ...(item.override && { id: item.override.id }) };
    if (await mutate('/api/symbol-occurrence-overrides', item.override ? 'PUT' : 'POST', body)) toast.success(item.override ? '位置と用途を確認しました。' : 'この箇所だけに用途を適用しました。');
  };
  const clearOverride = async (item: OccurrenceItem) => {
    if (!item.override) return;
    if (await mutate(`/api/symbol-occurrence-overrides?projectId=${encodeURIComponent(projectId)}&id=${encodeURIComponent(item.override.id)}`, 'DELETE')) toast.success('個別指定を解除しました。');
  };
  const setDefault = async (item: OccurrenceItem, usageRuleId: string) => {
    if (!usageRuleId || !item.definition) return;
    if (await mutate('/api/symbol-usage-rules/default', 'PUT', { projectId, definitionId: item.definition.id, usageRuleId })) toast.success('この表記の既定用途を更新しました。');
  };

  const pairs = useMemo(() => [...new Map((analysis?.items || []).filter(value => value.openSymbol || value.closeSymbol).map(value => [`${value.openSymbol}\u0000${value.closeSymbol}`, `${value.openSymbol}${value.closeSymbol}`])).entries()], [analysis]);
  const visible = (analysis?.items || []).filter(item => (filter === 'all' || groupFor(item.status) === filter) && (!pairFilter || `${item.openSymbol}\u0000${item.closeSymbol}` === pairFilter));

  return <div className="mt-6 space-y-4 border-t pt-6">
    <div><h3 className="text-sm font-medium">本文中の表記</h3><p className="text-xs text-muted-foreground">保存済みの章を1章だけ解析します。未分類の表示だけではデータを保存しません。</p></div>
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-52 flex-1"><label htmlFor="symbol-chapter" className="block text-xs text-muted-foreground mb-1">確認する章</label><select id="symbol-chapter" value={chapterId} onChange={event => { setAnalysis(null); setChapterId(event.target.value); }} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm"><option value="">章を選択してください</option>{chapters.map(chapter => <option key={chapter.id} value={chapter.id}>第{chapter.order + 1}章 {chapter.title || '無題'}</option>)}</select></div>
      <Button size="sm" variant="outline" disabled={!chapterId || loading} onClick={() => void load()}><RefreshCw size={14} className="mr-1" />再読み込み</Button></div>
    {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    {loading && <p className="py-4 text-center text-sm text-muted-foreground">保存済み本文を解析中...</p>}
    {analysis && !loading && <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Badge variant="outline" className="justify-center py-2">全{analysis.counts.total}件</Badge><Badge variant="outline" className="justify-center py-2">未分類 {analysis.counts.unresolved}件</Badge><Badge variant="outline" className="justify-center py-2">要再確認 {analysis.counts.review}件</Badge><Badge variant="outline" className="justify-center py-2">分類済み {analysis.counts.confirmed}件</Badge></div>
      <div className="flex flex-wrap gap-2">{FILTERS.map(([value, label]) => <Button key={value} size="sm" variant={filter === value ? 'default' : 'outline'} onClick={() => setFilter(value)}>{label}</Button>)}
        <select aria-label="表記で絞り込む" value={pairFilter} onChange={event => setPairFilter(event.target.value)} className="h-8 px-2 bg-secondary border border-input rounded-md text-xs"><option value="">すべての記号</option>{pairs.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {visible.length === 0 && <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">該当する表記はありません。</p>}
      <div className="space-y-3">{visible.map(item => {
        const activeUsages = item.definition?.usageRules.filter(value => value.active) || [];
        const selectedUsage = selection[item.id] || item.usageRule?.id || (item.override?.usageRuleId && activeUsages.some(value => value.id === item.override?.usageRuleId) ? item.override.usageRuleId : '') || '';
        const actionable = item.status !== 'invalid_structure' && item.definition?.active && activeUsages.length > 0;
        return <Card key={item.id} className={item.status === 'stale_override' ? 'border-amber-500/40' : ''}><CardContent className="space-y-3 pt-4" style={{ marginLeft: `${Math.min(item.depth, 3) * 12}px` }}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex items-center gap-2"><Badge variant="outline">{item.openSymbol}{item.closeSymbol}</Badge>{item.depth > 0 && <span className="text-[10px] text-muted-foreground">入れ子 深さ{item.depth}</span>}</div><Badge variant={groupFor(item.status) === 'confirmed' ? 'default' : 'secondary'}>{displayLabel(SYMBOL_RESOLUTION_STATUS_LABELS, item.status)}</Badge></div>
          <div className="rounded bg-secondary/30 p-3 text-sm whitespace-pre-wrap break-words"><span className="text-muted-foreground">{item.contextBefore}</span><mark className="rounded bg-primary/20 px-0.5 text-foreground">{item.rawText}</mark><span className="text-muted-foreground">{item.contextAfter}</span></div>
          {item.usageRule && <p className="text-xs">現在の用途：<strong>{item.usageRule.label}</strong></p>}
          {item.status === 'invalid_structure' && <p className="text-xs text-amber-500">開始記号と終了記号の対応を本文で確認してください。構造が直るまで意味は設定できません。</p>}
          {item.reanchorState === 'reanchorable' && <p className="text-xs text-amber-500">本文編集後の新しい位置候補があります。用途を確認し、明示的に適用してください。</p>}
          {item.reanchorState === 'ambiguous' && <p className="text-xs text-amber-500">本文内に同じ表記が複数あるため、自動で位置を特定できません。古い個別指定を解除して対象箇所を選び直してください。</p>}
          {item.reanchorState === 'not_found' && <p className="text-xs text-amber-500">元の表記が現在の本文で見つかりません。不要なら個別指定を解除してください。</p>}
          {!item.definition && item.status !== 'invalid_structure' && <p className="text-xs text-muted-foreground">この表記には意味設定がありません。上の辞書一覧で「意味を設定」し、用途を追加してください。</p>}
          {item.definition && item.definition.usageRules.length === 0 && <p className="text-xs text-muted-foreground">用途が未登録です。上の辞書詳細で用途を追加してください。</p>}
          {actionable && item.reanchorState !== 'ambiguous' && item.reanchorState !== 'not_found' && <div className="space-y-2 rounded-md border p-3"><label htmlFor={`usage-${item.id}`} className="text-xs text-muted-foreground">適用する用途</label><select id={`usage-${item.id}`} value={selectedUsage} onChange={event => setSelection(value => ({ ...value, [item.id]: event.target.value }))} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm"><option value="">用途を選択してください</option>{activeUsages.map(usage => <option key={usage.id} value={usage.id}>{usage.label}</option>)}</select>
            <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!selectedUsage} onClick={() => void applyUsage(item, selectedUsage)}>{item.status === 'stale_override' ? '位置と用途を確認して適用' : 'この箇所だけに適用'}</Button><Button size="sm" variant="outline" disabled={!selectedUsage} onClick={() => void setDefault(item, selectedUsage)}>この表記の既定用途にする</Button></div>
            <p className="text-[10px] text-muted-foreground">「この箇所だけ」はProjectの既定用途を変更しません。「既定用途」は個別指定のない同じ表記へ適用されます。</p></div>}
          {item.override && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void clearOverride(item)}><Trash2 size={13} className="mr-1" />個別指定を解除</Button>}
        </CardContent></Card>;
      })}</div>
    </>}
  </div>;
}
