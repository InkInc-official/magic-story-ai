'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Settings, Save, Download, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { CHAPTER_LENGTH_POLICY_LABELS, displayLabel, GENRE_GUIDANCE_MODE_LABELS, GENRE_LABELS, NARRATIVE_PERSPECTIVE_LABELS } from '@/lib/i18n';
import { NarrativeSettings } from '@/components/narrative-settings';

const GENRE_OPTIONS = [
  ['玄幻系统修仙', '⚔️'], ['都市重生', '🔄'], ['脑洞网文', '💡'],
  ['都市修仙', '🏙️'], ['都市高武', '👊'], ['末日系统', '🧟'],
  ['霸总', '👑'], ['后悔流', '😢'], ['无敌文', '💪'],
  ['历史架空', '📜'], ['东方玄幻', '🐉'], ['策略经营', '🏰'],
] as const;

export interface ProjectSettings {
  id: string;
  title: string;
  genre: string;
  description: string;
  narrativePerspective?: string | null;
  defaultPovCharacterId?: string | null;
  defaultNarratorId?: string | null;
  povNotes?: string;
  writingStyleNotes?: string;
  defaultChapterTarget?: number | null;
  chapterLengthPolicy?: string;
  formattingNotes?: string;
  authorIntent?: string;
  genreGuidanceMode?: string;
  genreGuidanceNotes?: string;
}

interface CharacterOption { id: string; name: string }

interface SettingsPanelProps {
  project?: ProjectSettings;
  onUpdate: () => void;
}

export function SettingsPanel({ project, onUpdate }: SettingsPanelProps) {
  const [title, setTitle] = useState(project?.title || '');
  const [genre, setGenre] = useState(project?.genre || '');
  const [description, setDescription] = useState(project?.description || '');
  const [narrativePerspective, setNarrativePerspective] = useState(project?.narrativePerspective || '');
  const [defaultPovCharacterId, setDefaultPovCharacterId] = useState(project?.defaultPovCharacterId || '');
  const [povNotes, setPovNotes] = useState(project?.povNotes || '');
  const [writingStyleNotes, setWritingStyleNotes] = useState(project?.writingStyleNotes || '');
  const [defaultChapterTarget, setDefaultChapterTarget] = useState(project?.defaultChapterTarget?.toString() || '');
  const [chapterLengthPolicy, setChapterLengthPolicy] = useState(project?.chapterLengthPolicy || 'guide');
  const [formattingNotes, setFormattingNotes] = useState(project?.formattingNotes || '');
  const [authorIntent, setAuthorIntent] = useState(project?.authorIntent || '');
  const [genreGuidanceMode, setGenreGuidanceMode] = useState(project?.genreGuidanceMode || 'reference');
  const [genreGuidanceNotes, setGenreGuidanceNotes] = useState(project?.genreGuidanceNotes || '');
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!project) return;
    setTitle(project.title); setGenre(project.genre); setDescription(project.description);
    setNarrativePerspective(project.narrativePerspective || '');
    setDefaultPovCharacterId(project.defaultPovCharacterId || '');
    setPovNotes(project.povNotes || ''); setWritingStyleNotes(project.writingStyleNotes || '');
    setDefaultChapterTarget(project.defaultChapterTarget?.toString() || '');
    setChapterLengthPolicy(project.chapterLengthPolicy || 'guide'); setFormattingNotes(project.formattingNotes || '');
    setAuthorIntent(project.authorIntent || '');
    setGenreGuidanceMode(project.genreGuidanceMode || 'reference');
    setGenreGuidanceNotes(project.genreGuidanceNotes || '');
    fetch(`/api/characters?projectId=${project.id}`).then(response => response.ok ? response.json() : { characters: [] })
      .then(data => setCharacters(data.characters || [])).catch(() => setCharacters([]));
  }, [project]);

  const handleSave = async () => {
    if (!project?.id) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id, title, genre, description, narrativePerspective, defaultPovCharacterId, povNotes, writingStyleNotes, defaultChapterTarget, chapterLengthPolicy, formattingNotes, authorIntent, genreGuidanceMode, genreGuidanceNotes }),
      });
      if (res.ok) {
        onUpdate();
      }
    } catch (e) {
      console.error('Failed to update project:', e);
    }
    setIsSaving(false);
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        先にプロジェクトを選択してください
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Settings size={20} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">プロジェクト設定</h2>
      </div>

      {/* Project Info */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">プロジェクト名</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">ジャンル</label>
            <select
              value={genre}
              onChange={e => setGenre(e.target.value)}
              className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {GENRE_OPTIONS.map(([value, emoji]) => (
                <option key={value} value={value}>{emoji} {displayLabel(GENRE_LABELS, value)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">あらすじ</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              className="text-sm resize-none"
              placeholder="小説の概要を入力..."
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            <Save size={14} className="mr-1" />
            {isSaving ? '保存中...' : '設定を保存'}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border/50">
        <CardHeader><CardTitle className="text-sm font-medium">作者意図・ジャンル指針</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">作者意図</label>
            <Textarea value={authorIntent} onChange={e => setAuthorIntent(e.target.value)} rows={5} placeholder="描きたいこと、守りたい条件、読者に与えたい体験、最終的な到達点など" />
            <p className="mt-1 text-[11px] text-muted-foreground">作者意図は、今後のAI提案より優先される作品全体の方針です。</p>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">AIにジャンル特性を反映</label>
            <select value={genreGuidanceMode} onChange={e => setGenreGuidanceMode(e.target.value)} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm">
              {genreGuidanceMode && !GENRE_GUIDANCE_MODE_LABELS[genreGuidanceMode] && <option value={genreGuidanceMode}>{genreGuidanceMode}</option>}
              {Object.entries(GENRE_GUIDANCE_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">ジャンル指針メモ</label>
            <Textarea value={genreGuidanceNotes} onChange={e => setGenreGuidanceNotes(e.target.value)} rows={4} placeholder="例：ミステリーとしてフェアプレイは重視するが、各章末に必ず謎を置く必要はない" />
          </div>
          <Button size="sm" onClick={handleSave} disabled={isSaving}><Save size={14} className="mr-1" />{isSaving ? '保存中...' : '作者意図・ジャンル指針を保存'}</Button>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border/50">
        <CardHeader><CardTitle className="text-sm font-medium">小説生成設定</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><label className="block text-xs text-muted-foreground mb-1">基本視点</label>
            <select value={narrativePerspective} onChange={e => setNarrativePerspective(e.target.value)} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm">
              <option value="">未設定（文脈から判断）</option>
              {narrativePerspective && !NARRATIVE_PERSPECTIVE_LABELS[narrativePerspective] && <option value={narrativePerspective}>{narrativePerspective}</option>}
              {Object.entries(NARRATIVE_PERSPECTIVE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></div>
          <div><label className="block text-xs text-muted-foreground mb-1">基本視点人物</label>
            <select value={defaultPovCharacterId} onChange={e => setDefaultPovCharacterId(e.target.value)} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm">
              <option value="">未設定</option>{characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}
            </select></div>
          <div><label className="block text-xs text-muted-foreground mb-1">標準章目標文字数</label><Input type="number" min={1} value={defaultChapterTarget} onChange={e => setDefaultChapterTarget(e.target.value)} placeholder="未設定（共通デフォルトを使用）" /></div>
          <div><label className="block text-xs text-muted-foreground mb-1">文体メモ</label><Textarea value={writingStyleNotes} onChange={e => setWritingStyleNotes(e.target.value)} rows={3} placeholder="簡潔、会話中心、落ち着いた語り口など" /></div>
          <button type="button" onClick={() => setShowAdvanced(value => !value)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}詳細設定
          </button>
          {showAdvanced && <div className="space-y-4 border-l border-border pl-4">
            <div><label className="block text-xs text-muted-foreground mb-1">視点運用メモ</label><Textarea value={povNotes} onChange={e => setPovNotes(e.target.value)} rows={3} placeholder="視点変更の単位、視点距離、知識範囲など" /></div>
            <div><label className="block text-xs text-muted-foreground mb-1">文字数方針</label><select value={chapterLengthPolicy} onChange={e => setChapterLengthPolicy(e.target.value)} className="w-full h-9 px-3 bg-secondary border border-input rounded-md text-sm">{chapterLengthPolicy && !CHAPTER_LENGTH_POLICY_LABELS[chapterLengthPolicy] && <option value={chapterLengthPolicy}>{chapterLengthPolicy}</option>}{Object.entries(CHAPTER_LENGTH_POLICY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div><label className="block text-xs text-muted-foreground mb-1">表記・組版メモ</label><Textarea value={formattingNotes} onChange={e => setFormattingNotes(e.target.value)} rows={3} placeholder="会話括弧、字下げ、空行など。未設定時は日本語標準を使用" /></div>
          </div>}
          <Button size="sm" onClick={handleSave} disabled={isSaving}><Save size={14} className="mr-1" />{isSaving ? '保存中...' : '小説生成設定を保存'}</Button>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border/50">
        <CardHeader><CardTitle className="text-sm font-medium">叙述設定</CardTitle></CardHeader>
        <CardContent>
          <NarrativeSettings projectId={project.id} defaultNarratorId={project.defaultNarratorId} characters={characters} onProjectUpdate={onUpdate} />
        </CardContent>
      </Card>

      {/* Export */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium">書き出し</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            完成したすべての章を含むTXTファイルを書き出します。
          </p>
          <a
            href={`/api/export?projectId=${project.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-secondary rounded-lg text-sm text-foreground hover:bg-secondary/80 transition-colors"
          >
            <Download size={14} />
            TXTを書き出す
          </a>
        </CardContent>
      </Card>

      {/* About */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium">このアプリについて</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Info size={12} />
              <span>小説創作Agentプラットフォーム v1.0</span>
            </div>
            <p>6つの専門AI Agentが連携する小説創作プラットフォームです。</p>
            <p>技术栈：Next.js 16 + TypeScript + Prisma + Tailwind CSS + shadcn/ui</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
