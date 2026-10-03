'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Plus, Save, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  buildCustomMutationPayload, buildTechniqueCreatePayload, buildTechniqueUpdatePayload,
  BUILTIN_CREATIVE_RULE_UI_MODES, CREATIVE_RULE_MODE_EXPLANATIONS, CUSTOM_CREATIVE_RULE_UI_MODES,
  decideTechniqueModeMutation, filterCreativeTechniques, findExplicitCreativeRuleConflicts,
  graphemeCountLabel, isLatestCreativeRuleMutation, isLatestCreativeRulesProject,
  validateCustomCreativeRuleDraft, type CreativeRuleStateFilter, type CreativeRuleUiMode,
  type CreativeTechniqueAdoptionView, type CreativeTechniqueView, type UnknownCreativeTechniqueView,
} from '@/lib/creative-rules-ui';
import { CREATIVE_RULE_CATEGORY_LABELS, CREATIVE_RULE_MODE_LABELS, CREATIVE_RULE_STATE_LABELS, displayLabel } from '@/lib/i18n';

interface TechniqueResponse { techniques: CreativeTechniqueView[]; unknownAdoptions: UnknownCreativeTechniqueView[] }
interface CustomRuleView {
  id: string; projectId: string; title: string; instruction: string; category: string;
  mode: 'reference' | 'required' | 'forbidden'; priority: number; overridable: boolean;
  notes: string; active: boolean;
}
type CustomDraft = Omit<CustomRuleView, 'projectId'>;

const EMPTY_CUSTOM: CustomDraft = { id: '', title: '', instruction: '', category: 'style', mode: 'reference', priority: 0, overridable: true, notes: '', active: true };
const STATES: CreativeRuleStateFilter[] = ['all', 'configured', 'unset', 'review', 'disabled'];

async function responseError(response: Response) {
  const value = await response.json().catch(() => ({})) as { error?: string };
  return value.error || '操作に失敗しました。もう一度お試しください。';
}

function Counter({ value, maximum }: { value: string; maximum: number }) {
  return <p className="text-right text-[10px] text-muted-foreground">{graphemeCountLabel(value, maximum)}</p>;
}

function TechniqueCard({ projectId, value, busy, onMutate }: {
  projectId: string; value: CreativeTechniqueView; busy: boolean;
  onMutate: (key: string, url: string, method: string, body?: unknown) => Promise<boolean>;
}) {
  const adoption = value.adoption;
  const [adjustment, setAdjustment] = useState(adoption?.authorAdjustment || '');
  const [notes, setNotes] = useState(adoption?.notes || '');
  const [priority, setPriority] = useState(String(adoption?.priority ?? 0));
  const [overridable, setOverridable] = useState(adoption?.overridable ?? true);
  useEffect(() => {
    setAdjustment(adoption?.authorAdjustment || ''); setNotes(adoption?.notes || '');
    setPriority(String(adoption?.priority ?? 0)); setOverridable(adoption?.overridable ?? true);
  }, [adoption?.id, adoption?.authorAdjustment, adoption?.notes, adoption?.priority, adoption?.overridable]);

  const mode: CreativeRuleUiMode = adoption?.mode || 'unset';
  const changeMode = async (next: CreativeRuleUiMode) => {
    const key = `technique:${value.definition.key}`;
    const mutation = decideTechniqueModeMutation(adoption, next);
    if (mutation === 'delete' && adoption) {
      await onMutate(key, `/api/creative-rules/techniques?projectId=${encodeURIComponent(projectId)}&id=${encodeURIComponent(adoption.id)}`, 'DELETE');
    } else if (mutation === 'update' && adoption && next !== 'unset') {
      await onMutate(key, '/api/creative-rules/techniques', 'PUT', buildTechniqueUpdatePayload(projectId, adoption, { mode: next }));
    } else if (mutation === 'create' && next !== 'unset') {
      await onMutate(key, '/api/creative-rules/techniques', 'POST', buildTechniqueCreatePayload(projectId, value.definition.key, next));
    }
  };
  const saveDetails = async () => {
    if (!adoption) return;
    const numericPriority = Number(priority);
    if (!Number.isInteger(numericPriority) || numericPriority < -100 || numericPriority > 100) { toast.error('優先度は-100〜100の整数で入力してください。'); return; }
    if (adjustment.length > 2000 || notes.length > 1000) { toast.error('入力文字数を確認してください。'); return; }
    if (await onMutate(`technique:${value.definition.key}`, '/api/creative-rules/techniques', 'PUT', buildTechniqueUpdatePayload(projectId, adoption, {
      authorAdjustment: adjustment, notes, priority: numericPriority, overridable,
    }))) toast.success('創作ルールを保存しました。');
  };
  const selectedGuidance = mode === 'reference' || mode === 'required' || mode === 'forbidden' ? value.definition.guidance[mode] : CREATIVE_RULE_MODE_EXPLANATIONS[mode];

  return <Card className="min-w-0 bg-card/50 border-border/60">
    <CardHeader className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><CardTitle className="text-sm">{value.definition.label}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{value.definition.shortDescription}</p></div>
        <div className="flex flex-wrap gap-1"><Badge variant="outline">{displayLabel(CREATIVE_RULE_CATEGORY_LABELS, value.definition.category)}</Badge>{!adoption && <Badge variant="secondary">未設定</Badge>}{adoption && !adoption.active && <Badge variant="secondary">一時無効</Badge>}{value.needsReview && <Badge variant="destructive">要確認</Badge>}</div></div>
    </CardHeader>
    <CardContent className="space-y-3 p-4 pt-0">
      {value.needsReview && <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs"><AlertTriangle size={13} className="mr-1 inline" />この技法の定義が設定時点から更新されています。現在の内容を確認してください。自動では確認済みにしません。</div>}
      <div><label htmlFor={`mode-${value.definition.key}`} className="block text-xs font-medium mb-1">採用状態</label><select id={`mode-${value.definition.key}`} aria-label={`${value.definition.label}の採用状態`} value={mode} disabled={busy} onChange={event => void changeMode(event.target.value as CreativeRuleUiMode)} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm">{BUILTIN_CREATIVE_RULE_UI_MODES.map(item => <option key={item} value={item}>{displayLabel(CREATIVE_RULE_MODE_LABELS, item)}</option>)}</select><p className="mt-1 text-[11px] text-muted-foreground">{CREATIVE_RULE_MODE_EXPLANATIONS[mode]}</p></div>
      <p className="rounded-md bg-secondary/30 p-2 text-[11px] text-muted-foreground"><span className="font-medium text-foreground">現在の扱い：</span>{selectedGuidance}</p>
      {adoption && <details className="rounded-md border px-3 py-2"><summary className="flex cursor-pointer items-center gap-1 text-xs font-medium"><ChevronDown size={13} />この作品での調整・詳細</summary><div className="mt-3 space-y-3">
        <div><label htmlFor={`adjust-${value.definition.key}`} className="text-xs text-muted-foreground">この作品での調整</label><Textarea id={`adjust-${value.definition.key}`} maxLength={2000} value={adjustment} onChange={event => setAdjustment(event.target.value)} rows={3} placeholder="この作品では技法をどう調整して使うか" /><Counter value={adjustment} maximum={2000} /></div>
        <div><label htmlFor={`notes-${value.definition.key}`} className="text-xs text-muted-foreground">補足</label><Textarea id={`notes-${value.definition.key}`} maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} rows={2} placeholder="生成時にも参照される補足事項" /><p className="text-[10px] text-muted-foreground">作者だけの非公開メモではなく、生成時の補足情報として扱われます。</p><Counter value={notes} maximum={1000} /></div>
        <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor={`priority-${value.definition.key}`} className="text-xs text-muted-foreground">優先度（-100〜100）</label><Input id={`priority-${value.definition.key}`} type="number" min={-100} max={100} value={priority} onChange={event => setPriority(event.target.value)} /></div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3"><label htmlFor={`override-${value.definition.key}`} className="text-xs">章ごとの明示指示で一時的に上書きできる</label><Switch id={`override-${value.definition.key}`} checked={overridable} onCheckedChange={setOverridable} /></div></div>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3"><div><label htmlFor={`active-${value.definition.key}`} className="text-xs">この設定を使用する</label><p className="text-[10px] text-muted-foreground">無効にしても設定内容は保持されます。</p></div><Switch id={`active-${value.definition.key}`} checked={adoption.active} disabled={busy} onCheckedChange={active => void onMutate(`technique:${value.definition.key}`, '/api/creative-rules/techniques', 'PUT', buildTechniqueUpdatePayload(projectId, adoption, { active }))} /></div>
        <Button size="sm" disabled={busy} onClick={() => void saveDetails()}><Save size={14} className="mr-1" />詳細を保存</Button>
      </div></details>}
    </CardContent>
  </Card>;
}

function CustomEditor({ value, busy, onSave, onDelete }: {
  value: CustomDraft; busy: boolean;
  onSave: (value: CustomDraft) => Promise<void>; onDelete: (value: CustomDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = async () => { const error = validateCustomCreativeRuleDraft(draft); if (error) { toast.error(error); return; } await onSave(draft); };
  return <Card className="bg-card/50"><CardContent className="space-y-3 p-4">
    <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor={`custom-title-${value.id || 'new'}`} className="text-xs text-muted-foreground">タイトル</label><Input id={`custom-title-${value.id || 'new'}`} maxLength={120} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} /><Counter value={draft.title} maximum={120} /></div>
      <div><label htmlFor={`custom-category-${value.id || 'new'}`} className="text-xs text-muted-foreground">カテゴリ</label><select id={`custom-category-${value.id || 'new'}`} value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value }))} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm">{Object.entries(CREATIVE_RULE_CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div></div>
    <div><label htmlFor={`custom-instruction-${value.id || 'new'}`} className="text-xs text-muted-foreground">内容</label><Textarea id={`custom-instruction-${value.id || 'new'}`} maxLength={2000} value={draft.instruction} onChange={event => setDraft(current => ({ ...current, instruction: event.target.value }))} rows={4} /><Counter value={draft.instruction} maximum={2000} /></div>
    <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor={`custom-mode-${value.id || 'new'}`} className="text-xs text-muted-foreground">モード</label><select id={`custom-mode-${value.id || 'new'}`} value={draft.mode} onChange={event => setDraft(current => ({ ...current, mode: event.target.value as CustomDraft['mode'] }))} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm">{CUSTOM_CREATIVE_RULE_UI_MODES.map(mode => <option key={mode} value={mode}>{displayLabel(CREATIVE_RULE_MODE_LABELS, mode)}</option>)}</select></div>
      <div><label htmlFor={`custom-priority-${value.id || 'new'}`} className="text-xs text-muted-foreground">優先度（-100〜100）</label><Input id={`custom-priority-${value.id || 'new'}`} type="number" min={-100} max={100} value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: Number(event.target.value) }))} /></div></div>
    <details><summary className="cursor-pointer text-xs font-medium">詳細設定</summary><div className="mt-3 space-y-3"><div><label htmlFor={`custom-notes-${value.id || 'new'}`} className="text-xs text-muted-foreground">補足</label><Textarea id={`custom-notes-${value.id || 'new'}`} maxLength={1000} value={draft.notes} onChange={event => setDraft(current => ({ ...current, notes: event.target.value }))} rows={2} /><p className="text-[10px] text-muted-foreground">生成時にも参照される補足情報です。</p><Counter value={draft.notes} maximum={1000} /></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="flex items-center justify-between gap-3 rounded-md border p-3"><label htmlFor={`custom-override-${value.id || 'new'}`} className="text-xs">章ごとの指示で上書きできる</label><Switch id={`custom-override-${value.id || 'new'}`} checked={draft.overridable} onCheckedChange={overridable => setDraft(current => ({ ...current, overridable }))} /></div><div className="flex items-center justify-between gap-3 rounded-md border p-3"><div><label htmlFor={`custom-active-${value.id || 'new'}`} className="text-xs">このルールを使用する</label>{!draft.active && <p className="text-[10px] text-muted-foreground">一時無効</p>}</div><Switch id={`custom-active-${value.id || 'new'}`} checked={draft.active} onCheckedChange={active => setDraft(current => ({ ...current, active }))} /></div></div></div></details>
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void save()}><Save size={14} className="mr-1" />{value.id ? '更新' : '追加'}</Button>{value.id && <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => void onDelete(value)}><Trash2 size={14} className="mr-1" />削除</Button>}</div>
  </CardContent></Card>;
}

export function CreativeRulesSettings({ projectId }: { projectId: string }) {
  const [readModel, setReadModel] = useState<TechniqueResponse>({ techniques: [], unknownAdoptions: [] });
  const [customRules, setCustomRules] = useState<CustomRuleView[]>([]);
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('all');
  const [state, setState] = useState<CreativeRuleStateFilter>('all'); const [showCustomForm, setShowCustomForm] = useState(false);
  const [loading, setLoading] = useState(true); const [loadedProjectId, setLoadedProjectId] = useState('');
  const [error, setError] = useState(''); const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const projectIdRef = useRef(projectId);
  const loadToken = useRef(0); const mutationTokens = useRef(new Map<string, number>());
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const responseProjectId = projectId; const token = ++loadToken.current; setLoading(true); setError('');
    try {
      const [techniqueResponse, customResponse] = await Promise.all([
        fetch(`/api/creative-rules/techniques?projectId=${encodeURIComponent(projectId)}`, { signal }),
        fetch(`/api/creative-rules/custom?projectId=${encodeURIComponent(projectId)}`, { signal }),
      ]);
      if (!techniqueResponse.ok) throw new Error(await responseError(techniqueResponse));
      if (!customResponse.ok) throw new Error(await responseError(customResponse));
      const techniques = await techniqueResponse.json() as TechniqueResponse; const custom = await customResponse.json() as CustomRuleView[];
      if (!signal?.aborted && token === loadToken.current && isLatestCreativeRulesProject(responseProjectId, projectIdRef.current)) { setReadModel(techniques); setCustomRules(custom); setLoadedProjectId(responseProjectId); }
    } catch (caught) {
      if (!signal?.aborted && token === loadToken.current && isLatestCreativeRulesProject(responseProjectId, projectIdRef.current)) setError(caught instanceof Error ? caught.message : '創作ルールを読み込めませんでした。');
    } finally { if (!signal?.aborted && token === loadToken.current && isLatestCreativeRulesProject(responseProjectId, projectIdRef.current)) setLoading(false); }
  }, [projectId]);

  useEffect(() => { const controller = new AbortController(); mutationTokens.current.clear(); setReadModel({ techniques: [], unknownAdoptions: [] }); setCustomRules([]); void load(controller.signal); return () => controller.abort(); }, [load]);

  const mutate = async (key: string, url: string, method: string, body?: unknown) => {
    const responseProjectId = projectId; const mutationToken = (mutationTokens.current.get(key) || 0) + 1; mutationTokens.current.set(key, mutationToken);
    setBusyKeys(current => new Set(current).add(key)); setError('');
    try {
      const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) throw new Error(await responseError(response));
      if (!isLatestCreativeRulesProject(responseProjectId, projectIdRef.current) || !isLatestCreativeRuleMutation(mutationToken, mutationTokens.current.get(key) || 0)) return false;
      await load(); return true;
    } catch (caught) {
      if (!isLatestCreativeRulesProject(responseProjectId, projectIdRef.current) || !isLatestCreativeRuleMutation(mutationToken, mutationTokens.current.get(key) || 0)) return false;
      const message = caught instanceof Error ? caught.message : '操作に失敗しました。'; setError(message); toast.error(message); return false;
    } finally { if (isLatestCreativeRulesProject(responseProjectId, projectIdRef.current) && isLatestCreativeRuleMutation(mutationToken, mutationTokens.current.get(key) || 0)) setBusyKeys(current => { const next = new Set(current); next.delete(key); return next; }); }
  };

  const filtered = useMemo(() => filterCreativeTechniques(readModel.techniques, search, category, state), [readModel.techniques, search, category, state]);
  const conflicts = useMemo(() => findExplicitCreativeRuleConflicts(readModel.techniques), [readModel.techniques]);
  const saveCustom = async (draft: CustomDraft) => {
    const key = `custom:${draft.id || 'new'}`; const body = buildCustomMutationPayload(projectId, draft);
    if (await mutate(key, '/api/creative-rules/custom', draft.id ? 'PUT' : 'POST', body)) { setShowCustomForm(false); toast.success(draft.id ? '作者独自ルールを更新しました。' : '作者独自ルールを追加しました。'); }
  };
  const deleteCustom = async (draft: CustomDraft) => {
    if (!window.confirm(`「${draft.title}」を削除しますか？`)) return;
    if (await mutate(`custom:${draft.id}`, `/api/creative-rules/custom?projectId=${encodeURIComponent(projectId)}&id=${encodeURIComponent(draft.id)}`, 'DELETE')) toast.success('作者独自ルールを削除しました。');
  };

  if (loading || loadedProjectId !== projectId) return <div className="py-8 text-center text-sm text-muted-foreground">創作ルールを読み込み中...</div>;
  return <div className="min-w-0 space-y-6">
    <div><h3 className="text-sm font-medium">創作ルール</h3><p className="mt-1 text-xs text-muted-foreground">この作品で採用する創作技法や表現方針を設定します。技法は一般的な正解ではなく、作品ごとに自由に選択できます。</p></div>
    {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    {conflicts.length > 0 && <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs"><AlertTriangle size={14} className="mr-1 inline" />必須にした技法同士が競合する可能性があります。自動解決せず、意図を確認してください。</div>}
    <div className="grid gap-3 md:grid-cols-3"><div className="relative md:col-span-1"><Search size={14} className="absolute left-3 top-3 text-muted-foreground" /><Input aria-label="創作ルールを検索" value={search} onChange={event => setSearch(event.target.value)} className="pl-9" placeholder="技法名・説明を検索" /></div>
      <select aria-label="カテゴリで絞り込む" value={category} onChange={event => setCategory(event.target.value)} className="h-9 px-3 bg-secondary border border-input rounded-md text-sm"><option value="all">すべてのカテゴリ</option>{Object.entries(CREATIVE_RULE_CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <select aria-label="設定状態で絞り込む" value={state} onChange={event => setState(event.target.value as CreativeRuleStateFilter)} className="h-9 px-3 bg-secondary border border-input rounded-md text-sm">{STATES.map(key => <option key={key} value={key}>{displayLabel(CREATIVE_RULE_STATE_LABELS, key)}</option>)}</select></div>
    {filtered.length === 0 ? <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">条件に一致する創作ルールはありません</p> : <div className="grid min-w-0 gap-4 xl:grid-cols-2">{filtered.map(value => <TechniqueCard key={value.definition.key} projectId={projectId} value={value} busy={busyKeys.has(`technique:${value.definition.key}`)} onMutate={mutate} />)}</div>}

    {readModel.unknownAdoptions.length > 0 && <section className="space-y-3"><div><h4 className="text-sm font-medium">現在のカタログにない設定</h4><p className="text-xs text-muted-foreground">現在のバージョンでは技法の定義を確認できません。近い技法へ自動変換しません。</p></div>{readModel.unknownAdoptions.map(value => <Card key={value.adoption.id} className="border-amber-500/40"><CardContent className="space-y-2 p-4"><div className="flex flex-wrap items-center gap-2"><code className="break-all text-xs">{value.adoption.techniqueKey}</code><Badge variant="destructive">要確認</Badge>{!value.adoption.active && <Badge variant="secondary">一時無効</Badge>}</div><p className="text-xs">状態：{displayLabel(CREATIVE_RULE_MODE_LABELS, value.adoption.mode)}</p>{value.adoption.authorAdjustment && <p className="whitespace-pre-wrap text-xs">調整：{value.adoption.authorAdjustment}</p>}<Button size="sm" variant="ghost" className="text-destructive" disabled={busyKeys.has(`unknown:${value.adoption.id}`)} onClick={() => { if (window.confirm('この不明な設定を削除しますか？')) void mutate(`unknown:${value.adoption.id}`, `/api/creative-rules/techniques?projectId=${encodeURIComponent(projectId)}&id=${encodeURIComponent(value.adoption.id)}`, 'DELETE'); }}><Trash2 size={14} className="mr-1" />削除</Button></CardContent></Card>)}</section>}

    <section className="space-y-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-sm font-medium">作者独自ルール</h4><p className="text-xs text-muted-foreground">組み込み技法とは別に、この作品固有の方針を原文のまま登録します。</p></div><Button size="sm" variant="outline" onClick={() => setShowCustomForm(value => !value)}><Plus size={14} className="mr-1" />独自ルールを追加</Button></div>
      {showCustomForm && <CustomEditor value={{ ...EMPTY_CUSTOM }} busy={busyKeys.has('custom:new')} onSave={saveCustom} onDelete={deleteCustom} />}
      {customRules.length === 0 && !showCustomForm && <p className="rounded-md border border-dashed p-5 text-center text-xs text-muted-foreground">作者独自ルールはまだありません</p>}
      <div className="space-y-3">{customRules.map(rule => <CustomEditor key={rule.id} value={{ id: rule.id, title: rule.title, instruction: rule.instruction, category: rule.category, mode: rule.mode, priority: rule.priority, overridable: rule.overridable, notes: rule.notes, active: rule.active }} busy={busyKeys.has(`custom:${rule.id}`)} onSave={saveCustom} onDelete={deleteCustom} />)}</div>
    </section>
  </div>;
}
