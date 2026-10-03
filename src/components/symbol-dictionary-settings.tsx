'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookType, ChevronDown, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { BUILTIN_SYMBOL_PAIRS } from '@/lib/japanese-text';
import { displayLabel, SYMBOL_BUILTIN_LABELS, SYMBOL_SEMANTIC_KIND_LABELS, SYMBOL_SPEAKER_MODE_LABELS } from '@/lib/i18n';
import { booleanToTriState, buildSymbolUsageMutationPayload, isLatestSymbolDictionaryRequest, mergeSymbolDictionaryDisplayItems, triStateToBoolean, type TriStateValue } from '@/lib/symbol-dictionary-ui';
import { SymbolOccurrenceBrowser } from '@/components/symbol-occurrence-browser';

interface CharacterOption { id: string; name: string }
interface UsageValue {
  id: string; definitionId: string; label: string; description: string; semanticKind: string;
  countsAsDialogue: boolean | null; countsAsNarration: boolean | null; countsAsInnerVoice: boolean | null;
  readerVisible: boolean | null; spokenAloud: boolean | null; speakerMode: string; fixedSpeakerId: string | null;
  priority: number; active: boolean; provenance: string;
}
interface DefinitionValue {
  id: string; projectId: string; openSymbol: string; closeSymbol: string; label: string; active: boolean;
  order: number; defaultUsageRuleId: string | null; usageRules: UsageValue[];
}

const EMPTY_USAGE = {
  id: '', label: '', description: '', semanticKind: 'custom', countsAsDialogue: null as boolean | null,
  countsAsNarration: null as boolean | null, countsAsInnerVoice: null as boolean | null,
  readerVisible: null as boolean | null, spokenAloud: null as boolean | null,
  speakerMode: 'unknown', fixedSpeakerId: '', active: true,
};

function TriStateField({ id, label, value, onChange }: { id: string; label: string; value: boolean | null; onChange: (value: boolean | null) => void }) {
  return <div><label htmlFor={id} className="block text-xs text-muted-foreground mb-1">{label}</label>
    <select id={id} value={booleanToTriState(value)} onChange={event => onChange(triStateToBoolean(event.target.value as TriStateValue))} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm">
      <option value="unspecified">未指定</option><option value="yes">はい</option><option value="no">いいえ</option>
    </select></div>;
}

async function responseError(response: Response) {
  const value = await response.json().catch(() => ({})) as { error?: string };
  if (response.status === 409 && value.error?.includes('参照')) return '使用中のため削除できません。無効化を利用してください。';
  return value.error || '操作に失敗しました。もう一度お試しください。';
}

export function SymbolDictionarySettings({ projectId }: { projectId: string }) {
  const [definitions, setDefinitions] = useState<DefinitionValue[]>([]);
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [selectedKey, setSelectedKey] = useState(`builtin:${BUILTIN_SYMBOL_PAIRS[0].id}`);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [custom, setCustom] = useState({ openSymbol: '', closeSymbol: '', label: '', order: '0' });
  const [definitionDraft, setDefinitionDraft] = useState({ label: '', order: '0', active: true });
  const [usageDraft, setUsageDraft] = useState({ ...EMPTY_USAGE }); const [showUsage, setShowUsage] = useState(false);
  const requestToken = useRef(0);

  const load = useCallback(async (signal?: AbortSignal, token = requestToken.current) => {
    if (!isLatestSymbolDictionaryRequest(token, requestToken.current)) return;
    setLoading(true); setError('');
    try {
      const [dictionaryResponse, charactersResponse] = await Promise.all([
        fetch(`/api/symbol-definitions?projectId=${encodeURIComponent(projectId)}`, { signal }),
        fetch(`/api/characters?projectId=${encodeURIComponent(projectId)}`, { signal }),
      ]);
      if (!dictionaryResponse.ok) throw new Error(await responseError(dictionaryResponse));
      const dictionary = await dictionaryResponse.json() as DefinitionValue[];
      const characterData = charactersResponse.ok ? await charactersResponse.json() as { characters?: CharacterOption[] } : { characters: [] };
      if (!signal?.aborted && isLatestSymbolDictionaryRequest(token, requestToken.current)) { setDefinitions(dictionary); setCharacters(characterData.characters || []); }
    } catch (caught) {
      if (!signal?.aborted && isLatestSymbolDictionaryRequest(token, requestToken.current)) setError(caught instanceof Error ? caught.message : '作品表記辞書を読み込めませんでした。');
    } finally { if (!signal?.aborted && isLatestSymbolDictionaryRequest(token, requestToken.current)) setLoading(false); }
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    const token = ++requestToken.current;
    setDefinitions([]); setCharacters([]); setSelectedKey(`builtin:${BUILTIN_SYMBOL_PAIRS[0].id}`);
    void load(controller.signal, token);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent<{ source?: string }>).detail?.source === 'browser') void load();
    };
    window.addEventListener('symbol-dictionary-changed', refresh);
    return () => window.removeEventListener('symbol-dictionary-changed', refresh);
  }, [load]);

  const items = useMemo(() => mergeSymbolDictionaryDisplayItems(BUILTIN_SYMBOL_PAIRS, definitions), [definitions]);
  const selected = items.find(value => value.key === selectedKey) || items[0];
  const definition = selected?.definition ? definitions.find(value => value.id === selected.definition?.id) || null : null;

  useEffect(() => {
    if (definition) setDefinitionDraft({ label: definition.label, order: String(definition.order), active: definition.active });
    setShowUsage(false); setUsageDraft({ ...EMPTY_USAGE });
  }, [definition?.id]);

  const mutate = async (url: string, method: string, body?: unknown) => {
    const token = requestToken.current;
    setBusy(true); setError('');
    try {
      const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) throw new Error(await responseError(response));
      const value = await response.json();
      if (!isLatestSymbolDictionaryRequest(token, requestToken.current)) return null;
      await load(undefined, token);
      window.dispatchEvent(new CustomEvent('symbol-dictionary-changed', { detail: { source: 'management' } }));
      return value;
    } catch (caught) {
      if (!isLatestSymbolDictionaryRequest(token, requestToken.current)) return null;
      const message = caught instanceof Error ? caught.message : '操作に失敗しました。'; setError(message); toast.error(message); return null;
    } finally { if (isLatestSymbolDictionaryRequest(token, requestToken.current)) setBusy(false); }
  };

  const createBuiltInDefinition = async () => {
    if (!selected?.builtIn || definition) return;
    const created = await mutate('/api/symbol-definitions', 'POST', { projectId, openSymbol: selected.openSymbol, closeSymbol: selected.closeSymbol,
      label: displayLabel(SYMBOL_BUILTIN_LABELS, selected.pairId || ''), order: BUILTIN_SYMBOL_PAIRS.findIndex(value => value.id === selected.pairId) });
    if (created) toast.success('意味設定を作成しました。');
  };

  const createCustom = async () => {
    const created = await mutate('/api/symbol-definitions', 'POST', { projectId, openSymbol: custom.openSymbol, closeSymbol: custom.closeSymbol,
      label: custom.label, order: Number(custom.order) });
    if (created) { setSelectedKey(`project:${created.id}`); setCustom({ openSymbol: '', closeSymbol: '', label: '', order: '0' }); setShowCustom(false); toast.success('カスタム表記を追加しました。'); }
  };

  const saveDefinition = async () => {
    if (!definition) return;
    if (await mutate('/api/symbol-definitions', 'PUT', { projectId, id: definition.id, label: definitionDraft.label,
      order: Number(definitionDraft.order), active: definitionDraft.active })) toast.success('表記設定を保存しました。');
  };

  const editUsage = (usage: UsageValue) => {
    setUsageDraft({ id: usage.id, label: usage.label, description: usage.description, semanticKind: usage.semanticKind,
      countsAsDialogue: usage.countsAsDialogue, countsAsNarration: usage.countsAsNarration, countsAsInnerVoice: usage.countsAsInnerVoice,
      readerVisible: usage.readerVisible, spokenAloud: usage.spokenAloud, speakerMode: usage.speakerMode,
      fixedSpeakerId: usage.fixedSpeakerId || '', active: usage.active }); setShowUsage(true);
  };

  const saveUsage = async () => {
    if (!definition) return;
    const body = buildSymbolUsageMutationPayload(projectId, definition.id, usageDraft);
    if (await mutate('/api/symbol-usage-rules', usageDraft.id ? 'PUT' : 'POST', body)) {
      setShowUsage(false); setUsageDraft({ ...EMPTY_USAGE }); toast.success(usageDraft.id ? '用途を更新しました。' : '用途を追加しました。');
    }
  };

  const setDefault = async (usageRuleId: string | null) => {
    if (!definition) return;
    if (await mutate('/api/symbol-usage-rules/default', 'PUT', { projectId, definitionId: definition.id, usageRuleId })) toast.success('既定の用途を更新しました。');
  };

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">作品表記辞書を読み込み中...</div>;

  return <div className="space-y-4">
    <div className="space-y-1"><div className="flex items-center gap-2"><BookType size={16} /><h3 className="text-sm font-medium">作品表記辞書</h3></div>
      <p className="text-xs text-muted-foreground">今後の文章解析やAI機能で利用するための、作品固有の表記と意味を管理します。組み込み表記には最初から意味を設定していません。</p></div>
    {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => setShowCustom(value => !value)}><Plus size={14} className="mr-1" />カスタム表記を追加</Button></div>
    {showCustom && <Card><CardHeader><CardTitle className="text-sm">作品独自の記号を追加</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
      <div><label htmlFor="custom-open" className="text-xs text-muted-foreground">開始記号</label><Input id="custom-open" value={custom.openSymbol} onChange={event => setCustom(value => ({ ...value, openSymbol: event.target.value }))} placeholder="例：<<" /></div>
      <div><label htmlFor="custom-close" className="text-xs text-muted-foreground">終了記号</label><Input id="custom-close" value={custom.closeSymbol} onChange={event => setCustom(value => ({ ...value, closeSymbol: event.target.value }))} placeholder="例：>>" /></div>
      <div><label htmlFor="custom-label" className="text-xs text-muted-foreground">表示名</label><Input id="custom-label" value={custom.label} onChange={event => setCustom(value => ({ ...value, label: event.target.value }))} /></div>
      <div><label htmlFor="custom-order" className="text-xs text-muted-foreground">並び順</label><Input id="custom-order" type="number" value={custom.order} onChange={event => setCustom(value => ({ ...value, order: event.target.value }))} /></div>
      <div className="sm:col-span-2 flex gap-2"><Button size="sm" disabled={busy} onClick={createCustom}>追加</Button><Button size="sm" variant="ghost" onClick={() => setShowCustom(false)}>キャンセル</Button></div>
    </CardContent></Card>}
    <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.7fr)]">
      <div className="space-y-2">{items.map(item => <button type="button" key={item.key} onClick={() => setSelectedKey(item.key)} className={`w-full rounded-md border p-3 text-left transition-colors ${selected?.key === item.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/40'}`}>
        <div className="flex items-center justify-between gap-2"><span className="font-mono text-base">{item.openSymbol} {item.closeSymbol}</span><Badge variant="outline">{item.builtIn ? '組み込み表記' : 'カスタム表記'}</Badge></div>
        <p className="mt-1 text-xs font-medium">{item.definition?.label || displayLabel(SYMBOL_BUILTIN_LABELS, item.pairId || '')}</p>
        <p className="text-[11px] text-muted-foreground">{item.definition ? item.definition.defaultUsageRuleId ? `既定：${(item.definition as DefinitionValue).usageRules?.find(value => value.id === item.definition?.defaultUsageRuleId)?.label || '未設定'}` : '既定の用途：未設定' : '意味未設定'}</p>
        {item.definition && !item.definition.active && <Badge variant="secondary" className="mt-2">無効</Badge>}
      </button>)}</div>
      <div>{selected && !definition && <Card><CardHeader><CardTitle className="text-base">{selected.openSymbol} {selected.closeSymbol}　{displayLabel(SYMBOL_BUILTIN_LABELS, selected.pairId || '')}</CardTitle></CardHeader><CardContent className="space-y-3">
        <Badge variant="outline">組み込み表記</Badge><p className="text-sm">意味未設定</p><p className="text-xs text-muted-foreground">記号の構造は検出できますが、この作品での用途はまだ決められていません。</p>
        <Button size="sm" disabled={busy} onClick={createBuiltInDefinition}>意味を設定</Button>
      </CardContent></Card>}
      {definition && <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle className="text-base">{definition.openSymbol} {definition.closeSymbol}</CardTitle><p className="mt-1 text-xs text-muted-foreground">記号の組み合わせは作成後に変更できません。変更する場合は新しい表記を登録してください。</p></div><Badge variant="outline">{selected.builtIn ? '組み込み表記' : 'カスタム表記'}</Badge></div></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="definition-label" className="text-xs text-muted-foreground">表示名</label><Input id="definition-label" value={definitionDraft.label} onChange={event => setDefinitionDraft(value => ({ ...value, label: event.target.value }))} /></div>
          <div><label htmlFor="definition-order" className="text-xs text-muted-foreground">並び順</label><Input id="definition-order" type="number" value={definitionDraft.order} onChange={event => setDefinitionDraft(value => ({ ...value, order: event.target.value }))} /></div></div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3"><div><label htmlFor="definition-active" className="text-sm">この表記設定を使用する</label><p className="text-[11px] text-muted-foreground">{selected.builtIn ? '無効にしても、記号そのものの検出は継続されます。' : '無効にすると、このカスタム表記は文章解析の対象外になります。'}</p></div><Switch id="definition-active" checked={definitionDraft.active} onCheckedChange={active => setDefinitionDraft(value => ({ ...value, active }))} /></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={saveDefinition}><Save size={14} className="mr-1" />表記設定を保存</Button><Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={async () => { if (!window.confirm('この表記設定を削除しますか？通常は無効化をおすすめします。')) return; if (await mutate(`/api/symbol-definitions?projectId=${encodeURIComponent(projectId)}&id=${encodeURIComponent(definition.id)}`, 'DELETE')) toast.success('表記設定を削除しました。'); }}><Trash2 size={14} className="mr-1" />削除</Button></div>
          <div className="border-t pt-4 space-y-3"><div><label htmlFor="default-usage" className="text-sm font-medium">既定の用途</label><p className="text-[11px] text-muted-foreground">この表記を見つけたとき、個別指定がない箇所ではこの用途として扱います。</p></div>
            <select id="default-usage" value={definition.defaultUsageRuleId || ''} onChange={event => void setDefault(event.target.value || null)} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm"><option value="">未設定</option>{definition.usageRules.filter(value => value.active).map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select>
          </div>
          <div className="border-t pt-4 space-y-3"><div className="flex items-center justify-between"><div><h4 className="text-sm font-medium">登録済みの用途</h4><p className="text-[11px] text-muted-foreground">用途が1件だけでも、既定には自動設定されません。</p></div><Button size="sm" variant="outline" onClick={() => { setUsageDraft({ ...EMPTY_USAGE }); setShowUsage(true); }}><Plus size={14} className="mr-1" />用途を追加</Button></div>
            {definition.usageRules.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">用途はまだ登録されていません。</p>}
            {definition.usageRules.map(usage => <div key={usage.id} className="rounded-md border p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-medium">{usage.label}</p><p className="text-xs text-muted-foreground">{displayLabel(SYMBOL_SEMANTIC_KIND_LABELS, usage.semanticKind)}{usage.description ? ` · ${usage.description}` : ''}</p></div><div className="flex gap-1">{definition.defaultUsageRuleId === usage.id && <Badge>既定</Badge>}{!usage.active && <Badge variant="secondary">無効</Badge>}</div></div>
              <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => editUsage(usage)}>編集</Button><Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={async () => { if (!window.confirm('この用途を削除しますか？通常は無効化をおすすめします。')) return; await mutate(`/api/symbol-usage-rules?projectId=${encodeURIComponent(projectId)}&id=${encodeURIComponent(usage.id)}`, 'DELETE'); }}><Trash2 size={13} className="mr-1" />削除</Button></div></div>)}
          </div>
          {showUsage && <div className="rounded-md border bg-secondary/20 p-4 space-y-4"><h4 className="text-sm font-medium">{usageDraft.id ? '用途を編集' : '用途を追加'}</h4>
            <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="usage-label" className="text-xs text-muted-foreground">名前</label><Input id="usage-label" value={usageDraft.label} onChange={event => setUsageDraft(value => ({ ...value, label: event.target.value }))} placeholder="例：神の声" /></div>
            <div><label htmlFor="usage-kind" className="text-xs text-muted-foreground">種類</label><select id="usage-kind" value={usageDraft.semanticKind} onChange={event => setUsageDraft(value => ({ ...value, semanticKind: event.target.value }))} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm">{Object.entries(SYMBOL_SEMANTIC_KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p className="text-[11px] text-muted-foreground">分析時の大まかな分類です。作品固有の意味は名前と説明へ記述できます。</p></div></div>
            <div><label htmlFor="usage-description" className="text-xs text-muted-foreground">説明</label><Textarea id="usage-description" maxLength={4000} value={usageDraft.description} onChange={event => setUsageDraft(value => ({ ...value, description: event.target.value }))} rows={3} placeholder="例：主人公にだけ聞こえる天上からの声" /><p className="text-right text-[10px] text-muted-foreground">{usageDraft.description.length}/4000</p></div>
            <details><summary className="flex cursor-pointer items-center gap-1 text-xs font-medium"><ChevronDown size={13} />分析用の詳細設定</summary><div className="mt-3 space-y-3"><p className="text-[11px] text-muted-foreground">「未指定」は、この用途だけでは判断しないことを表します。各項目は排他的ではなく、複数を「はい」にできます。</p>
              <div className="grid gap-3 sm:grid-cols-2"><TriStateField id="dialogue-state" label="会話として数える" value={usageDraft.countsAsDialogue} onChange={countsAsDialogue => setUsageDraft(value => ({ ...value, countsAsDialogue }))} /><TriStateField id="narration-state" label="地の文として数える" value={usageDraft.countsAsNarration} onChange={countsAsNarration => setUsageDraft(value => ({ ...value, countsAsNarration }))} /><TriStateField id="inner-state" label="内心として数える" value={usageDraft.countsAsInnerVoice} onChange={countsAsInnerVoice => setUsageDraft(value => ({ ...value, countsAsInnerVoice }))} /><TriStateField id="visible-state" label="読者に表示される" value={usageDraft.readerVisible} onChange={readerVisible => setUsageDraft(value => ({ ...value, readerVisible }))} /><TriStateField id="spoken-state" label="声に出している" value={usageDraft.spokenAloud} onChange={spokenAloud => setUsageDraft(value => ({ ...value, spokenAloud }))} /></div>
              <div><label htmlFor="speaker-mode" className="text-xs text-muted-foreground">話者</label><select id="speaker-mode" value={usageDraft.speakerMode} onChange={event => setUsageDraft(value => ({ ...value, speakerMode: event.target.value, fixedSpeakerId: event.target.value === 'fixed_character' ? value.fixedSpeakerId : '' }))} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm">{Object.entries(SYMBOL_SPEAKER_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              {usageDraft.speakerMode === 'fixed_character' && <div><label htmlFor="fixed-speaker" className="text-xs text-muted-foreground">登場人物</label><select id="fixed-speaker" value={usageDraft.fixedSpeakerId} onChange={event => setUsageDraft(value => ({ ...value, fixedSpeakerId: event.target.value }))} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm"><option value="">選択してください</option>{usageDraft.fixedSpeakerId && !characters.some(value => value.id === usageDraft.fixedSpeakerId) && <option value={usageDraft.fixedSpeakerId}>不明な人物（再選択してください）</option>}{characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></div>}
            </div></details>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3"><div><label htmlFor="usage-active" className="text-sm">この用途を使用する</label>{usageDraft.id && definition.defaultUsageRuleId === usageDraft.id && <p className="text-[11px] text-amber-500">無効にする前に、既定の用途を解除してください。</p>}</div><Switch id="usage-active" checked={usageDraft.active} disabled={Boolean(usageDraft.id && definition.defaultUsageRuleId === usageDraft.id)} onCheckedChange={active => setUsageDraft(value => ({ ...value, active }))} /></div>
            <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={saveUsage}><Save size={14} className="mr-1" />保存</Button><Button size="sm" variant="ghost" onClick={() => setShowUsage(false)}>キャンセル</Button></div>
          </div>}
        </CardContent></Card>}
      </div>
    </div>
    <SymbolOccurrenceBrowser projectId={projectId} />
  </div>;
}
