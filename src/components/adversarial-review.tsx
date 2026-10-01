'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Swords, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { buildCharacterVoiceContext, formatSemanticLabel, type GenerationChapterCharacter, type GenerationCharacter, type GenerationRelationship } from '@/lib/prompts/ja';
import { displayLabel, NARRATIVE_PERSPECTIVE_LABELS } from '@/lib/i18n';

interface ReviewResult {
  perspective: string;
  emoji: string;
  color: string;
  content: string;
  severity: { level: string; count: number }[];
}

interface AdversarialReviewProps {
  content: string;
  chapterTitle: string;
  projectId?: string;
  chapterPurpose?: string;
  povCharacterId?: string;
  endingNotes?: string;
  chapterId?: string;
}

const REVIEW_PERSPECTIVES = [
  { id: 'structure', label: '構成レビュー', emoji: '🏗️', color: 'text-amber-400', systemPrompt: `構成と因果を中心に評価してください。出来事と人物の選択のつながり、章内の焦点と変化、場面転換、情報開示を確認します。緊張の強弱や章末フックを一律に要求せず、この章の目的と作品の文体に合っているかを基準にしてください。` },
  { id: 'character', label: '人物レビュー', emoji: '👤', color: 'text-rose-400', systemPrompt: `人物を中心に評価してください。設定された動機と行動の整合性、人物ごとの会話、呼称、敬語、関係性、感情の変化を確認します。静かな人物や変化しない人物を、それだけで欠点としないでください。` },
  { id: 'narrative', label: '語り口レビュー', emoji: '✍️', color: 'text-blue-400', systemPrompt: `語り口を中心に評価してください。視点と知識範囲、自然な日本語、段落、文章の速度、説明・描写・要約・台詞の選択を確認します。Show, don't tell、五感描写、短文中心を絶対基準にせず、採用された文体と場面の効果から判断してください。` },
  { id: 'consistency', label: '整合性チェック', emoji: '🔍', color: 'text-emerald-400', systemPrompt: `事実の整合性を中心に評価してください。本文内の矛盾、既出情報、伏線、世界の規則、時間順序を確認します。提供されていない設定を推測で事実とせず、本文だけでは判断できない点は「確認が必要」と区別してください。` },
];

const REVIEW_OUTPUT_RULES = `問題には次の重大度を付けてください。
- S1（致命的）：章の成立や事実関係を根本から損なう問題
- S2（重大）：読解や作品目的への適合を明確に損なう問題
- S3（改善）：修正すると効果が高まる問題
- S4（提案）：作者が選択できる任意の案

各指摘には、可能な限り本文中の根拠、読者または作品への影響、具体的な改善案を付けてください。商業性や完読欲は作品目的に含まれる場合だけ評価してください。長所も根拠とともに示してください。`;

export function AdversarialReviewPanel({ content, chapterTitle, projectId, chapterPurpose, povCharacterId, endingNotes, chapterId }: AdversarialReviewProps) {
  const [results, setResults] = useState<ReviewResult[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [activeReview, setActiveReview] = useState('structure');
  const abortRef = useRef<AbortController | null>(null);

  const handleReview = async () => {
    if (!content.trim()) return;
    setIsReviewing(true);
    setResults([]);
    abortRef.current = new AbortController();

    let projectContext = '';
    if (projectId) {
      try {
        const [response, characterResponse, castResponse] = await Promise.all([fetch('/api/projects'), fetch(`/api/characters?projectId=${projectId}`), chapterId ? fetch(`/api/chapter-characters?chapterId=${chapterId}`) : Promise.resolve(null)]);
        if (response.ok) {
          const projects = await response.json() as Array<{ id: string; title: string; genre: string; description: string; narrativePerspective?: string | null; defaultPovCharacterId?: string | null; writingStyleNotes?: string }>;
          const project = projects.find(item => item.id === projectId);
          const characterData = characterResponse.ok ? await characterResponse.json() as { characters?: GenerationCharacter[]; relationships?: GenerationRelationship[] } : {};
          const explicitCast = castResponse?.ok ? await castResponse.json() as GenerationChapterCharacter[] : [];
          const resolvedPovId = povCharacterId || project?.defaultPovCharacterId;
          const povName = characterData.characters?.find(character => character.id === resolvedPovId)?.name;
          const presentIds = new Set(explicitCast.filter(entry => entry.participation === 'present').map(entry => entry.characterId));
          const reviewCharacters = (characterData.characters || []).filter(character => character.id === resolvedPovId || (explicitCast.length > 0 ? presentIds.has(character.id) : content.includes(character.name))).slice(0, 8);
          const reviewCharacterIds = new Set(reviewCharacters.map(character => character.id));
          const reviewRelationships = (characterData.relationships || []).filter(relation => reviewCharacterIds.has(relation.fromCharacterId) && reviewCharacterIds.has(relation.toCharacterId));
          const voiceContext = buildCharacterVoiceContext(reviewCharacters, reviewRelationships, project?.narrativePerspective, resolvedPovId);
          const castContext = explicitCast.length > 0 ? [
            `明示された登場人物：${explicitCast.filter(entry => entry.participation === 'present').map(entry => `${entry.character.name}${entry.notes ? `（${entry.notes}）` : ''}`).join('、') || 'なし'}`,
            `言及のみ：${explicitCast.filter(entry => entry.participation === 'mentioned').map(entry => `${entry.character.name}${entry.notes ? `（${entry.notes}）` : ''}`).join('、') || 'なし'}`,
            '言及のみの人物や明示キャスト外人物が現在場面で発話・行動している場合は、回想、電話、通信、記録、夢、作中作などの文脈を確認した上で整合性の確認点として扱ってください。機械的に誤りと断定しないでください。',
          ].join('\n') : '';
          if (project) projectContext = [
            `作品：${project.title}`,
            `ジャンル：${formatSemanticLabel('genre', project.genre)}`,
            `作品概要：${project.description || '未設定'}`,
            project.narrativePerspective && `視点方式：${displayLabel(NARRATIVE_PERSPECTIVE_LABELS, project.narrativePerspective)}`,
            povName && `視点人物：${povName}`,
            project.writingStyleNotes && `文体メモ：${project.writingStyleNotes}`,
            endingNotes && `章末メモ：${endingNotes}`,
            voiceContext && `\n${voiceContext}\n設定されていない音声要素を正解として作らず、上記の明示設定との不整合だけを評価してください。`,
            castContext && `\n【明示章キャスト】\n${castContext}`,
          ].filter(Boolean).join('\n');
        }
      } catch {
        // Project context is optional; review can continue with the chapter alone.
      }
    }

    const reviewPromises = REVIEW_PERSPECTIVES.map(async (perspective) => {
      try {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentType: 'reviewer',
            messages: [{
              role: 'user',
              content: `${perspective.systemPrompt}\n\n${REVIEW_OUTPUT_RULES}\n\n${projectContext ? `【作品情報】\n${projectContext}\n\n` : ''}${chapterPurpose ? `【この章の詳細プロット・目的】\n${chapterPurpose}\n\n` : ''}【評価対象】\n## ${chapterTitle}\n\n${content}`,
            }],
          }),
          signal: abortRef.current?.signal,
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
                if (parsed.content) accumulated += parsed.content;
              } catch {
                // skip
              }
            }
          }
        }

        // Parse severity counts
        const severityCounts = [
          { level: 'S1', count: (accumulated.match(/S1/g) || []).length },
          { level: 'S2', count: (accumulated.match(/S2/g) || []).length },
          { level: 'S3', count: (accumulated.match(/S3/g) || []).length },
          { level: 'S4', count: (accumulated.match(/S4/g) || []).length },
        ];

        return {
          perspective: perspective.id,
          emoji: perspective.emoji,
          color: perspective.color,
          content: accumulated,
          severity: severityCounts,
        } as ReviewResult;
      } catch {
        return {
          perspective: perspective.id,
          emoji: perspective.emoji,
          color: perspective.color,
          content: '⚠️ レビューに失敗しました。もう一度お試しください',
          severity: [],
        } as ReviewResult;
      }
    });

    const reviewResults = await Promise.all(reviewPromises);
    setResults(reviewResults);
    setIsReviewing(false);
    abortRef.current = null;
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setIsReviewing(false);
  };

  // Find conflicts between reviewers
  const conflicts: string[] = [];
  if (results.length === 4) {
    const hasS1 = results.some(r => r.severity.some(s => s.level === 'S1' && s.count > 0));
    const allS1Free = results.every(r => !r.severity.some(s => s.level === 'S1' && s.count > 0));
    if (hasS1 && allS1Free === false) {
      const s1Reviewers = results.filter(r => r.severity.some(s => s.level === 'S1' && s.count > 0)).map(r => r.perspective);
      const noS1Reviewers = results.filter(r => !r.severity.some(s => s.level === 'S1' && s.count > 0)).map(r => r.perspective);
      if (s1Reviewers.length > 0 && noS1Reviewers.length > 0) {
        conflicts.push(`${s1Reviewers.map(p => REVIEW_PERSPECTIVES.find(rp => rp.id === p)?.emoji).join('')} は重大な問題を検出しましたが、${noS1Reviewers.map(p => REVIEW_PERSPECTIVES.find(rp => rp.id === p)?.emoji).join('')} は検出していません`);
      }
    }
  }

  const currentResult = results.find(r => r.perspective === activeReview);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords size={18} className="text-purple-400" />
          <h3 className="text-sm font-bold text-foreground">多角的レビュー</h3>
        </div>
        <div className="flex items-center gap-2">
          {isReviewing ? (
            <Button variant="destructive" size="sm" onClick={handleStop}>
              <Loader2 size={14} className="mr-1 animate-spin" />停止
            </Button>
          ) : (
            <Button size="sm" onClick={handleReview} disabled={!content.trim()}>
              <Swords size={14} className="mr-1" />レビュー開始
            </Button>
          )}
        </div>
      </div>

      {isReviewing && (
        <Card className="bg-card/50 border-primary/30">
          <CardContent className="p-4 text-center">
            <Loader2 size={24} className="animate-spin mx-auto text-primary mb-2" />
            <p className="text-sm text-foreground">4人の専門Reviewerが並行して確認しています...</p>
            <div className="flex items-center justify-center gap-4 mt-3">
              {REVIEW_PERSPECTIVES.map(p => (
                <div key={p.id} className="text-center">
                  <span className="text-lg">{p.emoji}</span>
                  <div className="flex items-center justify-center gap-1">
                    <Loader2 size={10} className="animate-spin text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && !isReviewing && (
        <>
          {/* Conflicts */}
          {conflicts.length > 0 && (
            <Card className="bg-amber-400/5 border-amber-400/30">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={14} className="text-amber-400" />
                  <span className="text-xs font-medium text-amber-400">レビュー結果の相違</span>
                </div>
                {conflicts.map((conflict, i) => (
                  <p key={i} className="text-xs text-foreground/80">{conflict}</p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Severity Summary */}
          <div className="grid grid-cols-4 gap-2">
            {results.map(r => {
              const perspective = REVIEW_PERSPECTIVES.find(p => p.id === r.perspective);
              const s1Count = r.severity.find(s => s.level === 'S1')?.count || 0;
              const s2Count = r.severity.find(s => s.level === 'S2')?.count || 0;
              return (
                <Card key={r.perspective} className="bg-card/50 border-border/50">
                  <CardContent className="p-2 text-center">
                    <span className="text-lg">{perspective?.emoji}</span>
                    <p className="text-[10px] text-muted-foreground">{perspective?.label}</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      {s1Count > 0 && <Badge className="text-[9px] bg-red-400/20 text-red-400">S1:{s1Count}</Badge>}
                      {s2Count > 0 && <Badge className="text-[9px] bg-amber-400/20 text-amber-400">S2:{s2Count}</Badge>}
                      {s1Count === 0 && s2Count === 0 && <CheckCircle2 size={12} className="text-emerald-400" />}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Review Content */}
          <Tabs value={activeReview} onValueChange={setActiveReview}>
            <TabsList className="bg-secondary/50 w-full">
              {REVIEW_PERSPECTIVES.map(p => (
                <TabsTrigger key={p.id} value={p.id} className="text-xs flex-1">
                  {p.emoji} {p.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {REVIEW_PERSPECTIVES.map(p => (
              <TabsContent key={p.id} value={p.id} className="mt-3">
                <Card className="bg-card/50 border-border/50">
                  <CardContent className="p-4">
                    <ScrollArea className="max-h-[50vh]">
                      <div className="prose prose-sm prose-invert max-w-none">
                        <pre className="text-sm text-foreground/90 whitespace-pre-wrap font-sans leading-relaxed">
                          {results.find(r => r.perspective === p.id)?.content || 'レビュー結果はまだありません'}
                        </pre>
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </>
      )}

      {results.length === 0 && !isReviewing && (
        <div className="text-center py-8 text-muted-foreground">
          <Swords size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-xs">4人の専門Reviewerが異なる観点から確認します</p>
          <p className="text-xs mt-1">構成 · 人物 · 語り口 · 整合性</p>
        </div>
      )}
    </div>
  );
}
