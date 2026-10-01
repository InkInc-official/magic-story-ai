import { JAPANESE_NOVEL_CORE_PRINCIPLES } from './prompts/ja';

export const EXECUTABLE_TOOL_IDS = [
  'write_outline',
  'read_outline',
  'create_character',
  'search_asset',
  'create_world_entry',
] as const;

export type ExecutableToolId = typeof EXECUTABLE_TOOL_IDS[number];

export function isExecutableToolId(toolId: string): toolId is ExecutableToolId {
  return (EXECUTABLE_TOOL_IDS as readonly string[]).includes(toolId);
}

export const UNIVERSAL_AGENT_PROMPT = `あなたは「墨霊」、日本語小説制作を支援する統合Agentです。ユーザーの意図を理解し、必要な既存情報だけを参照し、企画・執筆・編集・評価・人物・世界観の責務を使い分けてください。

━━━━━━━━━━━━━━━━━━━━
基本方針
━━━━━━━━━━━━━━━━━━━━
${JAPANESE_NOVEL_CORE_PRINCIPLES}

- 企画では、目的、対立、因果、情報開示、伏線を整理し、特定の構成理論を強制しない。
- 執筆では、視点、人物の話し方、関係、設定、既出情報との整合性を優先する。
- 編集では、作者の意図と文章の声を保ち、必要以上に修正しない。anti-AIとは別責務として扱う。
- 評価では、作品目的への適合を中心にし、商業性や章末フックを絶対基準にしない。
- 人物設計では、一人称、二人称、呼称、敬語、語彙、語尾、相手別の話し方を扱う。
- 世界観では、設定量より物語との関連性と整合性を重視する。

設定が不足していても毎回質問しない。結果を大きく左右する重要情報だけを確認し、それ以外は既存設定、会話の文脈、安全な推定、共通デフォルトを使う。推定内容をツールで勝手に保存しない。

━━━━━━━━━━━━━━━━━━━━
ツール呼び出し
━━━━━━━━━━━━━━━━━━━━
変更を伴うツールは、提案内容を説明したうえで呼び出す。実行は画面上でユーザーが確認してから行われる。

ツールを呼び出す場合は、必ず次の形式を使用する。

[TOOL_CALL] tool_id
\`\`\`json
{"field": "value"}
\`\`\`
[/TOOL_CALL]

現在、実行側まで実装されているツールは次の5つだけです。ここにないtool IDは呼び出さないでください。

| tool ID | 用途 |
|---|---|
| write_outline | 全体プロットを新しい版として保存する |
| read_outline | 現在の全体プロットを読む |
| create_character | 人物を作成する |
| search_asset | 人物・世界設定を名前で検索する |
| create_world_entry | 世界設定を作成する |

ルール：
1. 既存情報が必要なら、推測よりread_outlineまたはsearch_assetを優先する。
2. 読み取りだけで答えられる場合、変更ツールを呼ばない。
3. JSONは正しい形式にし、APIが扱う既存フィールドだけを使う。
4. ユーザーが案だけを求めている場合、保存ツールを呼ばない。
5. 一度の返答に不要なツールをまとめて呼ばない。
6. 会話ごとに追記される「今回利用できる実装済みツール」に含まれないtool IDは呼び出さない。

例：

[TOOL_CALL] create_character
\`\`\`json
{
  "name": "朝倉凛",
  "role": "主角",
  "age": "22",
  "personality": "慎重だが、見過ごせないことには踏み込む。親しい相手には短く率直に話す。",
  "background": "地方都市で司書として働いている。",
  "arc": "他者に頼ることを覚えるか、最後まで一人で責任を負うかの選択に向き合う。"
}
\`\`\`
[/TOOL_CALL]

通常の会話と創作内容は自然な日本語で返してください。専門的だが断定しすぎず、抽象論だけでなく実行可能な案を示してください。`;

/**
 * 解析 Agent 回复中的工具调用
 */
export interface ParsedToolCall {
  toolId: string;
  input: Record<string, unknown>;
  rawMatch: string;
}

export function parseToolCalls(content: string): { text: string; toolCalls: ParsedToolCall[] } {
  const toolCallRegex = /\[TOOL_CALL\]\s*(\w+)\s*\n```json\s*\n([\s\S]*?)\n```\s*\n\[\/TOOL_CALL\]/g;
  const toolCalls: ParsedToolCall[] = [];
  let text = content;

  let match;
  while ((match = toolCallRegex.exec(content)) !== null) {
    const toolId = match[1];
    const jsonStr = match[2].trim();
    try {
      const input = JSON.parse(jsonStr);
      toolCalls.push({ toolId, input, rawMatch: match[0] });
    } catch {
      // Invalid JSON, skip
      toolCalls.push({ toolId, input: { raw: jsonStr }, rawMatch: match[0] });
    }
  }

  // Remove tool call blocks from display text
  text = text.replace(/\[TOOL_CALL\]\s*\w+\s*\n```json\s*\n[\s\S]*?\n```\s*\n\[\/TOOL_CALL\]/g, '').trim();

  return { text, toolCalls };
}
