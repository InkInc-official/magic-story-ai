'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ScanSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface InspectorIssue {
  category: 'viewpoint' | 'knowledge' | 'voice' | 'narrative_rule'; issueType: string; locationKind: 'excerpt' | 'chapter'; excerpt: string; startOffset: number; endOffset: number;
  explanation: string; suggestedDirection: string; severity: 'problem' | 'check' | 'suggestion'; evidenceRefs: string[]; adjustments?: string[];
}

const ISSUE_LABELS: Record<string, string> = {
  pov_shift: '視点移動', other_character_inner_state: '他人物の内面', narrator_pov_confusion: '語り手と視点の混同', perspective_mismatch: '視点方式との不一致',
  unknown_fact_assertion: '未認識情報の断定', reader_hidden_leak: '未開示情報の漏洩候補', future_knowledge: '未来知識', belief_truth_conflict: '人物認識との不一致', knowledge_timing_unclear: '認識タイミング要確認',
  first_person_mismatch: '一人称の不一致', address_term_mismatch: '呼称の不一致', speech_register_mismatch: '敬語・話法の不一致', speech_style_mismatch: '台詞口調の不一致', narration_voice_mismatch: '地の文の声の不一致', speaker_unclear: '話者・相手の確認',
  required_rule_missing: '必須ルールの欠落候補', forbidden_rule_violation: '禁止ルールへの抵触候補', rule_conflict: 'ルール間の競合', rule_application_unclear: 'ルール適用範囲の確認',
};
const SEVERITY_LABELS = { problem: '明示設定との不整合', check: '確認候補', suggestion: '任意提案' } as const;
const CATEGORY_LABELS = { viewpoint: '視点', knowledge: '知識', voice: '声', narrative_rule: '作品ルール' } as const;
const evidenceLabel = (ref: string) => ref.startsWith('rule:') ? '作品固有ルール' : ref.startsWith('fact:') ? '作者設定（詳細は自動展開しません）' : ref.startsWith('knowledge:') ? '人物認識履歴' : ref.startsWith('relationship:') ? '相手別話法' : ref.startsWith('character:') ? '人物音声設定' : ref.startsWith('narrator:') ? '語り手設定' : ref.startsWith('pov:') ? '視点人物設定' : '視点方式';

export function NarrativeInspectorPanel({ projectId, chapterId, onSelectRange }: { projectId: string; chapterId: string; onSelectRange?: (start: number, end: number) => void }) {
  const [issues, setIssues] = useState<InspectorIssue[]>([]);
  const [filter, setFilter] = useState<'all' | InspectorIssue['category']>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inspect = async () => {
    setLoading(true); setError(''); setIssues([]);
    try {
      const response = await fetch('/api/narrative-inspector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, chapterId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '叙述検査に失敗しました');
      setIssues(result.issues || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '叙述検査に失敗しました'); }
    finally { setLoading(false); }
  };
  const visible = issues.filter(issue => filter === 'all' || issue.category === filter);

  return <div className="flex h-full flex-col">
    <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
      <div><div className="flex items-center gap-2"><ScanSearch size={16} className="text-violet-400" /><span className="text-sm font-medium">叙述検査</span></div><p className="mt-0.5 text-[10px] text-muted-foreground">保存済み本文の視点・知識・声・作品ルールを確認します</p></div>
      <Button size="sm" onClick={() => void inspect()} disabled={loading}>{loading ? <Loader2 size={13} className="mr-1 animate-spin" /> : <ScanSearch size={13} className="mr-1" />}検査</Button>
    </div>
    <div className="flex flex-wrap gap-1 border-b border-border/50 p-2">{(['all', 'viewpoint', 'knowledge', 'voice', 'narrative_rule'] as const).map(value => <Button key={value} size="sm" variant={filter === value ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setFilter(value)}>{value === 'all' ? 'すべて' : CATEGORY_LABELS[value]}</Button>)}</div>
    <ScrollArea className="flex-1"><div className="space-y-3 p-3">
      {error && <Card className="border-destructive/30 bg-destructive/5"><CardContent className="p-3 text-xs text-destructive">{error}</CardContent></Card>}
      {!loading && !error && issues.length === 0 && <div className="py-10 text-center text-muted-foreground"><CheckCircle2 size={28} className="mx-auto mb-2 opacity-40" /><p className="text-xs">「検査」を押すと確認候補を表示します</p><p className="mt-1 text-[10px]">結果は採点ではなく、作者が判断するための候補です。</p></div>}
      {visible.map((issue, index) => <button key={`${issue.issueType}:${issue.startOffset}:${index}`} type="button" onClick={() => issue.locationKind === 'excerpt' && onSelectRange?.(issue.startOffset, issue.endOffset)} className="w-full text-left"><Card className="border-border/60 transition-colors hover:border-violet-400/40"><CardContent className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-1"><Badge variant="outline">{CATEGORY_LABELS[issue.category]}</Badge><Badge variant="outline">{ISSUE_LABELS[issue.issueType] || issue.issueType}</Badge><Badge variant={issue.severity === 'problem' ? 'destructive' : 'secondary'}>{SEVERITY_LABELS[issue.severity]}</Badge></div>
        {issue.locationKind === 'excerpt' ? <blockquote className="border-l-2 border-violet-400/40 pl-2 text-xs text-foreground">{issue.excerpt}</blockquote> : <p className="text-xs text-muted-foreground">章全体に対する確認候補</p>}
        <div><p className="text-[10px] font-medium text-muted-foreground">確認理由</p><p className="text-xs text-foreground/80">{issue.explanation}</p></div>
        <div><p className="text-[10px] font-medium text-muted-foreground">確認・修正の方向</p><p className="text-xs text-foreground/80">{issue.suggestedDirection}</p></div>
        <div className="flex flex-wrap gap-1">{[...new Set(issue.evidenceRefs.map(evidenceLabel))].map(label => <Badge key={label} variant="outline" className="text-[9px]">{label}</Badge>)}</div>
      </CardContent></Card></button>)}
      {issues.length > 0 && visible.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">この分類の確認候補はありません</p>}
    </div></ScrollArea>
    <div className="border-t border-border/50 p-2 text-[10px] text-muted-foreground"><AlertTriangle size={10} className="mr-1 inline" />本文は自動変更されません。クリックすると該当位置を選択します。</div>
  </div>;
}
