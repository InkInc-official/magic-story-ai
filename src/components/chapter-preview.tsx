'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Eye, Type, AlignLeft, Minus, Plus, BookOpen, MousePointerClick } from 'lucide-react';
import { useState } from 'react';
import { displayLabel, EMOTION_ARC_LABELS, EMOTION_LABELS } from '@/lib/i18n';

interface ChapterPreviewProps {
  title: string;
  content: string;
  summary?: string;
  emotionTarget?: string;
  emotionArc?: string;
  wordCount: number;
  hasChapter?: boolean;
}

/** 将纯文本转为带段落/对话高亮的 HTML */
function renderContentToHTML(raw: string): string {
  if (!raw.trim()) return '';

  const paragraphs = raw.split(/\n+/).filter(p => p.trim());

  return paragraphs.map(p => {
    const trimmed = p.trim();
    // 对话行（以中文引号开头）
    if (/^[「""《]/.test(trimmed)) {
      return `<p class="chapter-dialogue">${escapeHTML(trimmed)}</p>`;
    }
    // 心理描写（以括号包裹）
    if (/^[（(]/.test(trimmed)) {
      return `<p class="chapter-inner-thought">${escapeHTML(trimmed)}</p>`;
    }
    // 短段落（可能是场景切换标记）
    if (trimmed.length <= 8 && /[*~\-—=]/.test(trimmed)) {
      return `<p class="chapter-divider">${escapeHTML(trimmed)}</p>`;
    }
    return `<p class="chapter-paragraph">${escapeHTML(trimmed)}</p>`;
  }).join('');
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const FONT_SIZES = [
  { label: '小', value: 'text-sm', line: 'leading-relaxed' },
  { label: '中', value: 'text-base', line: 'leading-relaxed' },
  { label: '大', value: 'text-lg', line: 'leading-loose' },
];

const EMOTION_COLORS: Record<string, string> = {
  '爽快': 'text-amber-400 bg-amber-400/10',
  '感动': 'text-blue-400 bg-blue-400/10',
  '紧张': 'text-red-400 bg-red-400/10',
  '期待': 'text-emerald-400 bg-emerald-400/10',
  '愤怒': 'text-red-500 bg-red-500/10',
  '悲伤': 'text-indigo-400 bg-indigo-400/10',
  '惊喜': 'text-yellow-400 bg-yellow-400/10',
  '恐惧': 'text-purple-400 bg-purple-400/10',
  '温暖': 'text-orange-400 bg-orange-400/10',
  '震撼': 'text-rose-400 bg-rose-400/10',
};

export function ChapterPreview({
  title,
  content,
  summary,
  emotionTarget,
  emotionArc,
  wordCount,
  hasChapter = true,
}: ChapterPreviewProps) {
  const [fontLevel, setFontLevel] = useState(1); // 0=小, 1=中, 2=大
  const [showMeta, setShowMeta] = useState(true);

  const contentHTML = useMemo(() => renderContentToHTML(content), [content]);
  const font = FONT_SIZES[fontLevel];

  const emotionStyle = emotionTarget ? EMOTION_COLORS[emotionTarget] || 'text-primary bg-primary/10' : '';

  // 没有选中任何章节
  if (!hasChapter) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-card/30 shrink-0">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-cyan-400" />
            <span className="text-xs font-medium text-foreground">リアルタイムプレビュー</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-6">
          <div className="w-16 h-16 rounded-2xl bg-cyan-400/10 flex items-center justify-center mb-4">
            <MousePointerClick size={28} className="text-cyan-400/60" />
          </div>
          <p className="text-sm font-medium text-foreground/70 mb-1">章を選択してプレビュー</p>
          <p className="text-xs text-muted-foreground/60 text-center leading-relaxed">
            左側の章一覧から章を選ぶと、<br />
            ここでレイアウトを確認できます
          </p>
          <div className="mt-6 space-y-2 w-full max-w-[200px]">
            <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
              <div className="w-5 h-5 rounded bg-cyan-400/10 flex items-center justify-center shrink-0">
                <span className="text-[10px] text-cyan-400">1</span>
              </div>
              <span>左側の章一覧を選択</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
              <div className="w-5 h-5 rounded bg-cyan-400/10 flex items-center justify-center shrink-0">
                <span className="text-[10px] text-cyan-400">2</span>
              </div>
              <span>中央の編集欄で執筆</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
              <div className="w-5 h-5 rounded bg-cyan-400/10 flex items-center justify-center shrink-0">
                <span className="text-[10px] text-cyan-400">3</span>
              </div>
              <span>右側でレイアウトを確認</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-card/30 shrink-0">
        <div className="flex items-center gap-2">
          <Eye size={14} className="text-cyan-400" />
          <span className="text-xs font-medium text-foreground">リアルタイムプレビュー</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFontLevel(Math.max(0, fontLevel - 1))}
            disabled={fontLevel === 0}
            className="h-6 w-6 p-0"
            title="文字を小さくする"
          >
            <Minus size={12} />
          </Button>
          <span className="text-[10px] text-muted-foreground w-6 text-center">{FONT_SIZES[fontLevel].label}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFontLevel(Math.min(2, fontLevel + 1))}
            disabled={fontLevel === 2}
            className="h-6 w-6 p-0"
            title="文字を大きくする"
          >
            <Plus size={12} />
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMeta(!showMeta)}
            className={`h-6 px-2 text-[10px] ${showMeta ? 'text-cyan-400' : 'text-muted-foreground'}`}
            title="メタ情報を表示／非表示"
          >
            <Type size={10} className="mr-1" />
            メタ情報
          </Button>
        </div>
      </div>

      {/* Preview Content */}
      <ScrollArea className="flex-1">
        <div className="px-6 py-5 max-w-none">
          {/* Chapter Title */}
          <h1 className="text-xl font-bold text-foreground mb-4 pb-3 border-b border-border/30">
            {title || '無題の章'}
          </h1>

          {/* Meta Info */}
          {showMeta && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Badge variant="outline" className="text-[10px]">
                <BookOpen size={10} className="mr-1" />
                {wordCount} 字
              </Badge>
              {emotionTarget && (
                <Badge variant="outline" className={`text-[10px] ${emotionStyle}`}>
                  {displayLabel(EMOTION_LABELS, emotionTarget)}
                </Badge>
              )}
              {emotionArc && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  {displayLabel(EMOTION_ARC_LABELS, emotionArc)}
                </Badge>
              )}
            </div>
          )}

          {/* Summary (if exists) */}
          {summary && showMeta && (
            <div className="mb-5 p-3 bg-amber-400/5 border border-amber-400/15 rounded-lg">
              <div className="text-[10px] text-amber-400/80 font-medium mb-1">章の概要</div>
              <p className="text-xs text-foreground/70 leading-relaxed">{summary}</p>
            </div>
          )}

          {/* Chapter Body */}
          {content.trim() ? (
            <div
              className={`chapter-preview-body ${font.value} ${font.line}`}
              dangerouslySetInnerHTML={{ __html: contentHTML }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <div className="w-12 h-12 rounded-xl bg-emerald-400/10 flex items-center justify-center mb-3">
                <AlignLeft size={22} className="text-emerald-400/50" />
              </div>
              <p className="text-sm font-medium text-foreground/60 mb-1">執筆を始めましょう</p>
              <p className="text-xs text-muted-foreground/50 text-center leading-relaxed">
                左側の編集欄に本文を入力すると、<br />
                ここにレイアウトが表示されます
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline" className="text-[10px] text-cyan-400/60 border-cyan-400/20">
                  会話文を強調
                </Badge>
                <Badge variant="outline" className="text-[10px] text-amber-400/60 border-amber-400/20">
                  段落の字下げ
                </Badge>
                <Badge variant="outline" className="text-[10px] text-purple-400/60 border-purple-400/20">
                  心情描写
                </Badge>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Bottom Bar */}
      <div className="px-3 py-1.5 border-t border-border/50 bg-card/30 shrink-0">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{content.length} 文字</span>
          <span>段落：{content.split(/\n+/).filter(p => p.trim()).length}</span>
        </div>
      </div>
    </div>
  );
}
