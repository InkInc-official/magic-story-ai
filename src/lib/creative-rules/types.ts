export const CREATIVE_RULE_MODES = ['off', 'reference', 'required', 'forbidden'] as const;
export const CREATIVE_TECHNIQUE_CATEGORIES = ['description', 'psychology', 'dialogue', 'rhythm', 'style', 'scene', 'chapter', 'information', 'tension', 'structure', 'character', 'reader_experience'] as const;
export const CREATIVE_RULE_SURFACES = ['writer', 'summary', 'editor', 'review', 'inspector', 'learning', 'navigator', 'universal'] as const;
export const CREATIVE_RULE_SOURCES = ['author', 'imported', 'ai_suggested_then_confirmed'] as const;
export const REGISTERED_CREATIVE_EVALUATOR_KEYS = ['sentence_length_variation', 'sentence_ending_variety', 'paragraph_rhythm', 'dialogue_density'] as const;

export type CreativeRuleMode = typeof CREATIVE_RULE_MODES[number];
export type CreativeTechniqueCategory = typeof CREATIVE_TECHNIQUE_CATEGORIES[number];
export type CreativeRuleSurface = typeof CREATIVE_RULE_SURFACES[number];
export type CreativeRuleSource = typeof CREATIVE_RULE_SOURCES[number];
export type RegisteredCreativeEvaluatorKey = typeof REGISTERED_CREATIVE_EVALUATOR_KEYS[number];

export const CREATIVE_TECHNIQUE_KEYS = [
  'show_dont_tell', 'sensory_detail', 'emotional_indirection', 'direct_emotion', 'dialogue_density',
  'distinct_character_voice', 'subtext_in_dialogue', 'sentence_length_variation', 'sentence_ending_variety',
  'paragraph_rhythm', 'poetic_imagery', 'dry_narration', 'scene_focus_change', 'scene_sequel_rhythm',
  'opening_hook', 'chapter_end_hook', 'quiet_chapter_ending', 'cliffhanger', 'staged_information_reveal',
  'fair_play_clues', 'foreshadow_and_payoff', 'tension_escalation', 'tension_release', 'causal_progression',
  'three_act_structure', 'kishotenketsu', 'character_arc', 'reversal_catharsis',
] as const;
export type CreativeTechniqueKey = typeof CREATIVE_TECHNIQUE_KEYS[number];

export interface CreativeTechniqueDefinition {
  key: CreativeTechniqueKey;
  category: CreativeTechniqueCategory;
  label: string;
  shortDescription: string;
  guidance: { reference: string; required: string; forbidden: string };
  applicableSurfaces: readonly CreativeRuleSurface[];
  fallbackSectionKey?: string;
  evaluatorKey?: RegisteredCreativeEvaluatorKey;
  relatedGenreTags?: readonly string[];
  conflictKeys?: readonly CreativeTechniqueKey[];
  catalogContractVersion: number;
}

interface CreativeRuleBase {
  id: string;
  priority: number;
  overridable: boolean;
  notes?: string | null;
  source: CreativeRuleSource;
  active: boolean;
}

export interface BuiltinCreativeRuleAdoption extends CreativeRuleBase {
  kind: 'builtin';
  techniqueKey: CreativeTechniqueKey | string;
  mode: CreativeRuleMode;
  authorAdjustment?: string | null;
}

export interface CustomCreativeRule extends CreativeRuleBase {
  kind: 'custom';
  title: string;
  instruction: string;
  category: CreativeTechniqueCategory;
  mode: Exclude<CreativeRuleMode, 'off'> | 'off';
}

export type ProjectCreativeRule = BuiltinCreativeRuleAdoption | CustomCreativeRule;

export interface CreativeRuleValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface CreativeRulePromptEntry {
  stableId: string;
  kind: ProjectCreativeRule['kind'];
  techniqueKey?: CreativeTechniqueKey;
  title: string;
  category: CreativeTechniqueCategory;
  mode: Exclude<CreativeRuleMode, 'off'>;
  guidance: string;
  authorAdjustment?: string | null;
  notes?: string | null;
  priority: number;
  overridable: boolean;
  source: CreativeRuleSource;
  semanticContractVersion: number;
}

export interface CreativeRuleConflict {
  code: 'catalog_conflict';
  ruleIds: [string, string];
  techniqueKeys: [CreativeTechniqueKey, CreativeTechniqueKey];
  message: string;
}

export interface ResolvedCreativeRuleSet {
  activeGuidanceRules: CreativeRulePromptEntry[];
  suppressedTechniqueKeys: CreativeTechniqueKey[];
  conflicts: CreativeRuleConflict[];
  omitted: string[];
  validationIssues: CreativeRuleValidationIssue[];
}
