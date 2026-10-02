'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, GraduationCap, Lightbulb, Loader2, ScanSearch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

interface InspectorIssue {
  id: string; status: 'open' | 'resolved' | 'stale' | 'superseded'; firstDetectedAt: string; lastDetectedAt: string;
  category: 'viewpoint' | 'knowledge' | 'voice' | 'narrative_rule'; issueType: string; locationKind: 'excerpt' | 'chapter'; excerpt: string; startOffset: number; endOffset: number;
  explanation: string; suggestedDirection: string; severity: 'problem' | 'check' | 'suggestion'; evidenceRefs: string[]; adjustments?: string[];
  latestDecision: { decision: 'accepted_issue' | 'allowed_exception' | 'not_an_issue'; authorNote: string; createdAt: string; fresh: boolean } | null;
}
interface LearningSession {
  id: string; issueId: string; status: 'active' | 'completed' | 'stale' | 'abandoned'; currentHintLevel: number;
  issueExcerptSnapshot: string; issueExplanationSnapshot: string; evidenceRefsSnapshot: string[];
  steps: Array<{ id: string; level: number; type: string; content: string }>;
}

const ISSUE_LABELS: Record<string, string> = {
  pov_shift: '視点移動', other_character_inner_state: '他人物の内面', narrator_pov_confusion: '語り手と視点の混同', perspective_mismatch: '視点方式との不一致',
  unknown_fact_assertion: '未認識情報の断定', reader_hidden_leak: '未開示情報の漏洩候補', future_knowledge: '未来知識', belief_truth_conflict: '人物認識との不一致', knowledge_timing_unclear: '認識タイミング要確認',
  first_person_mismatch: '一人称の不一致', address_term_mismatch: '呼称の不一致', speech_register_mismatch: '敬語・話法の不一致', speech_style_mismatch: '台詞口調の不一致', narration_voice_mismatch: '地の文の声の不一致', speaker_unclear: '話者・相手の確認',
  required_rule_missing: '必須ルールの欠落候補', forbidden_rule_violation: '禁止ルールへの抵触候補', rule_conflict: 'ルール間の競合', rule_application_unclear: 'ルール適用範囲の確認',
};
const SEVERITY_LABELS = { problem: '明示設定との不整合', check: '確認候補', suggestion: '任意提案' } as const;
const CATEGORY_LABELS = { viewpoint: '視点', knowledge: '知識', voice: '声', narrative_rule: '作品ルール' } as const;
const DECISION_LABELS = { accepted_issue: '問題として認定', allowed_exception: '今回は許可', not_an_issue: '誤検出' } as const;
const evidenceLabel = (ref: string) => ref.startsWith('rule:') ? '作品固有ルール' : ref.startsWith('fact:') ? '作者設定（詳細は自動展開しません）' : ref.startsWith('knowledge:') ? '人物認識履歴' : ref.startsWith('relationship:') ? '相手別話法' : ref.startsWith('character:') ? '人物音声設定' : ref.startsWith('narrator:') ? '語り手設定' : ref.startsWith('pov:') ? '視点人物設定' : '視点方式';

export function NarrativeInspectorPanel({ projectId, chapterId, hasUnsavedChanges = false, onSelectRange }: { projectId: string; chapterId: string; hasUnsavedChanges?: boolean; onSelectRange?: (start: number, end: number) => void }) {
  const [issues, setIssues] = useState<InspectorIssue[]>([]);
  const [filter, setFilter] = useState<'all' | InspectorIssue['category']>('all');
  const [statusFilter, setStatusFilter] = useState<'current' | 'resolved'>('current');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [learningSession, setLearningSession] = useState<LearningSession | null>(null);
  const [learningLoading, setLearningLoading] = useState(false);

  const loadHistory = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/narrative-inspector?projectId=${encodeURIComponent(projectId)}&chapterId=${encodeURIComponent(chapterId)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '叙述検査履歴の取得に失敗しました');
      setIssues(result.issues || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '叙述検査履歴の取得に失敗しました'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadHistory(); }, [projectId, chapterId]);
  useEffect(() => { setLearningSession(null); }, [chapterId]);

  const inspect = async () => {
    if (hasUnsavedChanges) { setError('未保存の本文または視点・語り手設定があります。保存してから検査してください。'); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/narrative-inspector', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, chapterId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '叙述検査に失敗しました');
      setIssues(result.issues || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '叙述検査に失敗しました'); }
    finally { setLoading(false); }
  };
  const decide = async (issue: InspectorIssue, decision: keyof typeof DECISION_LABELS) => {
    if (hasUnsavedChanges) { setError('未保存の変更を保存してから作者判断を記録してください。'); return; }
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/narrative-inspector/issues/${issue.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, decision, authorNote: notes[issue.id] || '' }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '作者判断の保存に失敗しました');
      await loadHistory();
    } catch (caught) { setError(caught instanceof Error ? caught.message : '作者判断の保存に失敗しました'); setLoading(false); }
  };
  const startLearning = async (issue: InspectorIssue) => {
    if (hasUnsavedChanges) { setError('未保存の変更を保存してから学習モードを開始してください。'); return; }
    setLearningLoading(true); setError('');
    try {
      const response = await fetch(`/api/narrative-inspector/issues/${issue.id}/learning`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '学習モードを開始できませんでした');
      setLearningSession(result.session);
    } catch (caught) { setError(caught instanceof Error ? caught.message : '学習モードを開始できませんでした'); }
    finally { setLearningLoading(false); }
  };
  const requestHint = async () => {
    if (!learningSession) return;
    if (hasUnsavedChanges) { setError('未保存の変更があります。保存後に学習を続けてください。'); return; }
    setLearningLoading(true); setError('');
    try {
      const response = await fetch(`/api/narrative-inspector/learning/${learningSession.id}/hint`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ヒントを生成できませんでした');
      setLearningSession(result.session);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'ヒントを生成できませんでした'); }
    finally { setLearningLoading(false); }
  };
  const reinspectLearning = async () => {
    if (!learningSession) return;
    if (hasUnsavedChanges) { setError('未保存の本文を保存してから再検査してください。'); return; }
    await inspect();
    try {
      const response = await fetch(`/api/narrative-inspector/issues/${learningSession.issueId}/learning?projectId=${encodeURIComponent(projectId)}`);
      const result = await response.json();
      if (response.ok) setLearningSession(result.session);
    } catch { /* Inspector result remains visible even if session refresh fails. */ }
  };
  const visible = issues.filter(issue => (filter === 'all' || issue.category === filter) && (statusFilter === 'resolved' ? issue.status === 'resolved' : issue.status !== 'resolved' && issue.status !== 'superseded'));

  return <div className="flex h-full flex-col">
    <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
      <div><div className="flex items-center gap-2"><ScanSearch size={16} className="text-violet-400" /><span className="text-sm font-medium">叙述検査</span></div><p className="mt-0.5 text-[10px] text-muted-foreground">保存済み本文の視点・知識・声・作品ルールを確認します</p></div>
      <Button size="sm" onClick={() => void inspect()} disabled={loading || hasUnsavedChanges}>{loading ? <Loader2 size={13} className="mr-1 animate-spin" /> : <ScanSearch size={13} className="mr-1" />}検査</Button>
    </div>
    <div className="flex flex-wrap gap-1 border-b border-border/50 p-2">{(['all', 'viewpoint', 'knowledge', 'voice', 'narrative_rule'] as const).map(value => <Button key={value} size="sm" variant={filter === value ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setFilter(value)}>{value === 'all' ? 'すべて' : CATEGORY_LABELS[value]}</Button>)}</div>
    <div className="flex gap-1 border-b border-border/50 px-2 py-1">{(['current', 'resolved'] as const).map(value => <Button key={value} size="sm" variant={statusFilter === value ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setStatusFilter(value)}>{value === 'current' ? '現在のIssue' : '解決済み'}</Button>)}</div>
    <ScrollArea className="flex-1"><div className="space-y-3 p-3">
      {error && <Card className="border-destructive/30 bg-destructive/5"><CardContent className="p-3 text-xs text-destructive">{error}</CardContent></Card>}
      {hasUnsavedChanges && <Card className="border-amber-500/30 bg-amber-500/5"><CardContent className="p-3 text-xs text-amber-600">画面の本文または視点・語り手設定に未保存の変更があります。InspectorとLearning再検査は保存済み本文を対象にするため、先に章を保存してください。</CardContent></Card>}
      {learningSession && <Card className="border-violet-400/40 bg-violet-400/5"><CardContent className="space-y-3 p-3">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><GraduationCap size={16} className="text-violet-400" /><span className="text-sm font-medium">学習モード</span></div><Badge variant="outline">{learningSession.status === 'active' ? '学習中' : learningSession.status === 'completed' ? '再検査で解決' : learningSession.status === 'stale' ? '再確認が必要' : '終了'}</Badge></div>
        <blockquote className="border-l-2 border-violet-400/40 pl-2 text-xs">{learningSession.issueExcerptSnapshot || '章全体のIssue'}</blockquote>
        <div><p className="text-[10px] font-medium text-muted-foreground">なぜ確認候補なのか</p><p className="text-xs">{learningSession.issueExplanationSnapshot}</p></div>
        <div className="flex flex-wrap gap-1">{[...new Set(learningSession.evidenceRefsSnapshot.map(evidenceLabel))].map(label => <Badge key={label} variant="outline" className="text-[9px]">{label}</Badge>)}</div>
        {learningSession.steps.map(step => <div key={step.id} className="rounded border border-border/60 p-2"><p className="mb-1 text-[10px] font-medium text-muted-foreground">{step.level === 0 ? '考えるための問い' : `ヒント Level ${step.level}`}</p><p className="text-xs">{step.content}</p></div>)}
        {learningSession.status === 'stale' && <p className="rounded bg-amber-500/10 p-2 text-[10px] text-amber-600">本文または設定が変更されています。再検査して新しいIssueから学習を開始してください。</p>}
        {learningSession.status === 'completed' && <p className="rounded bg-emerald-500/10 p-2 text-[10px] text-emerald-600">この指摘は再検査で検出されなくなりました。</p>}
        {learningSession.status === 'active' && <p className="text-[10px] text-muted-foreground">本文はChapter Editorで自分で修正してから再検査してください。</p>}
        <div className="flex flex-wrap gap-1">{learningSession.status === 'active' && learningSession.currentHintLevel < 2 && <Button size="sm" variant="outline" disabled={learningLoading || hasUnsavedChanges} onClick={() => void requestHint()}>{learningLoading ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Lightbulb size={12} className="mr-1" />}ヒントを見る</Button>}{learningSession.status === 'active' && <Button size="sm" variant="outline" disabled={loading || learningLoading || hasUnsavedChanges} onClick={() => void reinspectLearning()}><ScanSearch size={12} className="mr-1" />再検査</Button>}<Button size="sm" variant="ghost" onClick={() => setLearningSession(null)}>閉じる</Button></div>
      </CardContent></Card>}
      {!loading && !error && issues.length === 0 && <div className="py-10 text-center text-muted-foreground"><CheckCircle2 size={28} className="mx-auto mb-2 opacity-40" /><p className="text-xs">「検査」を押すと確認候補を表示します</p><p className="mt-1 text-[10px]">結果は採点ではなく、作者が判断するための候補です。</p></div>}
      {visible.map((issue, index) => <Card key={`${issue.id}:${index}`} onClick={() => !hasUnsavedChanges && issue.locationKind === 'excerpt' && onSelectRange?.(issue.startOffset, issue.endOffset)} className="border-border/60 transition-colors hover:border-violet-400/40"><CardContent className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-1"><Badge variant="outline">{CATEGORY_LABELS[issue.category]}</Badge><Badge variant="outline">{ISSUE_LABELS[issue.issueType] || issue.issueType}</Badge><Badge variant={issue.severity === 'problem' ? 'destructive' : 'secondary'}>{SEVERITY_LABELS[issue.severity]}</Badge></div>
        <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground"><span>AI判定：{SEVERITY_LABELS[issue.severity]}</span><span>状態：{issue.status === 'resolved' ? '解決済み' : issue.status === 'open' ? '現在も検出' : issue.status}</span><span>初回：{new Date(issue.firstDetectedAt).toLocaleString('ja-JP')}</span><span>最終：{new Date(issue.lastDetectedAt).toLocaleString('ja-JP')}</span></div>
        <p className="text-xs">作者判断：{issue.latestDecision ? DECISION_LABELS[issue.latestDecision.decision] : '未判断'}</p>
        {issue.latestDecision && !issue.latestDecision.fresh && <p className="rounded bg-amber-500/10 p-2 text-[10px] text-amber-600">以前の作者判断がありますが、本文または設定が変更されています。再確認してください。</p>}
        {issue.locationKind === 'excerpt' ? <blockquote className="border-l-2 border-violet-400/40 pl-2 text-xs text-foreground">{issue.excerpt}</blockquote> : <p className="text-xs text-muted-foreground">章全体に対する確認候補</p>}
        <div><p className="text-[10px] font-medium text-muted-foreground">確認理由</p><p className="text-xs text-foreground/80">{issue.explanation}</p></div>
        <div><p className="text-[10px] font-medium text-muted-foreground">確認・修正の方向</p><p className="text-xs text-foreground/80">{issue.suggestedDirection}</p></div>
        <div className="flex flex-wrap gap-1">{[...new Set(issue.evidenceRefs.map(evidenceLabel))].map(label => <Badge key={label} variant="outline" className="text-[9px]">{label}</Badge>)}</div>
        {issue.latestDecision?.authorNote && <p className="text-[10px] text-muted-foreground">作者メモ：{issue.latestDecision.authorNote}</p>}
        <div className="space-y-1" onClick={event => event.stopPropagation()}>
          <Textarea value={notes[issue.id] || ''} onChange={event => setNotes(current => ({ ...current, [issue.id]: event.target.value }))} placeholder="作者メモ（任意）" className="min-h-14 text-xs" maxLength={4000} />
          <div className="flex flex-wrap gap-1">{(Object.keys(DECISION_LABELS) as Array<keyof typeof DECISION_LABELS>).map(decision => <Button key={decision} type="button" size="sm" variant="outline" className="h-7 text-[10px]" disabled={loading || hasUnsavedChanges} onClick={() => void decide(issue, decision)}>{DECISION_LABELS[decision]}</Button>)}</div>
          {issue.status === 'open' && <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" disabled={learningLoading || hasUnsavedChanges} onClick={() => void startLearning(issue)}><GraduationCap size={11} className="mr-1" />学習モード</Button>}
          {issue.latestDecision && ['allowed_exception', 'not_an_issue'].includes(issue.latestDecision.decision) && <p className="text-[10px] text-muted-foreground">作者判断済みのため学習を強く推奨しませんが、必要なら開始できます。</p>}
        </div>
      </CardContent></Card>)}
      {issues.length > 0 && visible.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">この分類の確認候補はありません</p>}
    </div></ScrollArea>
    <div className="border-t border-border/50 p-2 text-[10px] text-muted-foreground"><AlertTriangle size={10} className="mr-1 inline" />本文は自動変更されません。クリックすると該当位置を選択します。</div>
  </div>;
}
