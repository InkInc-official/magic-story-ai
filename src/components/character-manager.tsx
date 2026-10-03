'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/lib/store';
import { Users, Plus, Trash2, Edit3, Save, X, Sparkles, Link2 } from 'lucide-react';
import { CHARACTER_ROLE_LABELS, displayLabel, RELATIONSHIP_LABELS } from '@/lib/i18n';
import { SPEECH_REGISTER_LABELS } from '@/lib/i18n';
import { CharacterVoiceFields, type CharacterVoiceForm } from '@/components/character-voice-fields';

interface Character {
  id: string;
  name: string;
  age: string;
  role: string;
  personality: string;
  appearance: string;
  background: string;
  arc: string;
  firstPerson: string;
  defaultSecondPerson: string;
  speechRegister: string;
  speechStyleNotes: string;
  narrationVoiceNotes: string;
  fromRelations?: { id: string; type: string; toCharacter: { name: string } }[];
  toRelations?: { id: string; type: string; fromCharacter: { name: string } }[];
}

interface Relationship {
  id: string;
  fromCharacterId: string;
  toCharacterId: string;
  type: string;
  description: string;
  addressTerm: string;
  speechRegister: string;
  speechStyleNotes: string;
  fromCharacter: { name: string };
  toCharacter: { name: string };
}

interface CharacterManagerProps {
  projectId: string;
}

const ROLE_OPTIONS = [
  { value: '主角', label: displayLabel(CHARACTER_ROLE_LABELS, '主角'), color: 'text-amber-400' },
  { value: '女主', label: displayLabel(CHARACTER_ROLE_LABELS, '女主'), color: 'text-rose-400' },
  { value: '反派', label: displayLabel(CHARACTER_ROLE_LABELS, '反派'), color: 'text-red-400' },
  { value: '配角', label: displayLabel(CHARACTER_ROLE_LABELS, '配角'), color: 'text-blue-400' },
  { value: '导师', label: displayLabel(CHARACTER_ROLE_LABELS, '导师'), color: 'text-teal-400' },
  { value: '路人', label: displayLabel(CHARACTER_ROLE_LABELS, '路人'), color: 'text-muted-foreground' },
];

const RELATION_TYPES = ['盟友', '恋人', '师徒', '父子', '母女', '兄弟', '姐妹', '仇敌', '对手', '暗恋', '上下级', '同门', '契约'];
const EMPTY_VOICE: CharacterVoiceForm = { firstPerson: '', defaultSecondPerson: '', speechRegister: '', speechStyleNotes: '', narrationVoiceNotes: '' };
const EMPTY_CHARACTER_FORM = { name: '', age: '', role: '主角', personality: '', appearance: '', background: '', arc: '', ...EMPTY_VOICE };

export function CharacterManager({ projectId }: CharacterManagerProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CHARACTER_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_CHARACTER_FORM, role: '' });
  const [showRelForm, setShowRelForm] = useState(false);
  const [relForm, setRelForm] = useState({ fromId: '', toId: '', type: '盟友', description: '', addressTerm: '', speechRegister: '', speechStyleNotes: '' });
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [relEditForm, setRelEditForm] = useState({ addressTerm: '', speechRegister: '', speechStyleNotes: '' });
  const { setActiveAgent } = useAppStore();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/characters?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setCharacters(data.characters || []);
        setRelationships(data.relationships || []);
      }
    } catch (e) {
      console.error('Failed to fetch characters:', e);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async () => {
    if (!createForm.name.trim()) return;
    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...createForm }),
      });
      if (res.ok) {
        await fetchData();
        setIsCreating(false);
        setCreateForm(EMPTY_CHARACTER_FORM);
      }
    } catch (e) {
      console.error('Failed to create character:', e);
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const res = await fetch('/api/characters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editForm }),
      });
      if (res.ok) {
        await fetchData();
        setEditingId(null);
      }
    } catch (e) {
      console.error('Failed to update character:', e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/characters?id=${id}&projectId=${projectId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchData();
        if (selectedChar === id) setSelectedChar(null);
      }
    } catch (e) {
      console.error('Failed to delete character:', e);
    }
  };

  const handleCreateRel = async () => {
    if (!relForm.fromId || !relForm.toId) return;
    try {
      const res = await fetch('/api/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, fromCharacterId: relForm.fromId, toCharacterId: relForm.toId, type: relForm.type, description: relForm.description, addressTerm: relForm.addressTerm, speechRegister: relForm.speechRegister, speechStyleNotes: relForm.speechStyleNotes }),
      });
      if (res.ok) {
        await fetchData();
        setShowRelForm(false);
        setRelForm({ fromId: '', toId: '', type: '盟友', description: '', addressTerm: '', speechRegister: '', speechStyleNotes: '' });
      }
    } catch (e) {
      console.error('Failed to create relationship:', e);
    }
  };

  const handleUpdateRel = async (id: string) => {
    const res = await fetch('/api/relationships', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...relEditForm }) });
    if (res.ok) { await fetchData(); setEditingRelId(null); }
  };

  const handleDeleteRel = async (id: string) => {
    try {
      const res = await fetch(`/api/relationships?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchData();
      }
    } catch (e) {
      console.error('Failed to delete relationship:', e);
    }
  };

  const startEdit = (char: Character) => {
    setEditingId(char.id);
    setEditForm({ name: char.name, age: char.age, role: char.role, personality: char.personality, appearance: char.appearance, background: char.background, arc: char.arc, firstPerson: char.firstPerson || '', defaultSecondPerson: char.defaultSecondPerson || '', speechRegister: char.speechRegister || '', speechStyleNotes: char.speechStyleNotes || '', narrationVoiceNotes: char.narrationVoiceNotes || '' });
  };

  const getRoleInfo = (role: string) => ROLE_OPTIONS.find(r => r.value === role) || ROLE_OPTIONS[3];

  const selectedCharacter = characters.find(c => c.id === selectedChar);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={20} className="text-rose-400" />
          <h2 className="text-lg font-bold text-foreground">キャラクター管理</h2>
          <Badge variant="secondary" className="text-xs">{characters.length}人</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveAgent('character')}
            className="text-rose-400 border-rose-400/30 hover:bg-rose-400/10"
          >
            <Sparkles size={14} className="mr-1" />
            AIで設計
          </Button>
          <Button size="sm" onClick={() => setShowRelForm(true)} variant="outline">
            <Link2 size={14} className="mr-1" />
            関係を追加
          </Button>
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus size={14} className="mr-1" />
            キャラクターを追加
          </Button>
        </div>
      </div>

      {/* Relationship Form */}
      {showRelForm && (
        <Card className="bg-card/50 border-primary/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">人物関係を追加</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowRelForm(false)}><X size={14} /></Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <select value={relForm.fromId} onChange={e => setRelForm(prev => ({ ...prev, fromId: e.target.value }))} className="h-9 px-3 bg-secondary border border-input rounded-md text-sm text-foreground focus:outline-none">
                <option value="">キャラクターAを選択</option>
                {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={relForm.type} onChange={e => setRelForm(prev => ({ ...prev, type: e.target.value }))} className="h-9 px-3 bg-secondary border border-input rounded-md text-sm text-foreground focus:outline-none">
                {RELATION_TYPES.map(t => <option key={t} value={t}>{displayLabel(RELATIONSHIP_LABELS, t)}</option>)}
              </select>
              <select value={relForm.toId} onChange={e => setRelForm(prev => ({ ...prev, toId: e.target.value }))} className="h-9 px-3 bg-secondary border border-input rounded-md text-sm text-foreground focus:outline-none">
                <option value="">キャラクターBを選択</option>
                {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">矢印の左側の人物が、右側の人物へどう話すかを設定します。</p>
            <Input value={relForm.description} onChange={e => setRelForm(prev => ({ ...prev, description: e.target.value }))} placeholder="関係の説明..." className="text-sm" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border/60 p-3">
              <div><label className="block text-xs text-muted-foreground mb-1">相手への呼び方</label><Input value={relForm.addressTerm} onChange={e => setRelForm(prev => ({ ...prev, addressTerm: e.target.value }))} placeholder="未設定時は人物の基本二人称" /></div>
              <div><label className="block text-xs text-muted-foreground mb-1">相手への敬語・話し方</label><select value={relForm.speechRegister} onChange={e => setRelForm(prev => ({ ...prev, speechRegister: e.target.value }))} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm"><option value="">基本設定を使用</option>{Object.entries(SPEECH_REGISTER_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
              <div className="sm:col-span-2"><label className="block text-xs text-muted-foreground mb-1">この相手に対する話し方メモ</label><Textarea value={relForm.speechStyleNotes} onChange={e => setRelForm(prev => ({ ...prev, speechStyleNotes: e.target.value }))} rows={2} placeholder="空欄の場合は人物の基本設定を使用" /></div>
            </div>
            <Button size="sm" onClick={handleCreateRel} disabled={!relForm.fromId || !relForm.toId}>
              <Save size={14} className="mr-1" />関係を保存
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create Form */}
      {isCreating && (
        <Card className="bg-card/50 border-primary/30 glow-amber">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">キャラクターを作成</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)}><X size={14} /></Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">名前</label>
                <Input value={createForm.name} onChange={e => setCreateForm(prev => ({ ...prev, name: e.target.value }))} placeholder="キャラクター名" className="text-sm" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">年齢</label>
                <Input value={createForm.age} onChange={e => setCreateForm(prev => ({ ...prev, age: e.target.value }))} placeholder="年齢" className="text-sm" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">役割</label>
                <select value={createForm.role} onChange={e => setCreateForm(prev => ({ ...prev, role: e.target.value }))} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm text-foreground focus:outline-none">
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">性格</label>
              <Input value={createForm.personality} onChange={e => setCreateForm(prev => ({ ...prev, personality: e.target.value }))} placeholder="性格を説明..." className="text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">外見</label>
              <Input value={createForm.appearance} onChange={e => setCreateForm(prev => ({ ...prev, appearance: e.target.value }))} placeholder="外見を説明..." className="text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">背景</label>
              <Textarea value={createForm.background} onChange={e => setCreateForm(prev => ({ ...prev, background: e.target.value }))} placeholder="キャラクターの背景..." rows={2} className="text-sm resize-none" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">成長曲線</label>
              <Textarea value={createForm.arc} onChange={e => setCreateForm(prev => ({ ...prev, arc: e.target.value }))} placeholder="キャラクターの成長過程..." rows={2} className="text-sm resize-none" />
            </div>
            <CharacterVoiceFields value={createForm} onChange={voice => setCreateForm(prev => ({ ...prev, ...voice }))} />
            <Button size="sm" onClick={handleCreate} disabled={!createForm.name.trim()}>
              <Save size={14} className="mr-1" />キャラクターを作成
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {/* Character List */}
        <div className="md:col-span-1 space-y-2">
          <ScrollArea className="max-h-[60vh]">
            {characters.map(char => {
              const roleInfo = getRoleInfo(char.role);
              const isSelected = selectedChar === char.id;
              return (
                <button
                  key={char.id}
                  onClick={() => setSelectedChar(isSelected ? null : char.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors mb-1 ${
                    isSelected ? 'bg-primary/15 border border-primary/30' : 'bg-card/50 border border-border/50 hover:border-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground text-sm">{char.name}</span>
                    <Badge variant="outline" className={`text-[10px] ${roleInfo.color}`}>{roleInfo.label}</Badge>
                  </div>
                  {char.personality && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{char.personality}</p>
                  )}
                </button>
              );
            })}
            {characters.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">キャラクターがまだありません</p>
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Character Detail */}
        <div className="md:col-span-2">
          {selectedCharacter ? (
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{editingId === selectedCharacter.id ? editForm.name : selectedCharacter.name}</CardTitle>
                    <Badge variant="outline" className={`text-xs ${getRoleInfo(selectedCharacter.role).color}`}>
                      {getRoleInfo(selectedCharacter.role).label}
                    </Badge>
                    {selectedCharacter.age && (
                      <span className="text-xs text-muted-foreground">{selectedCharacter.age}歳</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {editingId === selectedCharacter.id ? (
                      <>
                        <Button size="sm" onClick={() => handleUpdate(selectedCharacter.id)}>
                          <Save size={14} className="mr-1" />保存
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>キャンセル</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(selectedCharacter)}>
                          <Edit3 size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(selectedCharacter.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {editingId === selectedCharacter.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs text-muted-foreground mb-1">名前</label><Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="text-sm" /></div>
                      <div><label className="block text-xs text-muted-foreground mb-1">年齢</label><Input value={editForm.age} onChange={e => setEditForm(p => ({ ...p, age: e.target.value }))} className="text-sm" /></div>
                    </div>
                    <div><label className="block text-xs text-muted-foreground mb-1">性格</label><Input value={editForm.personality} onChange={e => setEditForm(p => ({ ...p, personality: e.target.value }))} className="text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">外見</label><Input value={editForm.appearance} onChange={e => setEditForm(p => ({ ...p, appearance: e.target.value }))} className="text-sm" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">背景</label><Textarea value={editForm.background} onChange={e => setEditForm(p => ({ ...p, background: e.target.value }))} rows={3} className="text-sm resize-none" /></div>
                    <div><label className="block text-xs text-muted-foreground mb-1">成長曲線</label><Textarea value={editForm.arc} onChange={e => setEditForm(p => ({ ...p, arc: e.target.value }))} rows={2} className="text-sm resize-none" /></div>
                    <CharacterVoiceFields value={editForm} onChange={voice => setEditForm(prev => ({ ...prev, ...voice }))} />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedCharacter.personality && (
                      <div><p className="text-xs text-muted-foreground font-medium mb-1">🧠 性格</p><p className="text-sm text-foreground/80 whitespace-pre-wrap">{selectedCharacter.personality}</p></div>
                    )}
                    {selectedCharacter.appearance && (
                      <div><p className="text-xs text-muted-foreground font-medium mb-1">👤 外見</p><p className="text-sm text-foreground/80 whitespace-pre-wrap">{selectedCharacter.appearance}</p></div>
                    )}
                    {selectedCharacter.background && (
                      <div><p className="text-xs text-muted-foreground font-medium mb-1">📖 背景</p><p className="text-sm text-foreground/80 whitespace-pre-wrap">{selectedCharacter.background}</p></div>
                    )}
                    {selectedCharacter.arc && (
                      <div><p className="text-xs text-muted-foreground font-medium mb-1">📈 成長曲線</p><p className="text-sm text-foreground/80 whitespace-pre-wrap">{selectedCharacter.arc}</p></div>
                    )}
                    {(selectedCharacter.firstPerson || selectedCharacter.defaultSecondPerson || selectedCharacter.speechRegister || selectedCharacter.speechStyleNotes || selectedCharacter.narrationVoiceNotes) && (
                      <div className="rounded-lg border border-border/60 p-3 space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">🗣️ 話し方</p>
                        {selectedCharacter.firstPerson && <p className="text-sm">一人称：{selectedCharacter.firstPerson}</p>}
                        {selectedCharacter.defaultSecondPerson && <p className="text-sm">基本二人称：{selectedCharacter.defaultSecondPerson}</p>}
                        {selectedCharacter.speechRegister && <p className="text-sm">話し方：{displayLabel(SPEECH_REGISTER_LABELS, selectedCharacter.speechRegister)}</p>}
                        {selectedCharacter.speechStyleNotes && <p className="text-sm whitespace-pre-wrap">台詞：{selectedCharacter.speechStyleNotes}</p>}
                        {selectedCharacter.narrationVoiceNotes && <p className="text-sm whitespace-pre-wrap">地の文：{selectedCharacter.narrationVoiceNotes}</p>}
                      </div>
                    )}
                    {/* Relationships */}
                    {relationships.filter(r => r.fromCharacterId === selectedCharacter.id || r.toCharacterId === selectedCharacter.id).length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground font-medium mb-2">🔗 人物関係</p>
                        <div className="space-y-1">
                          {relationships.filter(r => r.fromCharacterId === selectedCharacter.id || r.toCharacterId === selectedCharacter.id).map(rel => (
                            <div key={rel.id} className="text-xs bg-secondary/50 px-2 py-2 rounded">
                              <div className="flex items-center gap-2">
                              <span className="text-foreground">{rel.fromCharacter.name}</span>
                              <span className="text-muted-foreground">→</span>
                              <Badge variant="outline" className="text-[10px]">{displayLabel(RELATIONSHIP_LABELS, rel.type)}</Badge>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-foreground">{rel.toCharacter.name}</span>
                              {rel.description && <span className="text-muted-foreground ml-1">({rel.description})</span>}
                              <button onClick={() => { setEditingRelId(rel.id); setRelEditForm({ addressTerm: rel.addressTerm || '', speechRegister: rel.speechRegister || '', speechStyleNotes: rel.speechStyleNotes || '' }); }} className="ml-auto text-muted-foreground hover:text-foreground"><Edit3 size={12} /></button>
                              <button onClick={() => handleDeleteRel(rel.id)} className="ml-auto text-muted-foreground hover:text-destructive"><X size={12} /></button>
                              </div>
                              {(rel.addressTerm || rel.speechRegister || rel.speechStyleNotes) && editingRelId !== rel.id && <p className="mt-1 text-muted-foreground">{rel.fromCharacter.name} → {rel.toCharacter.name}：{rel.addressTerm && `呼称「${rel.addressTerm}」 `}{rel.speechRegister && displayLabel(SPEECH_REGISTER_LABELS, rel.speechRegister)}{rel.speechStyleNotes && `／${rel.speechStyleNotes}`}</p>}
                              {editingRelId === rel.id && <div className="mt-2 grid gap-2 border-t border-border pt-2">
                                <p className="text-muted-foreground">{rel.fromCharacter.name}が{rel.toCharacter.name}へ話すときの差分</p>
                                <Input value={relEditForm.addressTerm} onChange={e => setRelEditForm(prev => ({ ...prev, addressTerm: e.target.value }))} placeholder="相手への呼び方" className="h-8 text-xs" />
                                <select value={relEditForm.speechRegister} onChange={e => setRelEditForm(prev => ({ ...prev, speechRegister: e.target.value }))} className="h-8 px-2 bg-secondary border border-input rounded"><option value="">基本設定を使用</option>{relEditForm.speechRegister && !SPEECH_REGISTER_LABELS[relEditForm.speechRegister] && <option value={relEditForm.speechRegister}>{relEditForm.speechRegister}</option>}{Object.entries(SPEECH_REGISTER_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                                <Textarea value={relEditForm.speechStyleNotes} onChange={e => setRelEditForm(prev => ({ ...prev, speechStyleNotes: e.target.value }))} rows={2} placeholder="この相手に対する話し方メモ" />
                                <div><Button size="sm" onClick={() => handleUpdateRel(rel.id)}>保存</Button><Button size="sm" variant="ghost" onClick={() => setEditingRelId(null)}>キャンセル</Button></div>
                              </div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              左側からキャラクターを選択してください
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
