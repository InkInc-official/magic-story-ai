import type { BuiltInspectorContext } from '../../narrative-inspector';
import { allowedInspectorEvidenceRefs } from '../../narrative-inspector';

export const NARRATIVE_INSPECTOR_SYSTEM_PROMPT = `あなたは日本語小説の「叙述検査・執筆学習」における、Viewpoint / Knowledge / Voice / Narrative Rule専用の編集検査者です。
作品本文を一般論で採点せず、提供された作品固有のPerspective、Narrator、POV、作者確認済みSymbol Dictionary、Narrative Rule、Author Truth、Reader Knowledge、Character Perception、人物別Voiceに照らし、作者が確認すべき箇所だけを抽出してください。

原則：
- 指摘は原則「確認候補」とし、明示Ruleまたは明示Knowledge Boundaryとの直接矛盾だけproblemを使用する。
- Narrative Ruleを一般的な叙述慣習より優先する。allow Ruleの自由記述descriptionを読み、machineKeyだけで許可・禁止を決めない。
- 優先順位は、作者が明示した今回の検査条件、作者確認済みSymbol Dictionary、Project Narrative Rule、一般慣習の順とする。ただしDictionaryとNarrative Ruleが直接競合する場合はsourceとscopeを区別し、片方を機械的に無効化しない。
- Symbol Dictionaryのconfirmed defaultは作品全体の表記意味、confirmed OverrideはそのOccurrenceだけの意味として扱い、Overrideを別箇所へ一般化しない。
- 意味未設定、既定用途未設定、unresolved、stale、reanchorable、ambiguous、removed、inactive参照、malformedの記号を作者確認済み意味として扱わず、一般慣習だけで作品設定を確定しない。既定用途へsilent fallbackしない。
- Symbolのmachine dimensionsは排他的分類ではない。null（未指定）とfalse（明示否定）を区別する。current_pov/contextual/unknownから話者・Knowledge・StoryFactを新規推論しない。
- 表記意味と本文表現の不一致は機械的にproblemとせず、比喩・特殊設定・場面文脈を考慮した確認候補にする。
- Show, don't tellを絶対化せず、内面を直接描写すること自体を欠点にしない。
- NarratorとPOVを同一視しない。Cast外のPOV/Narratorを異常扱いしない。
- 他人物内面は、POV/Narratorの能力、作品Rule、文脈上の根拠を確認してから候補にする。観測表現を内面断定と混同しない。
- Author TruthとNarrator/Character beliefを統合しない。信頼できない語り手のNarrated ClaimはStoryFactとの差だけで問題にしない。
- hidden Factが存在するだけで漏洩Issueを作らない。明示、暗示、ミスリード、比喩、意味未確定の伏線を区別する。
- revealed_duringおよびchangesDuringChapterは位置が未登録である。章内の取得・開示順を推測で確定せず、必要ならknowledge_timing_unclear/checkにする。
- Voiceは文字列一致で判定しない。話者・相手・引用・物真似・演技・感情・緊急性・関係変化を本文意味から考慮し、話者や相手が不明なら断定しない。
- 相手が特定できるVoiceは、方向付きRelationship override（呼称・register・style）、Character base voice、場面判断の順に参照する。逆方向Relationshipを使用しない。
- 呼称設定は、その語を全発言で必ず使うという意味ではない。呼びかけがないことだけでIssueにしない。
- Narrator voice、POV Characterのnarration voice、Characterの台詞口調を分離し、相互の基準として誤用しない。「」等の記号だけで話者を確定しない。
- requireは適用scopeを確認し、検査range外を含む条件を部分rangeだけで欠落と断定しない。forbidは暗示・伏線・象徴まで禁止へ拡張しない。
- allowは例外または許可であり、不使用をIssueにしない。guidanceだけを根拠にproblemを使用しない。
- 複数Ruleが競合して見える場合は勝手に片方を無効化せず、解決不能ならrule_conflict/checkにする。overridable=trueは例外可能性を考慮するが、未登録の例外を捏造しない。
- 秘匿中のNarrator identityやStoryFactの内容をexplanation/suggestedDirectionへ必要以上に再掲しない。「登録された秘匿中の設定」と表現する。
- 修正文を生成せず、修正または確認の方向性だけを示す。本文を書き換えない。

出力はJSONだけとし、schemaVersion=1、issues配列を返してください。Issueがなければissuesは空配列です。`;

export function buildNarrativeInspectorUserPrompt(context: BuiltInspectorContext): string {
  const evidenceRefs = [...allowedInspectorEvidenceRefs(context)].sort();
  const timingCaution = context.knowledge.reader.some(value => value.revealedDuringChapter)
    || context.knowledge.characters.some(value => value.changesDuringChapter.length > 0);
  const fullChapter = context.inspectedText.requestedRange.start === 0
    && context.inspectedText.requestedRange.end === context.inspectedText.endOffset
    && !context.inspectedText.truncated;
  return `【Inspector Context】
${context.text}

【利用可能なevidenceRefs】
${evidenceRefs.join('\n') || 'なし'}

【本文範囲の境界】
Issueのexcerptと相対offsetは【検査対象本文】の内部だけから返す。【前後の参考文脈】は解釈の参考であり、そこだけに存在する文章をIssue evidenceとして返さない。
作品表記辞書の前後参考情報も同様にcontext専用であり、対象外のOccurrenceをIssue evidenceにしない。

${timingCaution ? '【章内タイミング注意】\nこの章にはReader開示または人物認識変化があるが、本文offsetとの対応は未登録である。章冒頭から既知とは扱わず、前後関係を確定できない指摘はproblemではなくcheckにする。\n\n' : ''}【検査scope】
${fullChapter ? 'Chapter全体を検査している。require Ruleの欠落は、条件成立を本文全体から確認できる場合だけchapter locationで報告できる。' : '部分rangeまたは安全上限で切り詰めた本文を検査している。章冒頭・章末・各章などrange外を含み得るrequire Ruleの欠落を断定せず、required_rule_missingを返さない。必要なら実在箇所を根拠にrule_application_unclear/checkとする。'}

【出力形式】
{
  "schemaVersion": 1,
  "issues": [{
    "category": "viewpoint | knowledge | voice | narrative_rule",
    "issueType": "許可された安定ID",
    "locationKind": "excerpt | chapter",
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
通常はlocationKind=excerptとし、本文に実在するexcerptと一致するoffsetを返してください。
required_rule_missingだけは、Chapter全体検査の場合に限りlocationKind=chapter、excerpt=""、startOffset=0、endOffset=0を使用できます。架空のexcerptを作らないでください。
許可issueType：pov_shift, other_character_inner_state, narrator_pov_confusion, perspective_mismatch, unknown_fact_assertion, reader_hidden_leak, future_knowledge, belief_truth_conflict, knowledge_timing_unclear, first_person_mismatch, address_term_mismatch, speech_register_mismatch, speech_style_mismatch, narration_voice_mismatch, speaker_unclear, required_rule_missing, forbidden_rule_violation, rule_conflict, rule_application_unclear
最大30件。同一箇所・同一issueTypeを重複させないでください。`;
}
