'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Settings, Save, Download, Info } from 'lucide-react';
import { displayLabel, GENRE_LABELS } from '@/lib/i18n';

const GENRE_OPTIONS = [
  ['玄幻系统修仙', '⚔️'], ['都市重生', '🔄'], ['脑洞网文', '💡'],
  ['都市修仙', '🏙️'], ['都市高武', '👊'], ['末日系统', '🧟'],
  ['霸总', '👑'], ['后悔流', '😢'], ['无敌文', '💪'],
  ['历史架空', '📜'], ['东方玄幻', '🐉'], ['策略经营', '🏰'],
] as const;

interface Project {
  id: string;
  title: string;
  genre: string;
  description: string;
}

interface SettingsPanelProps {
  project?: Project;
  onUpdate: () => void;
}

export function SettingsPanel({ project, onUpdate }: SettingsPanelProps) {
  const [title, setTitle] = useState(project?.title || '');
  const [genre, setGenre] = useState(project?.genre || '');
  const [description, setDescription] = useState(project?.description || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!project?.id) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id, title, genre, description }),
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
