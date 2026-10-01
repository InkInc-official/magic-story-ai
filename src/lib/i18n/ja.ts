export const APP_LOCALE = 'ja-JP';

export const ja = {
  app: {
    name: '小説創作Agent',
    title: '小説創作Agentプラットフォーム - AIによるマルチAgent共同執筆',
    description: '企画・執筆・編集・評価・キャラクター・世界観の6つの専門AI Agentが連携する小説創作プラットフォーム',
  },
  nav: {
    creation: '創作センター',
    assets: 'プロジェクト管理',
    graph: 'ストーリーグラフ',
    dashboard: 'ダッシュボード',
    outline: 'プロット',
    chapters: '執筆',
    tracking: '追跡',
    settings: '設定',
  },
  common: {
    add: '追加',
    cancel: 'キャンセル',
    close: '閉じる',
    create: '作成',
    delete: '削除',
    edit: '編集',
    save: '保存',
    search: '検索',
    loading: '読み込み中...',
    generating: '生成中...',
    noData: 'データがありません',
    retry: 'もう一度お試しください',
  },
  errors: {
    requestFailed: 'リクエストに失敗しました。もう一度お試しください。',
    loadFailed: '読み込みに失敗しました。',
    saveFailed: '保存に失敗しました。',
  },
} as const;

type LabelMap = Readonly<Record<string, string>>;

/**
 * Stored values remain untouched. Unknown/legacy values are displayed as-is so
 * existing projects stay readable after localization.
 */
export function displayLabel(labels: LabelMap, value: string): string {
  return labels[value] ?? value;
}

export const GENRE_LABELS: LabelMap = {
  '玄幻系统修仙': 'システム修仙ファンタジー',
  '都市重生': '現代転生',
  '脑洞网文': '奇想Web小説',
  '都市修仙': '現代修仙',
  '都市高武': '現代武術ファンタジー',
  '末日系统': '終末世界システム',
  '霸总': '御曹司ロマンス',
  '后悔流': '後悔・再生もの',
  '无敌文': '無双もの',
  '历史架空': '架空歴史',
  '东方玄幻': '東洋ファンタジー',
  '策略经营': '戦略・領地経営',
};

export const NARRATIVE_PERSPECTIVE_LABELS: LabelMap = {
  first_person: '一人称',
  third_person_limited: '三人称一元',
  third_person_multiple: '三人称多元',
  third_person_objective: '三人称客観',
  custom: 'その他・自由指定',
};

export const CHAPTER_LENGTH_POLICY_LABELS: LabelMap = {
  guide: '目安（自然な終了を優先）',
  strict: 'できるだけ厳密',
};

export const CHARACTER_ROLE_LABELS: LabelMap = {
  '主角': '主人公',
  '女主': 'ヒロイン',
  '反派': '敵役',
  '配角': '脇役',
  '导师': '師匠',
  '路人': '端役',
};

export const RELATIONSHIP_LABELS: LabelMap = {
  '盟友': '仲間',
  '恋人': '恋人',
  '师徒': '師弟',
  '父子': '父子',
  '母女': '母娘',
  '兄弟': '兄弟',
  '姐妹': '姉妹',
  '仇敌': '宿敵',
  '对手': 'ライバル',
  '暗恋': '片思い',
  '上下级': '上司・部下',
  '同门': '同門',
  '契约': '契約関係',
};

export const EMOTION_LABELS: LabelMap = {
  '爽快': '爽快', '感动': '感動', '紧张': '緊張', '期待': '期待',
  '愤怒': '怒り', '悲伤': '悲しみ', '惊喜': '驚き', '恐惧': '恐怖',
  '温暖': '温かさ', '震撼': '衝撃',
};

export const EMOTION_ARC_LABELS: LabelMap = {
  'V型': 'V字型（低→高）', '倒V型': '逆V字型（高→低）',
  'W型': 'W字型（起伏）', '递进': '段階的上昇',
  '延迟满足': '遅延満足', '突变': '急変',
};

export const HOOK_LABELS: LabelMap = {
  '悬念': '謎・引き', '反转': 'どんでん返し', '冲突': '対立',
  '揭秘': '真相開示', '危机': '危機', '承诺': '約束',
  '回忆': '回想', '对比': '対比',
};

export const TIME_OF_DAY_LABELS: LabelMap = {
  '清晨': '早朝', '上午': '午前', '正午': '正午', '下午': '午後',
  '傍晚': '夕方', '夜晚': '夜', '深夜': '深夜', '黎明': '夜明け',
};

export const ATMOSPHERE_LABELS: LabelMap = {
  '紧张': '緊張', '温馨': '温かい', '恐怖': '恐怖', '浪漫': 'ロマンチック',
  '庄严': '荘厳', '悲凉': '物悲しい', '欢快': '陽気', '神秘': '神秘的',
  '宁静': '静穏', '激烈': '激しい',
};

export const PLOT_TYPE_LABELS: LabelMap = {
  main: 'メイン', sub: 'サブ', task: 'クエスト', dungeon: 'エピソード',
  scene: 'シーン', event: 'イベント',
};

export const WORLD_SETTING_TYPE_LABELS: LabelMap = {
  background: '背景設定', power: '能力体系', location: '地理・環境',
  society: '社会構造', history: '歴史・文化', rules: '世界のルール', other: 'その他',
};

export const PROMPT_PRESET_NAME_LABELS: LabelMap = {
  '默认大纲生成': '標準プロット生成', '默认章节生成': '標準章生成',
  '默认润色': '標準推敲', '默认角色设计': '標準キャラクター設計',
  '默认评审': '標準レビュー', '默认世界观构建': '標準世界観構築',
};

export const TOOL_LABELS: LabelMap = {
  write_outline: 'プロット作成', write_chapter_plan: '章の詳細プロット', read_outline: 'プロット読込',
  create_character: 'キャラクター作成', update_character: 'キャラクター更新',
  generate_portrait: 'ポートレート生成', search_asset: 'アセット検索',
  create_world_entry: '世界設定作成', create_scene: 'シーン作成', create_plot: 'ストーリー作成',
  create_story_node: 'グラフノード作成', link_nodes: 'ノード接続', read_graph: 'グラフ読込',
};

export const TOOL_DESCRIPTION_LABELS: LabelMap = {
  write_outline: '物語のプロットを作成または更新', write_chapter_plan: '章の詳細プロットを生成',
  read_outline: '現在のプロジェクトのプロットを取得', create_character: 'キャラクターを作成してプロジェクトへ保存',
  update_character: '既存キャラクターの設定を更新', generate_portrait: 'AIでキャラクターのポートレートを生成',
  search_asset: 'キャラクター、シーン、世界観を検索', create_world_entry: '世界観の項目を追加',
  create_scene: 'シーンアセットを作成', create_plot: 'ストーリーラインを作成',
  create_story_node: 'ストーリーグラフにノードを作成', link_nodes: 'ストーリーグラフのノードを接続',
  read_graph: 'ストーリーグラフのデータを取得',
};

export const AGENT_LABELS: LabelMap = {
  planner: '企画Agent', writer: '執筆Agent', editor: '編集Agent',
  reviewer: '評価Agent', character: 'キャラクターAgent', worldbuilder: '世界観Agent',
};

export const AGENT_DESCRIPTION_LABELS: LabelMap = {
  planner: '物語の構成、テーマ、対立、全体プロットを設計',
  writer: 'プロットを生き生きとした章本文へ展開',
  editor: '文章を推敲し、表現と読みやすさを改善',
  reviewer: '複数の観点から小説の品質を評価',
  character: '人物像、関係性、成長の流れを設計・管理',
  worldbuilder: '一貫性のある世界設定を構築',
};
