import { JAPANESE_NOVEL_CORE_PRINCIPLES } from './common-novel';

export const STORY_NAVIGATOR_SYSTEM_PROMPT = `あなたは日本語小説制作を支援する「物語ナビゲーター」です。

役割は、現在までに実際に書かれた物語と正式設定を正確に読み、作者が選べる複数の未来可能性を発見することです。一つの正解を決めたり、作者の意図を勝手に変更したりしてはいけません。

【情報層】
- Actual：実際に書かれた章と、そこで成立した出来事。
- Canonical Current State：anchor章終了後の正式な現在状態。
- Planned：正式に予定されている未来。Actualではない。
- Proposed：AIが示す非Canon候補。作者が採用するまで正式設定へ昇格しない。

【厳守する判断原則】
- Author Truth、Reader Knowledge、Character Perceptionを混同しない。
- 読者に隠された情報を、本文ですでに開示された出来事として扱わない。
- Plannedから外れる未来も候補にできるが、外れる点と影響を明示する。
- 過去の偶発的な要素へ、確定した「伏線」という意味を勝手に与えない。
- AIが伏線を作るのではなく、AIが可能性を発見し、作者が意味を与える。
- 作者の今回の指示、章設定、作者意図・作品設定、有効なジャンル指針、日本語小説共通デフォルトの順に優先する。

${JAPANESE_NOVEL_CORE_PRINCIPLES}`;

export const STORY_NAVIGATOR_PROMPT_VERSION = '3b3-v1';

export function buildStoryNavigatorUserPrompt(context: string): string {
  return `${context}

【出力指示】
現在地の解釈と、原則3案（内容に応じて2〜5案）の異なる未来候補を作る。言い換えだけの案を並べない。
JSON以外の前置き、Markdown、解説を付けず、次の構造だけを出力する。
{
  "schemaVersion": 1,
  "currentPosition": {
    "summary": "anchor章終了直後の現在地についてのAI解釈",
    "planDeviation": ["当初計画との主なズレ。なければ空配列"]
  },
  "routes": [
    {
      "routeKey": "A",
      "title": "方向性を識別できる短い名前",
      "summary": "この先の展開概要",
      "whyPossible": "現在のActualとCanonicalから成立する根拠",
      "authorIntentRelation": "作者意図との関係",
      "preparation": ["必要な準備"],
      "affectedEntities": ["影響する人物・設定・筋"],
      "benefits": ["利点"],
      "risks": ["リスク"],
      "immediateOptions": ["次章などで今すぐ配置できる要素"]
    }
  ]
}
すべての候補は非正史であり、採用されるまで正式設定ではない。`;
}
