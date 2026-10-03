export const REVIEW_SUPPLEMENTAL_CONTEXT_LIMIT = 8_000;

interface ReviewUserMessageInput {
  reviewerInstruction: string;
  outputContract: string;
  supplementalContext: string;
  chapterPurpose?: string;
  chapterTitle: string;
  targetProse: string;
}

/**
 * The 8,000 character budget applies only to supplementalContext. The review
 * target stays separate so this helper never silently truncates an author's chapter.
 */
export function buildReviewUserMessage(input: ReviewUserMessageInput): string {
  if (input.supplementalContext.length > REVIEW_SUPPLEMENTAL_CONTEXT_LIMIT) {
    throw new Error('レビュー補助コンテキストが8,000文字を超えています。');
  }
  return [
    `【レビュー観点】\n${input.reviewerInstruction}`,
    input.supplementalContext ? `【作品設定・補助コンテキスト】\n${input.supplementalContext}` : '',
    input.chapterPurpose ? `【この章の詳細プロット・目的】\n${input.chapterPurpose}` : '',
    `【評価対象本文】\n## ${input.chapterTitle}\n\n${input.targetProse}`,
    `【出力形式】\n${input.outputContract}`,
  ].filter(Boolean).join('\n\n');
}
