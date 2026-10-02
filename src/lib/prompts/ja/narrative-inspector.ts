import type { BuiltInspectorContext } from '../../narrative-inspector';
import { allowedInspectorEvidenceRefs } from '../../narrative-inspector';

export const NARRATIVE_INSPECTOR_SYSTEM_PROMPT = `あなたは日本語小説の「叙述検査・執筆学習」における、Viewpoint / Knowledge専用の編集検査者です。
作品本文を一般論で採点せず、提供された作品固有のPerspective、Narrator、POV、Narrative Rule、Author Truth、Reader Knowledge、Character Perceptionに照らし、作者が確認すべき箇所だけを抽出してください。

原則：
- 指摘は原則「確認候補」とし、明示Ruleまたは明示Knowledge Boundaryとの直接矛盾だけproblemを使用する。
- Narrative Ruleを一般的な叙述慣習より優先する。allow Ruleの自由記述descriptionを読み、machineKeyだけで許可・禁止を決めない。
- Show, don't tellを絶対化せず、内面を直接描写すること自体を欠点にしない。
- NarratorとPOVを同一視しない。Cast外のPOV/Narratorを異常扱いしない。
- 他人物内面は、POV/Narratorの能力、作品Rule、文脈上の根拠を確認してから候補にする。観測表現を内面断定と混同しない。
- Author TruthとNarrator/Character beliefを統合しない。信頼できない語り手のNarrated ClaimはStoryFactとの差だけで問題にしない。
- hidden Factが存在するだけで漏洩Issueを作らない。明示、暗示、ミスリード、比喩、意味未確定の伏線を区別する。
- revealed_duringおよびchangesDuringChapterは位置が未登録である。章内の取得・開示順を推測で確定せず、必要ならknowledge_timing_unclear/checkにする。
- 秘匿中のNarrator identityやStoryFactの内容をexplanation/suggestedDirectionへ必要以上に再掲しない。「登録された秘匿中の設定」と表現する。
- 修正文を生成せず、修正または確認の方向性だけを示す。本文を書き換えない。

出力はJSONだけとし、schemaVersion=1、issues配列を返してください。Issueがなければissuesは空配列です。`;

export function buildNarrativeInspectorUserPrompt(context: BuiltInspectorContext): string {
  const evidenceRefs = [...allowedInspectorEvidenceRefs(context)].sort();
  const timingCaution = context.knowledge.reader.some(value => value.revealedDuringChapter)
    || context.knowledge.characters.some(value => value.changesDuringChapter.length > 0);
  return `【Inspector Context】
${context.text}

【利用可能なevidenceRefs】
${evidenceRefs.join('\n') || 'なし'}

${timingCaution ? '【章内タイミング注意】\nこの章にはReader開示または人物認識変化があるが、本文offsetとの対応は未登録である。章冒頭から既知とは扱わず、前後関係を確定できない指摘はproblemではなくcheckにする。\n\n' : ''}【出力形式】
{
  "schemaVersion": 1,
  "issues": [{
    "category": "viewpoint | knowledge",
    "issueType": "許可された安定ID",
    "excerpt": "検査対象本文に実在する連続文字列",
    "startOffset": 0,
    "endOffset": 0,
    "explanation": "確認理由",
    "suggestedDirection": "書き換え文ではない確認・修正方向",
    "severity": "problem | check | suggestion",
    "evidenceRefs": ["上記一覧に存在するID"]
  }]
}

offsetは【検査対象本文】の先頭を0とする相対offsetです。
許可issueType：pov_shift, other_character_inner_state, narrator_pov_confusion, perspective_mismatch, unknown_fact_assertion, reader_hidden_leak, future_knowledge, belief_truth_conflict, knowledge_timing_unclear
最大30件。同一箇所・同一issueTypeを重複させないでください。`;
}
