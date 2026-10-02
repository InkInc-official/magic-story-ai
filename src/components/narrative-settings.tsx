'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { NARRATIVE_RULE_CATEGORIES, NARRATIVE_RULE_MODES } from '@/lib/narrative-foundation';
import { NARRATIVE_RULE_CATEGORY_LABELS, NARRATIVE_RULE_MODE_LABELS, NARRATOR_DISCLOSURE_MODE_LABELS } from '@/lib/i18n';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

interface Option { id: string; name?: string; content?: string }
interface Narrator { id: string; name: string; description: string; voiceNotes: string; linkedCharacterId: string | null; identityFactId: string | null; identityDisclosureMode: string; notes: string }
interface Rule { id: string; title: string; description: string; category: string; mode: string; priority: number; source: string; machineKey: string | null; active: boolean; overridable: boolean }
const EMPTY_NARRATOR = { id: '', name: '', description: '', voiceNotes: '', linkedCharacterId: '', identityFactId: '', identityDisclosureMode: 'normal', notes: '' };
const EMPTY_RULE = { id: '', title: '', description: '', category: 'custom', mode: 'guidance', priority: '0', machineKey: '', active: true, overridable: false };

export function NarrativeSettings({ projectId, defaultNarratorId, characters, onProjectUpdate }: { projectId: string; defaultNarratorId?: string | null; characters: Option[]; onProjectUpdate: () => void }) {
  const [narrators, setNarrators] = useState<Narrator[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [facts, setFacts] = useState<Option[]>([]);
  const [narratorForm, setNarratorForm] = useState(EMPTY_NARRATOR);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [narratorResponse, ruleResponse, factResponse] = await Promise.all([
      fetch(`/api/narrators?projectId=${projectId}`), fetch(`/api/narrative-rules?projectId=${projectId}`), fetch(`/api/story-facts?projectId=${projectId}`),
    ]);
    if (narratorResponse.ok) setNarrators(await narratorResponse.json());
    if (ruleResponse.ok) setRules(await ruleResponse.json());
    if (factResponse.ok) setFacts(await factResponse.json());
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  const request = async (url: string, method: string, body?: object) => {
    setError('');
    const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) { const result = await response.json().catch(() => ({})); setError(result.error || '保存できませんでした'); return false; }
    return true;
  };
  const saveNarrator = async () => {
    const method = narratorForm.id ? 'PUT' : 'POST';
    if (await request('/api/narrators', method, { ...narratorForm, projectId })) { setNarratorForm(EMPTY_NARRATOR); await load(); }
  };
  const deleteNarrator = async (id: string) => {
    if (await request(`/api/narrators?id=${id}&projectId=${projectId}`, 'DELETE')) { setNarratorForm(EMPTY_NARRATOR); await load(); onProjectUpdate(); }
  };
  const saveDefaultNarrator = async (value: string) => {
    if (await request('/api/projects', 'PUT', { id: projectId, defaultNarratorId: value })) onProjectUpdate();
  };
  const saveRule = async () => {
    const method = ruleForm.id ? 'PUT' : 'POST';
    if (await request('/api/narrative-rules', method, { ...ruleForm, projectId, priority: Number(ruleForm.priority), source: 'author' })) { setRuleForm(EMPTY_RULE); await load(); }
  };
  const updateRule = async (rule: Rule, changes: Partial<Rule>) => {
    if (await request('/api/narrative-rules', 'PUT', { ...rule, ...changes, projectId })) await load();
  };
  const deleteRule = async (id: string) => {
    if (await request(`/api/narrative-rules?id=${id}&projectId=${projectId}`, 'DELETE')) { setRuleForm(EMPTY_RULE); await load(); }
  };

  return <div className="space-y-7">
    {error && <p className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}
    <section className="space-y-3">
      <div><h4 className="text-sm font-medium">語り手</h4><p className="text-xs text-muted-foreground">語り手は視点人物と別に管理します。人物と結び付かない語り手も作成できます。</p></div>
      <div><label className="mb-1 block text-xs text-muted-foreground">プロジェクト既定の語り手</label><select value={defaultNarratorId || ''} onChange={event => void saveDefaultNarrator(event.target.value)} className="h-9 w-full rounded-md border border-input bg-secondary px-3 text-sm"><option value="">未設定</option>{narrators.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div className="space-y-2">{narrators.map(item => <div key={item.id} className="flex items-start justify-between rounded border border-border/60 p-3"><div><div className="flex items-center gap-2 text-sm font-medium">{item.name}{item.identityDisclosureMode === 'concealed' && <Badge variant="outline">正体を秘匿</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{item.description || '説明なし'}</p></div><div className="flex"><Button variant="ghost" size="sm" onClick={() => setNarratorForm({ ...item, linkedCharacterId: item.linkedCharacterId || '', identityFactId: item.identityFactId || '' })}><Pencil size={13} /></Button><Button variant="ghost" size="sm" onClick={() => void deleteNarrator(item.id)}><Trash2 size={13} /></Button></div></div>)}</div>
      <div className="space-y-3 rounded border border-border/60 bg-secondary/20 p-3">
        <div className="flex items-center justify-between"><p className="text-xs font-medium">{narratorForm.id ? '語り手を編集' : '語り手を追加'}</p>{narratorForm.id && <Button variant="ghost" size="sm" onClick={() => setNarratorForm(EMPTY_NARRATOR)}><X size={13} /></Button>}</div>
        <Input value={narratorForm.name} onChange={e => setNarratorForm({ ...narratorForm, name: e.target.value })} placeholder="作者向けの語り手名" maxLength={120} />
        <Textarea value={narratorForm.description} onChange={e => setNarratorForm({ ...narratorForm, description: e.target.value })} placeholder="語り手の役割・性質" rows={2} />
        <div className="grid gap-2 md:grid-cols-2"><select value={narratorForm.linkedCharacterId} onChange={e => setNarratorForm({ ...narratorForm, linkedCharacterId: e.target.value })} className="h-9 rounded-md border border-input bg-secondary px-3 text-sm"><option value="">人物とは結び付けない</option>{characters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={narratorForm.identityFactId} onChange={e => setNarratorForm({ ...narratorForm, identityFactId: e.target.value })} className="h-9 rounded-md border border-input bg-secondary px-3 text-sm"><option value="">正体のStoryFactなし</option>{facts.map(item => <option key={item.id} value={item.id}>{item.content}</option>)}</select></div>
        <select value={narratorForm.identityDisclosureMode} onChange={e => setNarratorForm({ ...narratorForm, identityDisclosureMode: e.target.value })} className="h-9 w-full rounded-md border border-input bg-secondary px-3 text-sm">{Object.entries(NARRATOR_DISCLOSURE_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <Textarea value={narratorForm.voiceNotes} onChange={e => setNarratorForm({ ...narratorForm, voiceNotes: e.target.value })} placeholder="語りの声・文体メモ" rows={2} />
        <Textarea value={narratorForm.notes} onChange={e => setNarratorForm({ ...narratorForm, notes: e.target.value })} placeholder="作者向けメモ" rows={2} />
        <Button size="sm" onClick={() => void saveNarrator()} disabled={!narratorForm.name.trim()}><Plus size={13} className="mr-1" />{narratorForm.id ? '更新' : '追加'}</Button>
      </div>
    </section>

    <section className="space-y-3 border-t border-border pt-6">
      <div><h4 className="text-sm font-medium">叙述ルール</h4><p className="text-xs text-muted-foreground">この作品だけに適用する視点・知識・語り・表現上のルールを設定します。</p></div>
      <div className="space-y-2">{rules.map(rule => <div key={rule.id} className="rounded border border-border/60 p-3"><div className="flex items-start justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{rule.title}</span><Badge variant="outline">{NARRATIVE_RULE_CATEGORY_LABELS[rule.category] || rule.category}</Badge><Badge variant="outline">{NARRATIVE_RULE_MODE_LABELS[rule.mode] || rule.mode}</Badge>{!rule.active && <Badge variant="secondary">無効</Badge>}</div><p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{rule.description}</p></div><div className="flex"><Button variant="ghost" size="sm" onClick={() => void updateRule(rule, { active: !rule.active })}>{rule.active ? '無効化' : '有効化'}</Button><Button variant="ghost" size="sm" onClick={() => setRuleForm({ ...rule, priority: String(rule.priority), machineKey: rule.machineKey || '' })}><Pencil size={13} /></Button><Button variant="ghost" size="sm" onClick={() => void deleteRule(rule.id)}><Trash2 size={13} /></Button></div></div></div>)}</div>
      <div className="space-y-3 rounded border border-border/60 bg-secondary/20 p-3">
        <div className="flex items-center justify-between"><p className="text-xs font-medium">{ruleForm.id ? 'ルールを編集' : 'ルールを追加'}</p>{ruleForm.id && <Button variant="ghost" size="sm" onClick={() => setRuleForm(EMPTY_RULE)}><X size={13} /></Button>}</div>
        <Input value={ruleForm.title} onChange={e => setRuleForm({ ...ruleForm, title: e.target.value })} placeholder="ルール名" maxLength={160} />
        <Textarea value={ruleForm.description} onChange={e => setRuleForm({ ...ruleForm, description: e.target.value })} placeholder="この作品で守る内容。ここに書いた自由記述がルールの正本です。" rows={3} />
        <div className="grid gap-2 md:grid-cols-3"><select value={ruleForm.category} onChange={e => setRuleForm({ ...ruleForm, category: e.target.value })} className="h-9 rounded-md border border-input bg-secondary px-3 text-sm">{NARRATIVE_RULE_CATEGORIES.map(value => <option key={value} value={value}>{NARRATIVE_RULE_CATEGORY_LABELS[value]}</option>)}</select><select value={ruleForm.mode} onChange={e => setRuleForm({ ...ruleForm, mode: e.target.value })} className="h-9 rounded-md border border-input bg-secondary px-3 text-sm">{NARRATIVE_RULE_MODES.map(value => <option key={value} value={value}>{NARRATIVE_RULE_MODE_LABELS[value]}</option>)}</select><Input type="number" min={-1000} max={1000} value={ruleForm.priority} onChange={e => setRuleForm({ ...ruleForm, priority: e.target.value })} placeholder="優先度" /></div>
        <details><summary className="cursor-pointer text-xs text-muted-foreground">詳細設定</summary><div className="mt-2 space-y-2"><Input value={ruleForm.machineKey} onChange={e => setRuleForm({ ...ruleForm, machineKey: e.target.value })} placeholder="machineKey（補助・任意）" maxLength={120} /><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ruleForm.overridable} onChange={e => setRuleForm({ ...ruleForm, overridable: e.target.checked })} />下位設定・明示例外による上書きを許可</label></div></details>
        <Button size="sm" onClick={() => void saveRule()} disabled={!ruleForm.title.trim() || !ruleForm.description.trim()}><Plus size={13} className="mr-1" />{ruleForm.id ? '更新' : '追加'}</Button>
      </div>
    </section>
  </div>;
}
