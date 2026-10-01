'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { AGENTS } from '@/lib/agents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookOpen, Users, Globe, ListTree, PenTool, Trash2 } from 'lucide-react';
import { AGENT_DESCRIPTION_LABELS, AGENT_LABELS, APP_LOCALE, displayLabel, GENRE_LABELS } from '@/lib/i18n';

interface Project {
  id: string;
  title: string;
  genre: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    chapters: number;
    characters: number;
    worldSettings: number;
  };
}

interface DashboardProps {
  project?: Project;
  onDeleteProject: (id: string) => void;
}

export function Dashboard({ project, onDeleteProject }: DashboardProps) {
  const { setCurrentView, setActiveAgent } = useAppStore();
  const [stats, setStats] = useState({
    totalWords: 0,
    chapterCount: 0,
    characterCount: 0,
    worldSettingCount: 0,
    completedChapters: 0,
    draftChapters: 0,
  });
  const [recentLogs, setRecentLogs] = useState<{ agentType: string; action: string; createdAt: string }[]>([]);

  useEffect(() => {
    if (!project?.id) return;
    const fetchStats = async () => {
      try {
        const [chaptersRes, charsRes, worldRes, logsRes] = await Promise.all([
          fetch(`/api/chapters?projectId=${project.id}`),
          fetch(`/api/characters?projectId=${project.id}`),
          fetch(`/api/world-settings?projectId=${project.id}`),
          fetch(`/api/agent-logs?projectId=${project.id}`),
        ]);

        const chapters = chaptersRes.ok ? await chaptersRes.json() : [];
        const charsData = charsRes.ok ? await charsRes.json() : { characters: [] };
        const worldSettings = worldRes.ok ? await worldRes.json() : [];
        const logs = logsRes.ok ? await logsRes.json() : [];

        const totalWords = chapters.reduce((sum: number, c: { wordCount: number }) => sum + c.wordCount, 0);
        const completed = chapters.filter((c: { status: string }) => c.status === 'completed').length;
        const draft = chapters.filter((c: { status: string }) => c.status === 'draft').length;

        setStats({
          totalWords,
          chapterCount: chapters.length,
          characterCount: charsData.characters?.length || 0,
          worldSettingCount: worldSettings.length,
          completedChapters: completed,
          draftChapters: draft,
        });

        setRecentLogs(logs.slice(0, 5));
      } catch (e) {
        console.error('Failed to fetch stats:', e);
      }
    };

    fetchStats();
  }, [project?.id]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        プロジェクトを選択するか、新しく作成してください
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BookOpen size={24} className="text-primary" />
            {project.title}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {project.description || 'あらすじはまだありません'}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-xs">{displayLabel(GENRE_LABELS, project.genre)}</Badge>
            <span className="text-xs text-muted-foreground">
              作成日: {new Date(project.createdAt).toLocaleDateString(APP_LOCALE)}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDeleteProject(project.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 size={14} />
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-400/10 flex items-center justify-center">
                <PenTool size={18} className="text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.totalWords.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">総文字数</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-400/10 flex items-center justify-center">
                <BookOpen size={18} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.chapterCount}</p>
                <p className="text-xs text-muted-foreground">章数</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-400/10 flex items-center justify-center">
                <Users size={18} className="text-rose-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.characterCount}</p>
                <p className="text-xs text-muted-foreground">登場人物</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-400/10 flex items-center justify-center">
                <Globe size={18} className="text-teal-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.worldSettingCount}</p>
                <p className="text-xs text-muted-foreground">世界設定</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions & Agent Panel */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Quick Actions */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-foreground">クイック操作</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <button
              onClick={() => { setCurrentView('world'); setActiveAgent('worldbuilder'); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
            >
              <span className="text-lg">🌍</span>
              <div>
                <p className="text-sm font-medium text-foreground">世界観を作る</p>
                <p className="text-xs text-muted-foreground">世界観Agentと舞台設定を組み立てます</p>
              </div>
            </button>
            <button
              onClick={() => { setCurrentView('characters'); setActiveAgent('character'); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
            >
              <span className="text-lg">👤</span>
              <div>
                <p className="text-sm font-medium text-foreground">キャラクターを作る</p>
                <p className="text-xs text-muted-foreground">キャラクターAgentと人物像を作ります</p>
              </div>
            </button>
            <button
              onClick={() => { setCurrentView('outline'); setActiveAgent('planner'); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
            >
              <span className="text-lg">🎯</span>
              <div>
                <p className="text-sm font-medium text-foreground">プロットを作る</p>
                <p className="text-xs text-muted-foreground">企画Agentと物語の構成を考えます</p>
              </div>
            </button>
            <button
              onClick={() => { setCurrentView('chapters'); setActiveAgent('writer'); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
            >
              <span className="text-lg">✍️</span>
              <div>
                <p className="text-sm font-medium text-foreground">執筆を始める</p>
                <p className="text-xs text-muted-foreground">執筆Agentと章を書き進めます</p>
              </div>
            </button>
          </CardContent>
        </Card>

        {/* Agent Status */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-foreground">Agentの状態</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {AGENTS.map(agent => (
              <button
                key={agent.id}
                onClick={() => setActiveAgent(agent.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${agent.bgColor} hover:opacity-80`}
              >
                <span className="text-base">{agent.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${agent.color}`}>{displayLabel(AGENT_LABELS, agent.id)}</p>
                  <p className="text-xs text-muted-foreground truncate">{displayLabel(AGENT_DESCRIPTION_LABELS, agent.id)}</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      {recentLogs.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-foreground">最近のアクティビティ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentLogs.map((log, i) => {
                const agent = AGENTS.find(a => a.id === log.agentType);
                return (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span>{agent?.emoji || '🤖'}</span>
                    <span className="text-foreground">{log.action}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(log.createdAt).toLocaleTimeString(APP_LOCALE, { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
