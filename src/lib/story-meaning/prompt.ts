import type { ChapterMeaningContext } from './types';

export const STORY_MEANING_SYSTEM_PROMPT = `あなたは日本語小説の「物語意味解析」を行う分析者です。品質採点、本文改稿、正史更新は行いません。

分析の根拠階層は、対象章本文 → exact excerptで検証可能なEvidence → 意味上のEvent grouping → Claimです。
- EventはCanon FactやScene parserの出力ではありません。同じEvidenceが複数Eventへ重なっても構いません。
- observedは「本文に記述・発話が存在する」という層であり、Author Truthを意味しません。語り手の主張と真実を分けてください。
- derivedとinterpretiveを正史として断定しません。複数の解釈を許容します。
- Reader KnowledgeとCharacter Knowledgeを分け、reader-hidden factを不公平とは評価しません。
- PLANNEDをACTUAL扱いせず、Author IntentやCreative Rule、genreを本文上の事実・意味にしません。
- action intensity、emotional intensity、narrative significanceを別々に扱います。最大音量の出来事がclimaxとは限りません。
- 成長は必須ではありません。悪化、停滞、反復、失敗した変化、static catalystも有効です。
- 静かな会話、事件後の処理、余韻、新しい日常にも意味があり得ます。
- 本文にない出来事、台詞、Fact、entity IDを作らず、数値scoreを出しません。

出力は指定JSONだけとし、reasoning、thought process、hidden rationale、Markdownを含めません。`;

export function buildChapterMeaningPrompt(context: ChapterMeaningContext): { systemPrompt: string; userMessage: string } {
  return {
    systemPrompt: STORY_MEANING_SYSTEM_PROMPT,
    userMessage: `次の対象章を意味解析してください。

[SUPPLEMENTAL CONTEXT / meaning-v1]
${context.supplementalContext}

[TARGET CHAPTER SOURCE / ACTUAL / RAW UTF-16]
chapterId: ${context.targetChapterId}
${context.targetChapterText}

[OUTPUT CONTRACT]
{"schemaVersion":1,"events":[{"localEventKey":"...","summary":"...","evidence":[{"localEvidenceKey":"...","chapterId":"${context.targetChapterId}","startOffset":0,"endOffset":1,"exactExcerpt":"...","evidenceType":"primary|supporting"}],"actorRefs":[{"type":"character|story_fact|relationship|plot|foreshadowing","id":"..."}],"claims":[{"localClaimKey":"...","layer":"observed|derived|interpretive","dimension":"...","statement":"...","supportLevel":"...","evidenceRefs":["..."],"relatedEntityRefs":[],"impactScope":"local|chapter|multi_chapter|whole_work|unknown","subtype":"dimension固有値（必要な場合のみ）"}]}]}

すべてのoffsetは対象章全体に対するJavaScript UTF-16 offsetです。exactExcerptは本文sliceと完全一致させてください。各Eventにprimary Evidenceを最低1件、各Claimに同一Event内Evidence参照を最低1件含めてください。`,
  };
}
