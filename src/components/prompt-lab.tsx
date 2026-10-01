'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { extractVariables } from '@/lib/variable-resolver';
import { displayLabel, PROMPT_PRESET_NAME_LABELS } from '@/lib/i18n';
import { JAPANESE_NOVEL_CORE_PRINCIPLES } from '@/lib/prompts/ja';
import { FlaskConical, Plus, Trash2, Edit3, Save, X, Code, Star } from 'lucide-react';

interface PromptTemplate {
  id: string;
  name: string;
  type: string;
  content: string;
  isDefault: boolean;
}

interface PromptLabProps {
  projectId: string;
}

const PROMPT_TYPES = [
  { value: 'general', label: '汎用', emoji: '📝' },
  { value: 'world', label: '世界観', emoji: '🌍' },
  { value: 'character', label: 'キャラクター', emoji: '👤' },
  { value: 'outline', label: 'プロット', emoji: '📋' },
  { value: 'chapter', label: '章', emoji: '📖' },
  { value: 'review', label: 'レビュー', emoji: '🔍' },
  { value: 'edit', label: '推敲', emoji: '✏️' },
];

const PRESET_TEMPLATES = [
  {
    name: '默认大纲生成',
    type: 'outline',
    content: `${JAPANESE_NOVEL_CORE_PRINCIPLES}\n\n【タスク固有指示：プロット作成】\nジャンル：\${genre}\n世界観：\${background}\n人物：\${characters}\n\n作品の目的、人物の選択、対立、出来事の因果、情報開示、伏線を整理してください。主線・副線・巻構成は必要な場合だけ用い、特定の構成理論や成長を強制しないでください。`,
    isDefault: true,
  },
  {
    name: '默认章节生成',
    type: 'chapter',
    content: `${JAPANESE_NOVEL_CORE_PRINCIPLES}\n\n【タスク固有指示：章本文】\n詳細プロット：\${chapter_outline}\n文体指定：\${style}\n世界観：\${background}\n人物設定：\${characters}\n人物関係：\${relationships}\n全体プロット：\${outline}\n\n詳細プロットと既存設定の整合性を保ち、人物ごとの話し方と視点人物の知識範囲を反映してください。章末は章の役割に合う形を選び、クリフハンガーを必須にしないでください。`,
    isDefault: true,
  },
  {
    name: '默认润色',
    type: 'edit',
    content: `${JAPANESE_NOVEL_CORE_PRINCIPLES}\n\n【タスク固有指示：推敲】\n対象本文：\n\${selected_text}\n\n作者の意図、情報、視点、文章の声を保ち、誤文、助詞、係り受け、冗長、表記揺れなど必要な箇所だけを修正してください。文章を一律に口語化・短文化せず、意味やニュアンスの変更を最小限にしてください。`,
    isDefault: true,
  },
  {
    name: '默认角色设计',
    type: 'character',
    content: `${JAPANESE_NOVEL_CORE_PRINCIPLES}\n\n【タスク固有指示：人物設計】\nジャンル：\${genre}\n世界観：\${background}\n\n作品に必要な人物だけを設計してください。各人物について、目的、価値観、弱点、関係性に加え、一人称、相手別の呼称、敬語、語彙、語尾、発話の長さを具体化してください。人数や成長を固定条件にしないでください。`,
    isDefault: true,
  },
  {
    name: '默认评审',
    type: 'review',
    content: `${JAPANESE_NOVEL_CORE_PRINCIPLES}\n\n【タスク固有指示：評価】\n対象本文：\n\${selected_text}\n\n作品の目的への適合、構成と因果、人物、視点と文章、情報開示、設定の整合性を評価してください。指摘には根拠、影響、改善案を添え、商業性や完読欲は依頼または作品目的に含まれる場合だけ扱ってください。`,
    isDefault: true,
  },
  {
    name: '默认世界观构建',
    type: 'world',
    content: `${JAPANESE_NOVEL_CORE_PRINCIPLES}\n\n【タスク固有指示：世界観設計】\nジャンル：\${genre}\n\n物語の人物、選択、対立、事件に必要な設定を優先して設計してください。自然環境、社会、制度、文化、歴史などから必要な領域だけを選び、規則、例外、代価、物語への影響を示してください。能力体系やレベル制度は必要な作品だけに適用してください。`,
    isDefault: true,
  },
];

export function PromptLab({ projectId }: PromptLabProps) {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', type: 'general', content: '', isDefault: false });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', type: '', content: '' });
  const [previewVars, setPreviewVars] = useState<string[]>([]);

  const fetchPrompts = useCallback(async () => {
    try {
      const res = await fetch(`/api/prompts?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setPrompts(data);
      }
    } catch (e) {
      console.error('Failed to fetch prompts:', e);
    }
  }, [projectId]);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.content.trim()) return;
    try {
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...createForm }),
      });
      if (res.ok) {
        await fetchPrompts();
        setIsCreating(false);
        setCreateForm({ name: '', type: 'general', content: '', isDefault: false });
      }
    } catch (e) {
      console.error('Failed to create prompt:', e);
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const res = await fetch('/api/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editForm }),
      });
      if (res.ok) {
        await fetchPrompts();
        setEditingId(null);
      }
    } catch (e) {
      console.error('Failed to update prompt:', e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/prompts?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchPrompts();
      }
    } catch (e) {
      console.error('Failed to delete prompt:', e);
    }
  };

  const handleLoadPresets = async () => {
    try {
      for (const preset of PRESET_TEMPLATES) {
        await fetch('/api/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, ...preset }),
        });
      }
      await fetchPrompts();
    } catch (e) {
      console.error('Failed to load presets:', e);
    }
  };

  const getTypeLabel = (type: string) => PROMPT_TYPES.find(t => t.value === type) || PROMPT_TYPES[0];

  const updatePreviewVars = (content: string) => {
    setPreviewVars(extractVariables(content));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical size={20} className="text-purple-400" />
          <h2 className="text-lg font-bold text-foreground">プロンプトラボ</h2>
          <Badge variant="secondary" className="text-xs">{prompts.length}件のテンプレート</Badge>
        </div>
        <div className="flex items-center gap-2">
          {prompts.length === 0 && (
            <Button variant="outline" size="sm" onClick={handleLoadPresets}>
              <Star size={14} className="mr-1" />
              プリセットを読み込む
            </Button>
          )}
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus size={14} className="mr-1" />
            テンプレートを作成
          </Button>
        </div>
      </div>

      {/* Variable Reference */}
      <Card className="bg-secondary/30 border-border/30">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground font-medium mb-2">
            <Code size={12} className="inline mr-1" />
            使用可能な変数
          </p>
          <div className="flex flex-wrap gap-1.5">
            {['${background}', '${characters}', '${relationships}', '${plot}', '${style}', '${outline}', '${chapter_outline}', '${selected_text}', '${genre}', '${world_rules}'].map(v => (
              <code key={v} className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-mono">
                {v}
              </code>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create Form */}
      {isCreating && (
        <Card className="bg-card/50 border-primary/30 glow-amber">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">プロンプトテンプレートを作成</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)}><X size={14} /></Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">名前</label>
                <Input value={createForm.name} onChange={e => setCreateForm(prev => ({ ...prev, name: e.target.value }))} placeholder="テンプレート名" className="text-sm" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">種類</label>
                <select value={createForm.type} onChange={e => setCreateForm(prev => ({ ...prev, type: e.target.value }))} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm text-foreground focus:outline-none">
                  {PROMPT_TYPES.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">プロンプト本文</label>
              <Textarea
                value={createForm.content}
                onChange={e => { setCreateForm(prev => ({ ...prev, content: e.target.value })); updatePreviewVars(e.target.value); }}
                placeholder="プロンプトを入力。${variable} で変数を挿入できます..."
                rows={8}
                className="text-sm font-mono resize-none"
              />
            </div>
            {previewVars.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-xs text-muted-foreground">検出した変数：</span>
                {previewVars.map(v => (
                  <code key={v} className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-mono">${`{${v}}`}</code>
                ))}
              </div>
            )}
            <Button size="sm" onClick={handleCreate} disabled={!createForm.name.trim() || !createForm.content.trim()}>
              <Save size={14} className="mr-1" />テンプレートを保存
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Prompt List */}
      <div className="space-y-3">
        {prompts.map(prompt => {
          const typeInfo = getTypeLabel(prompt.type);
          const isEditing = editingId === prompt.id;

          return (
            <Card key={prompt.id} className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className="text-sm" />
                      <select value={editForm.type} onChange={e => setEditForm(p => ({ ...p, type: e.target.value }))} className="h-9 px-3 bg-secondary border border-input rounded-md text-sm text-foreground focus:outline-none">
                        {PROMPT_TYPES.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                      </select>
                    </div>
                    <Textarea value={editForm.content} onChange={e => setEditForm(p => ({ ...p, content: e.target.value }))} rows={6} className="text-sm font-mono resize-none" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleUpdate(prompt.id)}><Save size={14} className="mr-1" />保存</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>キャンセル</Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{typeInfo.emoji}</span>
                        <h3 className="font-medium text-foreground text-sm">{displayLabel(PROMPT_PRESET_NAME_LABELS, prompt.name)}</h3>
                        <Badge variant="outline" className="text-xs">{typeInfo.label}</Badge>
                        {prompt.isDefault && <Badge className="text-xs bg-primary/20 text-primary">標準</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditingId(prompt.id); setEditForm({ name: prompt.name, type: prompt.type, content: prompt.content }); }}>
                          <Edit3 size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(prompt.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-secondary/30 p-3 rounded-lg font-mono max-h-32 overflow-y-auto custom-scrollbar">
                      {prompt.content}
                    </pre>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {extractVariables(prompt.content).map(v => (
                        <code key={v} className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-mono">${`{${v}}`}</code>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {prompts.length === 0 && !isCreating && (
          <div className="text-center py-12 text-muted-foreground">
            <FlaskConical size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">プロンプトテンプレートはまだありません</p>
            <p className="text-xs mt-1">「プリセットを読み込む」から標準テンプレートを追加するか、手動で作成してください</p>
          </div>
        )}
      </div>
    </div>
  );
}
