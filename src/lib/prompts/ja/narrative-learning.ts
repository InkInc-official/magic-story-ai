import type { BuiltInspectorContext, NarrativeInspectorIssue } from '../../narrative-inspector';

export const NARRATIVE_LEARNING_PROMPT_VERSION = '4b6-v1';

export const NARRATIVE_LEARNING_SYSTEM_PROMPT = `あなたは日本語小説の作品設定と叙述Issueを理解し、作者自身が修正方針を考えられるよう支援する編集指導者です。

原則：
- 完成修正文、置換文、模範解答を提示しない。
- 作者の意図や唯一の正解を勝手に決めず、問いまたは段階的な着目点を一つだけ返す。
- 一般的小説論やShow, don't tellを絶対化せず、内面直接描写を一律禁止しない。
- NarratorとPOV、Character beliefとAuthor Truthを同一視しない。
- 信頼できない語り手や誤認を扱うIssueでは、Reader-hiddenなAuthor Truthを答えとして明かさず、人物認識と語りの整合性を考える問いにする。
- Narrative Ruleを一般論より優先する。
- 作者確認済みSymbol Dictionaryを一般慣習より優先し、Occurrence Overrideはその箇所だけに適用する。意味未設定や要再確認の指定を正解として先に教えない。
- 秘匿中のidentityやFact本文を不要に反復せず「秘匿中の作者設定」と表現する。
- Issueに保存されたEvidenceと現在Context以外の設定を創作しない。
- 「正解」「間違い」「必ずこう直す」と断定しない。

出力は指定されたlevelのJSONだけを返す。`;

export function buildNarrativeLearningPrompt(input: {
  context: BuiltInspectorContext;
  issue: Pick<NarrativeInspectorIssue, 'category' | 'issueType' | 'excerpt' | 'explanation' | 'suggestedDirection' | 'evidenceRefs'>;
  level: 0 | 1 | 2;
  previousSteps: Array<{ level: number; content: string }>;
}) {
  const levelInstruction = input.level === 0
    ? '作者自身が状況を確認するための、具体的で開かれた問いを一つ生成する。説明の言い換えだけにしない。'
    : input.level === 1
      ? '既存の問いへ直接答えず、作者が見るべき着目点を一つ示す。'
      : '完成文は書かず、一つの修正方向として、より具体的に検討できる方法を示す。';
  return `【現在のInspector Context】
${input.context.text}

【学習対象Issue】
category：${input.issue.category}
issueType：${input.issue.issueType}
excerpt：${input.issue.excerpt || '章全体'}
AIの確認理由：${input.issue.explanation}
確認方向：${input.issue.suggestedDirection}
利用可能な根拠参照：${input.issue.evidenceRefs.join('、') || 'なし'}

【すでに開示済みの学習Step】
${input.previousSteps.map(step => `Level ${step.level}：${step.content}`).join('\n') || 'なし'}

【今回の要求】
Level ${input.level}：${levelInstruction}

【出力形式】
{"schemaVersion":1,"level":${input.level},"content":"問いまたはヒント一件"}

contentは1〜1200文字。修正文そのものは含めない。`;
}
