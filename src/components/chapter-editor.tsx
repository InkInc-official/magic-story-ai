'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '@/lib/store';
import { BookOpen, Plus, Trash2, Save, Sparkles, ChevronRight, ChevronDown, Shield, Swords, Loader2, FileText, Zap, Eye, PanelRightClose, PanelRightOpen, ArrowUp, ArrowDown, X } from 'lucide-react';
import { AntiAIPanel } from '@/components/anti-ai-panel';
import { AdversarialReviewPanel } from '@/components/adversarial-review';
import { ChapterPreview } from '@/components/chapter-preview';
import { EMOTION_ARC_LABELS, EMOTION_LABELS, HOOK_LABELS } from '@/lib/i18n';
import {
  buildChapterGenerationContext,
  buildChapterSemanticContext,
  type ChapterGenerationSource,
} from '@/lib/prompts/ja';

interface Chapter {
  id: string;
  order: number;
  title: string;
  outlineContent: string;
  content: string;
  summary: string;
  wordCount: number;
  status: string;
  emotionTarget: string;
  emotionArc: string;
  hookStart: string;
  hookEnd: string;
  povCharacterId: string | null;
  purpose: string;
  targetWordCount: number | null;
  endingNotes: string;
}

interface ChapterEditorProps {
  projectId: string;
}

interface ChapterCastEntry {
  chapterId: string;
  characterId: string;
  participation: 'present' | 'mentioned';
  notes: string;
  order: number;
  character: ChapterGenerationSource['characters'][number];
}

const STATUS_OPTIONS = [
  { value: 'draft', label: '下書き', color: 'text-muted-foreground' },
  { value: 'writing', label: '執筆中', color: 'text-amber-400' },
  { value: 'review', label: 'レビュー中', color: 'text-blue-400' },
  { value: 'completed', label: '完成', color: 'text-emerald-400' },
];

const EMOTION_TARGETS = [
  { value: '', label: '未設定' },
  ...Object.entries(EMOTION_LABELS).map(([value, label]) => ({ value, label })),
];

const EMOTION_ARCS = [
  { value: '', label: '未設定' },
  ...Object.entries(EMOTION_ARC_LABELS).map(([value, label]) => ({ value, label })),
];

const HOOK_TYPES = [
  { value: '', label: '未設定' },
  ...Object.entries(HOOK_LABELS).map(([value, label]) => ({ value, label })),
];

export function ChapterEditor({ projectId }: ChapterEditorProps) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editOutline, setEditOutline] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editStatus, setEditStatus] = useState('draft');
  const [editSummary, setEditSummary] = useState('');
  const [editEmotionTarget, setEditEmotionTarget] = useState('');
  const [editEmotionArc, setEditEmotionArc] = useState('');
  const [editHookStart, setEditHookStart] = useState('');
  const [editHookEnd, setEditHookEnd] = useState('');
  const [editPovCharacterId, setEditPovCharacterId] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [editTargetWordCount, setEditTargetWordCount] = useState('');
  const [editEndingNotes, setEditEndingNotes] = useState('');
  const [projectCharacters, setProjectCharacters] = useState<ChapterGenerationSource['characters']>([]);
  const [chapterCast, setChapterCast] = useState<ChapterCastEntry[]>([]);
  const [castCharacterId, setCastCharacterId] = useState('');
  const [projectDefaultPovCharacterId, setProjectDefaultPovCharacterId] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showOutline, setShowOutline] = useState(true);
  const [showEmotion, setShowEmotion] = useState(false);
  const [sidePanel, setSidePanel] = useState<'none' | 'preview' | 'antiAi' | 'adversarial'>('preview');
  const [generatingPhase, setGeneratingPhase] = useState<'none' | 'summary' | 'full'>('none');
  const { setActiveAgent, setActiveChapterId } = useAppStore();
  const abortRef = useRef<AbortController | null>(null);

  const loadGenerationContext = async (): Promise<ChapterGenerationSource> => {
    const selectedChapter = chapters.find(chapter => chapter.id === selectedId);
    const previousChapter = selectedChapter
      ? [...chapters].filter(chapter => chapter.order < selectedChapter.order).sort((a, b) => b.order - a.order)[0]
      : undefined;
    const safeJson = async <T,>(url: string, fallback: T): Promise<T> => {
      try {
        const response = await fetch(url);
        return response.ok ? await response.json() as T : fallback;
      } catch {
        return fallback;
      }
    };

    const [projects, characterData, chapterCharacters, worldSettings, scenes, foreshadowings, storyStates, outlines, plots, storyNodes, storyEdges] = await Promise.all([
      safeJson<Array<NonNullable<ChapterGenerationSource['project']> & { id: string }>>('/api/projects', []),
      safeJson<{ characters: ChapterGenerationSource['characters']; relationships: ChapterGenerationSource['relationships'] }>(`/api/characters?projectId=${projectId}`, { characters: [], relationships: [] }),
      selectedId ? safeJson<NonNullable<ChapterGenerationSource['chapterCharacters']>>(`/api/chapter-characters?chapterId=${selectedId}`, []) : [],
      safeJson<ChapterGenerationSource['worldSettings']>(`/api/world-settings?projectId=${projectId}`, []),
      safeJson<ChapterGenerationSource['scenes']>(`/api/scenes?projectId=${projectId}`, []),
      safeJson<ChapterGenerationSource['foreshadowings']>(`/api/foreshadowings?projectId=${projectId}`, []),
      safeJson<ChapterGenerationSource['storyStates']>(`/api/story-states?projectId=${projectId}`, []),
      safeJson<Array<{ content: string }>>(`/api/outlines?projectId=${projectId}`, []),
      safeJson<ChapterGenerationSource['plots']>(`/api/plots?projectId=${projectId}`, []),
      safeJson<ChapterGenerationSource['storyNodes']>(`/api/story-nodes?projectId=${projectId}`, []),
      safeJson<ChapterGenerationSource['storyEdges']>(`/api/story-edges?projectId=${projectId}`, []),
    ]);

    return {
      chapterId: selectedId || '',
      chapterOrder: selectedChapter?.order ?? 0,
      title: editTitle,
      outline: editOutline,
      summary: editSummary,
      emotionTarget: editEmotionTarget,
      emotionArc: editEmotionArc,
      hookStart: editHookStart,
      hookEnd: editHookEnd,
      povCharacterId: editPovCharacterId || null,
      purpose: editPurpose,
      targetWordCount: editTargetWordCount ? Number(editTargetWordCount) : null,
      endingNotes: editEndingNotes,
      project: projects.find(project => project.id === projectId),
      previousChapter: previousChapter && {
        id: previousChapter.id,
        title: previousChapter.title,
        summary: previousChapter.summary,
        content: previousChapter.content,
      },
      latestOutline: outlines[0]?.content,
      characters: characterData.characters,
      relationships: characterData.relationships,
      chapterCharacters,
      worldSettings,
      scenes,
      foreshadowings,
      storyStates,
      plots,
      storyNodes,
      storyEdges,
    };
  };

  const fetchChapterCast = async (chapterId: string) => {
    try {
      const response = await fetch(`/api/chapter-characters?chapterId=${chapterId}`);
      setChapterCast(response.ok ? await response.json() : []);
    } catch { setChapterCast([]); }
  };

  const fetchChapters = useCallback(async () => {
    try {
      const [res, characterRes, projectRes] = await Promise.all([fetch(`/api/chapters?projectId=${projectId}`), fetch(`/api/characters?projectId=${projectId}`), fetch('/api/projects')]);
      if (res.ok) {
        const data = await res.json();
        setChapters(data);
      }
      if (characterRes.ok) setProjectCharacters((await characterRes.json()).characters || []);
      if (projectRes.ok) {
        const projects = await projectRes.json() as Array<{ id: string; defaultPovCharacterId?: string | null }>;
        setProjectDefaultPovCharacterId(projects.find(project => project.id === projectId)?.defaultPovCharacterId || '');
      }
    } catch (e) {
      console.error('Failed to fetch chapters:', e);
    }
  }, [projectId]);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  const selectChapter = (chapter: Chapter) => {
    setSelectedId(chapter.id);
    setActiveChapterId(chapter.id);
    setEditContent(chapter.content);
    setEditOutline(chapter.outlineContent);
    setEditTitle(chapter.title);
    setEditStatus(chapter.status);
    setEditSummary(chapter.summary);
    setEditEmotionTarget(chapter.emotionTarget || '');
    setEditEmotionArc(chapter.emotionArc || '');
    setEditHookStart(chapter.hookStart || '');
    setEditHookEnd(chapter.hookEnd || '');
    setEditPovCharacterId(chapter.povCharacterId || '');
    setEditPurpose(chapter.purpose || '');
    setEditTargetWordCount(chapter.targetWordCount?.toString() || '');
    setEditEndingNotes(chapter.endingNotes || '');
    setCastCharacterId('');
    void fetchChapterCast(chapter.id);
    // 打开章节时自动显示预览面板
    if (sidePanel === 'none') {
      setSidePanel('preview');
    }
  };

  const addCastMember = async (participation: 'present' | 'mentioned') => {
    if (!selectedId || !castCharacterId) return;
    const response = await fetch('/api/chapter-characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chapterId: selectedId, characterId: castCharacterId, participation }) });
    if (response.ok) { setCastCharacterId(''); await fetchChapterCast(selectedId); }
  };

  const updateCastMember = async (entry: ChapterCastEntry, changes: Partial<Pick<ChapterCastEntry, 'participation' | 'notes' | 'order'>>, refresh = true) => {
    const response = await fetch('/api/chapter-characters', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chapterId: entry.chapterId, characterId: entry.characterId, ...changes }) });
    if (response.ok && selectedId && refresh) await fetchChapterCast(selectedId);
  };

  const removeCastMember = async (entry: ChapterCastEntry) => {
    const response = await fetch(`/api/chapter-characters?chapterId=${entry.chapterId}&characterId=${entry.characterId}`, { method: 'DELETE' });
    if (response.ok && selectedId) await fetchChapterCast(selectedId);
  };

  const moveCastMember = async (entry: ChapterCastEntry, direction: -1 | 1) => {
    const group = chapterCast.filter(item => item.participation === entry.participation).sort((a, b) => a.order - b.order);
    const index = group.findIndex(item => item.characterId === entry.characterId);
    const other = group[index + direction];
    if (!other) return;
    await Promise.all([updateCastMember(entry, { order: other.order }, false), updateCastMember(other, { order: entry.order }, false)]);
    if (selectedId) await fetchChapterCast(selectedId);
  };

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, order: chapters.length, title: newTitle || `第${chapters.length + 1}章`, status: 'draft' }),
      });
      if (res.ok) {
        await fetchChapters();
        setIsCreating(false);
        setNewTitle('');
      }
    } catch (e) {
      console.error('Failed to create chapter:', e);
    }
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/chapters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedId,
          title: editTitle,
          outlineContent: editOutline,
          content: editContent,
          summary: editSummary,
          status: editStatus,
          emotionTarget: editEmotionTarget,
          emotionArc: editEmotionArc,
          hookStart: editHookStart,
          hookEnd: editHookEnd,
          povCharacterId: editPovCharacterId,
          purpose: editPurpose,
          targetWordCount: editTargetWordCount,
          endingNotes: editEndingNotes,
        }),
      });
      if (res.ok) {
        await fetchChapters();
      }
    } catch (e) {
      console.error('Failed to save chapter:', e);
    }
    setIsSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/chapters?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchChapters();
        if (selectedId === id) {
          setSelectedId(null);
          setActiveChapterId(null);
        }
      }
    } catch (e) {
      console.error('Failed to delete chapter:', e);
    }
  };

  // Two-phase generation: Phase 1 - Generate Summary
  const handleGenerateSummary = async () => {
    if (!selectedId || !editOutline.trim()) return;
    setGeneratingPhase('summary');
    abortRef.current = new AbortController();

    try {
      const generationSource = await loadGenerationContext();
      const semanticContext = buildChapterSemanticContext(generationSource);
      const selectedContext = buildChapterGenerationContext(generationSource);
      const prompt = `以下の詳細プロットを、本文生成に使える章要約へ整理してください。

【章タイトル】
${editTitle}

【詳細プロット】
${editOutline}

${semanticContext ? `【感情・章構成の指定】\n${semanticContext}\n\n` : ''}${selectedContext ? `${selectedContext}\n\n` : ''}【要約の役割】
- 本章の目的、中心となる出来事、人物の選択と変化、必要な会話要点を整理する。
- 視点人物が明示または文脈から特定できる場合は、その人物と知識範囲を示す。
- 前章から持ち越す情報、関連設定、伏線のうち、本章に必要なものだけを含める。
- 感情や章頭・章末の形式は上記指定の意味を踏まえるが、展開に合わない型を機械的に強制しない。
- 長さは内容を過不足なく本文化できる分量とし、固定文字数に合わせるための水増しをしない。

要約本文だけを日本語で出力してください。`;

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentType: 'writer',
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error('Failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                accumulated += parsed.content;
                setEditSummary(accumulated);
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') {
        console.error('Failed to generate summary:', e);
      }
    } finally {
      setGeneratingPhase('none');
      abortRef.current = null;
    }
  };

  // Two-phase generation: Phase 2 - Expand to Full Content
  const handleExpandFull = async () => {
    if (!selectedId || !editSummary.trim()) return;
    setGeneratingPhase('full');
    abortRef.current = new AbortController();

    try {
      const generationSource = await loadGenerationContext();
      const semanticContext = buildChapterSemanticContext(generationSource);
      const selectedContext = buildChapterGenerationContext(generationSource);
      const prompt = `以下の章要約と詳細プロットから、日本語小説の章本文を書いてください。

【章タイトル】
${editTitle}

【章要約】
${editSummary}

【詳細プロット】
${editOutline || '未設定。章要約と既存設定を優先する。'}

${semanticContext ? `【感情・章構成の指定】\n${semanticContext}\n\n` : ''}${selectedContext ? `${selectedContext}\n\n` : ''}【このタスクの指示】
- 章要約を中心に、詳細プロットと既存設定に矛盾しない本文へ展開する。
- 視点人物の知識範囲、人物の性格、関係性、呼称、話し方の手掛かりを守る。
- 前章の状態を自然に引き継ぎ、未回収伏線や時系列は本章に関連する場合だけ反映する。
- 説明、描写、心理、行動、台詞は場面の目的と速度に応じて選ぶ。五感描写や行動による心理表現を機械的に増やさない。
- 章末は指定があればその意味を踏まえ、指定がなければ引き、余韻、疑問、発見、転換、静かな終了などから章の役割に合う形を選ぶ。
- 上記の目標文字数と文字数方針を適用する。

前置きや解説を付けず、章本文だけを日本語で出力してください。`;

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentType: 'writer',
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error('Failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                accumulated += parsed.content;
                setEditContent(accumulated);
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name !== 'AbortError') {
        console.error('Failed to expand content:', e);
      }
    } finally {
      setGeneratingPhase('none');
      abortRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setGeneratingPhase('none');
  };

  const getStatusInfo = (status: string) => STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];

  const selectedChapter = chapters.find(c => c.id === selectedId);

  const totalWords = chapters.reduce((sum, c) => sum + c.wordCount, 0);
  const completedCount = chapters.filter(c => c.status === 'completed').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-emerald-400" />
          <h2 className="text-lg font-bold text-foreground">章の執筆</h2>
          <Badge variant="secondary" className="text-xs">{chapters.length} 章</Badge>
          <Badge variant="outline" className="text-xs">{totalWords.toLocaleString()} 字</Badge>
          <Badge variant="outline" className="text-xs text-emerald-400">{completedCount}/{chapters.length} 完成</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={sidePanel === 'preview' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSidePanel(sidePanel === 'preview' ? 'none' : 'preview')}
            className={sidePanel === 'preview' ? 'text-cyan-400 bg-cyan-400/10 hover:bg-cyan-400/20 border-cyan-400/30' : 'text-cyan-400 border-cyan-400/30 hover:bg-cyan-400/10'}
            title="リアルタイムプレビュー"
          >
            <Eye size={14} className="mr-1" />
            プレビュー
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveAgent('writer')}
            className="text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10"
          >
            <Sparkles size={14} className="mr-1" />
            AI執筆
          </Button>
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus size={14} className="mr-1" />
            章を追加
          </Button>
        </div>
      </div>

      {/* Create Form */}
      {isCreating && (
        <Card className="bg-card/50 border-primary/30">
          <CardContent className="p-4 flex items-center gap-3">
            <Input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="章タイトル..."
              className="text-sm flex-1"
              autoFocus
            />
            <Button size="sm" onClick={handleCreate}>
              <Plus size={14} className="mr-1" />作成
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsCreating(false)}>
              ✕
            </Button>
          </CardContent>
        </Card>
      )}

      <div className={`grid gap-4 ${sidePanel !== 'none' ? 'md:grid-cols-6' : 'md:grid-cols-4'}`} style={{ minHeight: '65vh' }}>
        {/* Chapter List */}
        <div className="md:col-span-1">
          <ScrollArea className="max-h-[65vh]">
            <div className="space-y-1">
              {chapters.map(chapter => {
                const statusInfo = getStatusInfo(chapter.status);
                const isSelected = selectedId === chapter.id;
                return (
                  <button
                    key={chapter.id}
                    onClick={() => selectChapter(chapter)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-primary/15 border border-primary/30'
                        : 'bg-card/50 border border-border/50 hover:border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">第{chapter.order + 1}章</span>
                      <div className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${chapter.status === 'completed' ? 'bg-emerald-400' : chapter.status === 'writing' ? 'bg-amber-400' : 'bg-muted-foreground/30'}`} />
                        <button onClick={e => { e.stopPropagation(); handleDelete(chapter.id); }} className="text-muted-foreground/30 hover:text-destructive ml-1">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-foreground truncate mt-0.5">{chapter.title || `第${chapter.order + 1}章`}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs text-muted-foreground">{chapter.wordCount} 字</span>
                      {chapter.emotionTarget && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{chapter.emotionTarget}</Badge>
                      )}
                    </div>
                  </button>
                );
              })}
              {chapters.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs">章がまだありません</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Chapter Editor */}
        <div className={sidePanel !== 'none' ? 'md:col-span-3' : 'md:col-span-3'}>
          {selectedChapter ? (
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <Input
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="text-sm font-medium border-0 bg-transparent p-0 h-auto focus-visible:ring-0"
                      placeholder="章タイトル"
                    />
                    <select
                      value={editStatus}
                      onChange={e => setEditStatus(e.target.value)}
                      className="h-7 px-2 bg-secondary border border-input rounded text-xs text-foreground focus:outline-none"
                    >
                      {STATUS_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    <Badge variant="outline" className="text-xs shrink-0">{editContent.length} 字</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSidePanel(sidePanel === 'preview' ? 'none' : 'preview')}
                      className={`text-cyan-400 hover:bg-cyan-400/10 ${sidePanel === 'preview' ? 'bg-cyan-400/10' : ''}`}
                      title="リアルタイムプレビュー"
                    >
                      <Eye size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSidePanel(sidePanel === 'antiAi' ? 'none' : 'antiAi')}
                      className={`text-rose-400 hover:bg-rose-400/10 ${sidePanel === 'antiAi' ? 'bg-rose-400/10' : ''}`}
                      title="AIらしさ分析"
                    >
                      <Shield size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSidePanel(sidePanel === 'adversarial' ? 'none' : 'adversarial')}
                      className={`text-purple-400 hover:bg-purple-400/10 ${sidePanel === 'adversarial' ? 'bg-purple-400/10' : ''}`}
                      title="多角的レビュー"
                    >
                      <Swords size={14} />
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={isSaving}>
                      <Save size={14} className="mr-1" />
                      {isSaving ? '...' : '保存'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Emotion Settings */}
                <div>
                  <button
                    onClick={() => setShowEmotion(!showEmotion)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
                  >
                    {showEmotion ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    感情設定
                    {editEmotionTarget && <Badge variant="outline" className="text-[9px] ml-1">{editEmotionTarget}</Badge>}
                    {editEmotionArc && <Badge variant="outline" className="text-[9px] ml-1">{editEmotionArc}</Badge>}
                  </button>
                  {showEmotion && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-2 bg-secondary/30 rounded-lg">
                      <div>
                        <label className="block text-[10px] text-muted-foreground mb-0.5">感情目標</label>
                        <select
                          value={editEmotionTarget}
                          onChange={e => setEditEmotionTarget(e.target.value)}
                          className="w-full h-7 px-2 bg-secondary border border-input rounded text-xs text-foreground focus:outline-none"
                        >
                          {EMOTION_TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted-foreground mb-0.5">感情曲線</label>
                        <select
                          value={editEmotionArc}
                          onChange={e => setEditEmotionArc(e.target.value)}
                          className="w-full h-7 px-2 bg-secondary border border-input rounded text-xs text-foreground focus:outline-none"
                        >
                          {EMOTION_ARCS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted-foreground mb-0.5">冒頭のフック</label>
                        <select
                          value={editHookStart}
                          onChange={e => setEditHookStart(e.target.value)}
                          className="w-full h-7 px-2 bg-secondary border border-input rounded text-xs text-foreground focus:outline-none"
                        >
                          {HOOK_TYPES.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-muted-foreground mb-0.5">末尾のフック</label>
                        <select
                          value={editHookEnd}
                          onChange={e => setEditHookEnd(e.target.value)}
                          className="w-full h-7 px-2 bg-secondary border border-input rounded text-xs text-foreground focus:outline-none"
                        >
                          {HOOK_TYPES.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-secondary/20 rounded-lg">
                  <div><label className="block text-[10px] text-muted-foreground mb-1">視点人物</label><select value={editPovCharacterId} onChange={e => setEditPovCharacterId(e.target.value)} className="w-full h-8 px-2 bg-secondary border border-input rounded text-xs"><option value="">プロジェクト設定／文脈を使用</option>{projectCharacters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select></div>
                  <div><label className="block text-[10px] text-muted-foreground mb-1">目標文字数</label><Input type="number" min={1} value={editTargetWordCount} onChange={e => setEditTargetWordCount(e.target.value)} className="h-8 text-xs" placeholder="プロジェクト設定を使用" /></div>
                  <div className="md:col-span-2"><label className="block text-[10px] text-muted-foreground mb-1">章の目的</label><Textarea value={editPurpose} onChange={e => setEditPurpose(e.target.value)} rows={2} className="text-xs resize-none" placeholder="この章で達成したいこと、中心となる変化" /></div>
                  <div className="md:col-span-2"><label className="block text-[10px] text-muted-foreground mb-1">章末メモ</label><Textarea value={editEndingNotes} onChange={e => setEditEndingNotes(e.target.value)} rows={2} className="text-xs resize-none" placeholder="余韻、発見、静かな終了など。未設定時は章末フックまたは内容から判断" /></div>
                </div>

                <div className="rounded-lg border border-border/60 bg-secondary/10 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-xs font-medium text-foreground">章の登場人物</p><p className="text-[10px] text-muted-foreground">POVは上の視点人物設定を使用し、ここには二重保存しません。</p></div>
                    <div className="flex items-center gap-1">
                      <select value={castCharacterId} onChange={e => setCastCharacterId(e.target.value)} className="h-8 max-w-44 px-2 bg-secondary border border-input rounded text-xs"><option value="">人物を選択</option>{projectCharacters.filter(character => !chapterCast.some(entry => entry.characterId === character.id)).map(character => <option key={character.id} value={character.id}>{character.name}</option>)}</select>
                      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => addCastMember('present')} disabled={!castCharacterId}><Plus size={12} className="mr-1" />登場</Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => addCastMember('mentioned')} disabled={!castCharacterId}>言及</Button>
                    </div>
                  </div>
                  {chapterCast.length === 0 && <p className="text-xs text-muted-foreground rounded bg-secondary/40 px-3 py-2">登場人物は章タイトル・詳細プロット・要約から自動判定されます。</p>}
                  {(['present', 'mentioned'] as const).map(participation => {
                    const entries = chapterCast.filter(entry => entry.participation === participation).sort((a, b) => a.order - b.order);
                    if (entries.length === 0) return null;
                    return <div key={participation} className="space-y-1.5">
                      <p className="text-[10px] font-medium text-muted-foreground">{participation === 'present' ? '登場人物' : '言及のみ'}</p>
                      {entries.map((entry, index) => {
                        const resolvedPovId = editPovCharacterId || projectDefaultPovCharacterId;
                        return <div key={entry.characterId} className="grid grid-cols-[minmax(90px,auto)_110px_1fr_auto] items-center gap-2 rounded bg-secondary/40 px-2 py-1.5">
                          <div className="flex items-center gap-1 text-xs font-medium"><span>{entry.character.name}</span>{entry.characterId === resolvedPovId && <Badge variant="outline" className="text-[9px] px-1 py-0">POV</Badge>}</div>
                          <select value={entry.participation} onChange={e => updateCastMember(entry, { participation: e.target.value as 'present' | 'mentioned' })} className="h-7 px-2 bg-secondary border border-input rounded text-[11px]"><option value="present">登場人物</option><option value="mentioned">言及のみ</option></select>
                          <Input value={entry.notes} onChange={e => setChapterCast(current => current.map(item => item.characterId === entry.characterId ? { ...item, notes: e.target.value } : item))} onBlur={() => updateCastMember(entry, { notes: chapterCast.find(item => item.characterId === entry.characterId)?.notes || '' })} placeholder="補足（途中から登場、電話越しなど）" className="h-7 text-[11px]" />
                          <div className="flex"><button type="button" onClick={() => moveCastMember(entry, -1)} disabled={index === 0} className="p-1 text-muted-foreground disabled:opacity-20"><ArrowUp size={12} /></button><button type="button" onClick={() => moveCastMember(entry, 1)} disabled={index === entries.length - 1} className="p-1 text-muted-foreground disabled:opacity-20"><ArrowDown size={12} /></button><button type="button" onClick={() => removeCastMember(entry)} className="p-1 text-muted-foreground hover:text-destructive"><X size={12} /></button></div>
                        </div>;
                      })}
                    </div>;
                  })}
                </div>

                {/* Chapter Outline */}
                <div>
                  <button
                    onClick={() => setShowOutline(!showOutline)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
                  >
                    {showOutline ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    章の詳細プロット
                  </button>
                  {showOutline && (
                    <Textarea
                      value={editOutline}
                      onChange={e => setEditOutline(e.target.value)}
                      placeholder="この章の詳細プロット／要点..."
                      rows={3}
                      className="text-sm resize-none bg-secondary/30"
                    />
                  )}
                </div>

                {/* Two-Phase Generation Controls */}
                <div className="flex items-center gap-2 p-2 bg-secondary/20 rounded-lg">
                  <div className="flex items-center gap-2 flex-1">
                    {/* Phase 1: Generate Summary */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generatingPhase === 'none' ? handleGenerateSummary : handleStopGeneration}
                      disabled={generatingPhase === 'full'}
                      className="text-amber-400 border-amber-400/30 hover:bg-amber-400/10 text-xs"
                    >
                      {generatingPhase === 'summary' ? (
                        <><Loader2 size={12} className="mr-1 animate-spin" />生成中...</>
                      ) : (
                        <><FileText size={12} className="mr-1" />AIで要約を生成</>
                      )}
                    </Button>

                    <div className="flex items-center">
                      <div className={`w-6 h-0.5 ${editSummary ? 'bg-emerald-400' : 'bg-border'}`} />
                      <ChevronRight size={12} className={editSummary ? 'text-emerald-400' : 'text-border'} />
                    </div>

                    {/* Phase 2: Expand to Full */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={generatingPhase === 'none' ? handleExpandFull : handleStopGeneration}
                      disabled={generatingPhase === 'summary' || !editSummary.trim()}
                      className="text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10 text-xs"
                    >
                      {generatingPhase === 'full' ? (
                        <><Loader2 size={12} className="mr-1 animate-spin" />展開中...</>
                      ) : (
                        <><Zap size={12} className="mr-1" />本文へ展開</>
                      )}
                    </Button>
                  </div>

                  {/* Progress indicator */}
                  {generatingPhase !== 'none' && (
                    <Badge variant="outline" className="text-xs text-primary">
                      {generatingPhase === 'summary' ? 'Phase 1/2：要約を生成' : 'Phase 2/2：本文へ展開'}
                    </Badge>
                  )}
                </div>

                {/* Summary Preview */}
                {editSummary && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">📝 章の要約</span>
                      <Badge variant="outline" className="text-[9px]">{editSummary.length}字</Badge>
                    </div>
                    <Textarea
                      value={editSummary}
                      onChange={e => setEditSummary(e.target.value)}
                      placeholder="章の要約..."
                      rows={3}
                      className="text-sm resize-none bg-amber-400/5 border-amber-400/20"
                    />
                  </div>
                )}

                {/* Chapter Content */}
                <Textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  placeholder="この章の本文を書き始めましょう..."
                  rows={18}
                  className="text-sm leading-relaxed resize-none min-h-[350px]"
                />
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <BookOpen size={40} className="mb-3 opacity-30" />
              <p className="text-sm">左側から章を選択して編集を始めます</p>
              <p className="text-xs mt-1">または新しい章を作成してください</p>
            </div>
          )}
        </div>

        {/* Side Panel (Preview / Anti-AI / Adversarial Review) — 始终渲染 */}
        {sidePanel !== 'none' && (
          <div className="md:col-span-2 min-h-0">
            <Card className="bg-card/50 border-border/50 h-full flex flex-col overflow-hidden" style={{ minHeight: '65vh' }}>
              {sidePanel === 'preview' && (
                <ChapterPreview
                  title={editTitle}
                  content={editContent}
                  summary={editSummary}
                  emotionTarget={editEmotionTarget}
                  emotionArc={editEmotionArc}
                  wordCount={editContent.length}
                  hasChapter={!!selectedChapter}
                />
              )}
              {sidePanel === 'antiAi' && selectedChapter && (
                <AntiAIPanel
                  content={editContent}
                  onApplyFix={(fixedContent) => {
                    setEditContent(fixedContent);
                  }}
                />
              )}
              {sidePanel === 'antiAi' && !selectedChapter && (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-6">
                  <Shield size={28} className="mb-3 opacity-30" />
                  <p className="text-sm">章を選択するとAIらしさを分析できます</p>
                </div>
              )}
              {sidePanel === 'adversarial' && selectedChapter && (
                <AdversarialReviewPanel
                  content={editContent}
                  chapterTitle={editTitle}
                  projectId={projectId}
                  chapterPurpose={editPurpose || editOutline}
                  povCharacterId={editPovCharacterId}
                  endingNotes={editEndingNotes}
                  chapterId={selectedId || undefined}
                />
              )}
              {sidePanel === 'adversarial' && !selectedChapter && (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-6">
                  <Swords size={28} className="mb-3 opacity-30" />
                  <p className="text-sm">章を選択すると多角的レビューを実行できます</p>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
