import type { CreativeRuleSurface, CreativeTechniqueCategory, CreativeTechniqueDefinition, CreativeTechniqueKey, RegisteredCreativeEvaluatorKey } from './types';

const prose: CreativeRuleSurface[] = ['writer', 'editor', 'review', 'inspector', 'learning', 'universal'];
const story: CreativeRuleSurface[] = ['writer', 'summary', 'review', 'inspector', 'learning', 'navigator', 'universal'];

function definition(
  key: CreativeTechniqueKey,
  label: string,
  shortDescription: string,
  category: CreativeTechniqueCategory,
  applicableSurfaces: CreativeRuleSurface[],
  options: { fallback?: boolean; evaluatorKey?: RegisteredCreativeEvaluatorKey; genres?: string[]; conflicts?: CreativeTechniqueKey[] } = {},
): CreativeTechniqueDefinition {
  return Object.freeze({
    key, label, shortDescription, category,
    guidance: Object.freeze({
      reference: `${shortDescription}。適用可能な場面で参考にし、場面の目的に合わなければ強制しない。`,
      required: `この作品では作者が採用した方針として、${shortDescription}。場面ごとの適用条件を確認して反映する。`,
      forbidden: `この作品では作者が避けると決めた方針として、「${label}」を積極的に用いない。類似表現まで機械的に禁止へ広げない。`,
    }),
    applicableSurfaces: Object.freeze([...applicableSurfaces]),
    ...(options.fallback && { fallbackSectionKey: key }),
    ...(options.evaluatorKey && { evaluatorKey: options.evaluatorKey }),
    ...(options.genres && { relatedGenreTags: Object.freeze([...options.genres]) }),
    ...(options.conflicts && { conflictKeys: Object.freeze([...options.conflicts]) }),
    catalogContractVersion: 1,
  });
}

export const CREATIVE_TECHNIQUE_CATALOG: readonly CreativeTechniqueDefinition[] = Object.freeze([
  definition('show_dont_tell', '説明と描写の使い分け', '直接説明だけに頼らず、行動・台詞・場面描写から読み取れる表現も選択する', 'description', prose),
  definition('sensory_detail', '五感描写', '視点人物が知覚できる感覚情報を場面の効果に応じて用いる', 'description', prose),
  definition('emotional_indirection', '感情を間接的に示す', '行動、沈黙、身体反応、台詞などを通じて感情を示す', 'psychology', prose),
  definition('direct_emotion', '感情を直接説明する', '語りや内面描写で感情を明示し、必要な理解や速度を確保する', 'psychology', prose),
  definition('dialogue_density', '会話密度', '会話と地の文の配分を作品や場面の目的に合わせる', 'dialogue', prose, { evaluatorKey: 'dialogue_density' }),
  definition('distinct_character_voice', '人物別の話し方', '語彙、呼称、敬語、発話長、沈黙などで人物ごとの会話を区別する', 'dialogue', prose),
  definition('subtext_in_dialogue', '台詞の含み', '台詞の表面と人物の意図に差を持たせ、言外の情報を扱う', 'dialogue', prose),
  definition('sentence_length_variation', '文の長短', '文の長さと密度を場面の速度や焦点に合わせて変化させる', 'rhythm', prose, { fallback: true, evaluatorKey: 'sentence_length_variation' }),
  definition('sentence_ending_variety', '文末の変化', '同じ文末表現の連続を意図に応じて調整する', 'rhythm', prose, { fallback: true, evaluatorKey: 'sentence_ending_variety' }),
  definition('paragraph_rhythm', '段落のリズム', '段落の長短、改行、空白を場面の呼吸に合わせる', 'rhythm', prose, { evaluatorKey: 'paragraph_rhythm' }),
  definition('poetic_imagery', '詩的なイメージ', '比喩、象徴、音感、情景への投影を表現効果として用いる', 'style', prose),
  definition('dry_narration', 'ドライな語り', '感情への説明距離を取り、簡潔で抑制された語りを用いる', 'style', prose),
  definition('scene_focus_change', 'シーン内の変化', 'シーンに焦点または状況の変化を持たせる', 'scene', story, { fallback: true }),
  definition('scene_sequel_rhythm', '行動と内省の交替', '行動の局面と反応・検討・決定の局面を組み合わせる', 'scene', story),
  definition('opening_hook', '冒頭の引き', '冒頭に問い、変化、印象的状況などの関心要素を置く', 'chapter', story, { genres: ['web_novel', 'mystery', 'thriller'] }),
  definition('chapter_end_hook', '章末の引き', '章末に未解決の問い、発見、決断、転換などを置く', 'chapter', story, { genres: ['web_novel', 'mystery'] }),
  definition('quiet_chapter_ending', '静かな章末', '余韻、感情の着地、静かな認識変化などで章を閉じる', 'chapter', story),
  definition('cliffhanger', 'クリフハンガー', '危機、決断、結果が確定する直前で区切り、緊張を持ち越す', 'chapter', story, { conflicts: ['quiet_chapter_ending'], genres: ['web_novel', 'thriller'] }),
  definition('staged_information_reveal', '段階的な情報開示', '情報を一度に説明せず、理解に必要な順序で提示する', 'information', story),
  definition('fair_play_clues', 'フェアな手掛かり', '後から検証可能な手掛かりを、解決前の本文へ提示する', 'information', story, { genres: ['mystery'] }),
  definition('foreshadow_and_payoff', '伏線と回収', '先に置いた要素へ後の展開で意味や結果を与える', 'information', story),
  definition('tension_escalation', '緊張の段階的上昇', '障害、代価、不確実性などを段階的に高める', 'tension', story),
  definition('tension_release', '緊張の緩和', '休息、安心、ユーモア、日常などで緊張を一時的に緩める', 'tension', story),
  definition('causal_progression', '因果による進行', '人物の選択、出来事、その結果を因果としてつなぐ', 'structure', story, { fallback: true }),
  definition('three_act_structure', '三幕構成', '物語を導入・展開・解決に相当する三つの大きな段階として設計する', 'structure', ['summary', 'review', 'inspector', 'learning', 'navigator', 'universal']),
  definition('kishotenketsu', '起承転結', '起・承・転・結の四つの働きを構成上の枠組みとして用いる', 'structure', ['summary', 'review', 'inspector', 'learning', 'navigator', 'universal']),
  definition('character_arc', '人物の変化', '成長、後退、停滞、破綻を含む人物の変化を物語上で追跡する', 'character', story),
  definition('reversal_catharsis', '逆転のカタルシス', '評価、認識、力関係などの逆転によって達成感や解放感を作る', 'reader_experience', story, { genres: ['web_novel', 'entertainment'] }),
]);

export const CREATIVE_TECHNIQUE_BY_KEY: ReadonlyMap<CreativeTechniqueKey, CreativeTechniqueDefinition> = new Map(
  CREATIVE_TECHNIQUE_CATALOG.map(value => [value.key, value]),
);
