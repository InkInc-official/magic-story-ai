'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { ListTree, Sparkles, Save, RotateCcw, History, ChevronRight, ChevronDown, Heart } from 'lucide-react';
import { EMOTION_LABELS } from '@/lib/i18n';

interface Outline {
  id: string;
  content: string;
  version: number;
}

interface OutlineEditorProps {
  projectId: string;
}

const EMOTION_TARGETS = [
  { value: '', label: '未設定' },
  ...Object.entries(EMOTION_LABELS).map(([value, label]) => ({ value, label })),
];

export function OutlineEditor({ projectId }: OutlineEditorProps) {
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [currentOutline, setCurrentOutline] = useState<Outline | null>(null);
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showEmotionGuide, setShowEmotionGuide] = useState(false);
  const [emotionGuideContent, setEmotionGuideContent] = useState('');
  const { setActiveAgent } = useAppStore();

  const fetchOutlines = useCallback(async () => {
    try {
      const res = await fetch(`/api/outlines?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setOutlines(data);
        if (data.length > 0) {
          setCurrentOutline(data[0]);
          setContent(data[0].content);
        } else {
          setCurrentOutline(null);
          setContent('');
        }
      }
    } catch (e) {
      console.error('Failed to fetch outlines:', e);
    }
  }, [projectId]);

  useEffect(() => {
    fetchOutlines();
  }, [fetchOutlines]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (currentOutline) {
        const res = await fetch('/api/outlines', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentOutline.id, content }),
        });
        if (res.ok) {
          await fetchOutlines();
        }
      } else {
        const res = await fetch('/api/outlines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, content }),
        });
        if (res.ok) {
          await fetchOutlines();
        }
      }
    } catch (e) {
      console.error('Failed to save outline:', e);
    }
    setIsSaving(false);
  };

  const handleNewVersion = async () => {
    try {
      const res = await fetch('/api/outlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, content }),
      });
      if (res.ok) {
        await fetchOutlines();
      }
    } catch (e) {
      console.error('Failed to create new version:', e);
    }
  };

  const handleSelectVersion = (outline: Outline) => {
    setCurrentOutline(outline);
    setContent(outline.content);
    setShowHistory(false);
  };

  const wordCount = content.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTree size={20} className="text-amber-400" />
          <h2 className="text-lg font-bold text-foreground">プロット設計</h2>
          {currentOutline && (
            <Badge variant="secondary" className="text-xs">v{currentOutline.version}</Badge>
          )}
          <Badge variant="outline" className="text-xs">{wordCount} 字</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveAgent('planner')}
            className="text-amber-400 border-amber-400/30 hover:bg-amber-400/10"
          >
            <Sparkles size={14} className="mr-1" />
            AIで設計
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
            <History size={14} className="mr-1" />
            バージョン履歴
          </Button>
          <Button variant="outline" size="sm" onClick={handleNewVersion}>
            <RotateCcw size={14} className="mr-1" />
            新しいバージョン
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            <Save size={14} className="mr-1" />
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* Version History */}
      {showHistory && outlines.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-3">
            <div className="space-y-1">
              {outlines.map(o => (
                <button
                  key={o.id}
                  onClick={() => handleSelectVersion(o)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                    currentOutline?.id === o.id
                      ? 'bg-primary/15 text-primary'
                      : 'hover:bg-secondary text-foreground/70'
                  }`}
                >
                  <span>バージョン v{o.version}</span>
                  <span className="text-xs text-muted-foreground">{o.content.length} 字</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Emotion Planning Guide */}
      <div>
        <button
          onClick={() => setShowEmotionGuide(!showEmotionGuide)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          {showEmotionGuide ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Heart size={16} className="text-rose-400" />
          感情設計ガイド
        </button>
        {showEmotionGuide && (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                各章の感情目標をプロットに記載すると、AI生成時に参照されます。各章に次の情報を付けることをおすすめします：
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-medium text-foreground shrink-0">感情目標：</span>
                  <div className="flex flex-wrap gap-1">
                    {EMOTION_TARGETS.filter(e => e.value).map(e => (
                      <Badge key={e.value} variant="outline" className="text-[10px]">{e.label}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-medium text-foreground shrink-0">感情曲線：</span>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">📉 V字型</Badge>
                    <Badge variant="outline" className="text-[10px]">📈 逆V字型</Badge>
                    <Badge variant="outline" className="text-[10px]">📊 W字型</Badge>
                    <Badge variant="outline" className="text-[10px]">📈 段階的上昇</Badge>
                    <Badge variant="outline" className="text-[10px]">⏳ 遅延満足</Badge>
                    <Badge variant="outline" className="text-[10px]">⚡ 急変</Badge>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-medium text-foreground shrink-0">章のフック：</span>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">❓ 謎・引き</Badge>
                    <Badge variant="outline" className="text-[10px]">🔄 どんでん返し</Badge>
                    <Badge variant="outline" className="text-[10px]">⚔️ 対立</Badge>
                    <Badge variant="outline" className="text-[10px]">💡 真相開示</Badge>
                    <Badge variant="outline" className="text-[10px]">🚨 危機</Badge>
                    <Badge variant="outline" className="text-[10px]">🤝 約束</Badge>
                  </div>
                </div>
              </div>
              <div className="p-2 bg-secondary/30 rounded-lg">
                <p className="text-[10px] text-muted-foreground font-mono">
                  推奨形式の例：<br/>
                  第一章 [爽快|V型|悬念→危机]<br/>
                  第二章 [紧张|W型|冲突→反转]<br/>
                  第三章 [感动|倒V型|承诺→揭秘]
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Outline Editor */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={`在此编写你的小说大纲...\n\n建议格式（含情感标注）：\n一、故事主题\n二、核心冲突\n三、主要角色\n四、剧情主线\n  第一章 [爽快|V型|悬念→危机] 起始\n  第二章 [紧张|W型|冲突→反转] 发展\n  第三章 [感动|倒V型|承诺→揭秘] 高潮\n  第四章 [震撼|递进|揭秘→承诺] 结局\n五、伏笔与呼应`}
            rows={20}
            className="text-sm leading-relaxed resize-none min-h-[400px] font-mono"
          />
        </CardContent>
      </Card>

      {/* Tips */}
      <Card className="bg-secondary/30 border-border/30">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">
            💡 ヒント：企画Agentにプロットの下書きを作ってもらい、ここで編集できます。内容は変数 ${'{outline}'} として執筆Agentへ渡されます。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
