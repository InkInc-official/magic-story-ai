export const STORY_MEANING_CONTEXT_VERSION = 'meaning-v1' as const;
export const STORY_MEANING_OUTPUT_SCHEMA_VERSION = 1 as const;

export const MEANING_DIMENSIONS = [
  'external_tension', 'emotional_intensity', 'narrative_significance', 'state_change',
  'turning_point', 'truth_revelation', 'relationship_change', 'decision_commitment',
  'resolution', 'aftermath', 'reader_knowledge_change', 'character_knowledge_change',
  'thematic_significance', 'character_trajectory', 'other',
] as const;
export type MeaningDimension = typeof MEANING_DIMENSIONS[number];

export const MEANING_CLAIM_LAYERS = ['observed', 'derived', 'interpretive'] as const;
export type MeaningClaimLayer = typeof MEANING_CLAIM_LAYERS[number];
export const MEANING_SUPPORT_LEVELS = ['explicit_text', 'strongly_supported', 'plausible_interpretation', 'uncertain'] as const;
export type MeaningSupportLevel = typeof MEANING_SUPPORT_LEVELS[number];
export const MEANING_IMPACT_SCOPES = ['local', 'chapter', 'multi_chapter', 'whole_work', 'unknown'] as const;
export type MeaningImpactScope = typeof MEANING_IMPACT_SCOPES[number];
export const MEANING_ENTITY_TYPES = ['character', 'story_fact', 'relationship', 'plot', 'foreshadowing'] as const;
export type MeaningEntityType = typeof MEANING_ENTITY_TYPES[number];

export const MEANING_SUBTYPES = {
  state_change: ['knowledge', 'relationship', 'goal', 'commitment', 'physical_condition', 'location', 'possession_resource', 'authority_status', 'threat_opportunity', 'constraint', 'social_world_state', 'other'],
  truth_revelation: ['reader_learns', 'pov_character_learns', 'other_character_learns', 'narrator_reveals', 'claim_introduced', 'false_belief_introduced', 'false_belief_corrected', 'truth_uncertain'],
  reader_knowledge_change: ['reader_learns', 'reader_reconsiders', 'reader_uncertain'],
  character_knowledge_change: ['character_learns', 'character_suspects', 'false_belief_introduced', 'false_belief_corrected', 'knowledge_uncertain'],
  resolution: ['external', 'emotional', 'relationship', 'knowledge', 'thematic', 'partial', 'apparent_temporary'],
  aftermath: ['consequence_processing', 'emotional_settling', 'relationship_renegotiation', 'meaning_consolidation', 'new_normal_establishment', 'unresolved_residue'],
  character_trajectory: ['positive_change', 'negative_change', 'stagnation', 'regression', 'repetition', 'failed_change', 'temporary_change', 'self_recognition', 'reader_understanding_change', 'relationship_driven_change', 'stable_catalyst'],
} as const;

export type MeaningSubtypeDimension = keyof typeof MEANING_SUBTYPES;
export type MeaningSubtype = typeof MEANING_SUBTYPES[MeaningSubtypeDimension][number];

export interface MeaningEntityRef {
  type: MeaningEntityType;
  id: string;
}

export interface MeaningEvidence {
  localEvidenceKey: string;
  chapterId: string;
  startOffset: number;
  endOffset: number;
  exactExcerpt: string;
  evidenceType: 'primary' | 'supporting';
}

export interface MeaningClaim {
  localClaimKey: string;
  layer: MeaningClaimLayer;
  dimension: MeaningDimension;
  statement: string;
  supportLevel: MeaningSupportLevel;
  evidenceRefs: string[];
  relatedEntityRefs: MeaningEntityRef[];
  impactScope?: MeaningImpactScope;
  subtype?: MeaningSubtype;
}

export interface MeaningEvent {
  localEventKey: string;
  summary: string;
  evidence: MeaningEvidence[];
  actorRefs: MeaningEntityRef[];
  claims: MeaningClaim[];
}

export interface ChapterMeaningAnalysisOutput {
  schemaVersion: typeof STORY_MEANING_OUTPUT_SCHEMA_VERSION;
  events: MeaningEvent[];
}

export const MEANING_OUTPUT_BOUNDS = {
  events: 30,
  evidencePerEvent: 8,
  claimsPerEvent: 16,
  entityRefsPerClaim: 32,
  actorRefsPerEvent: 32,
  keyCharacters: 120,
  summaryCharacters: 500,
  statementCharacters: 1_000,
  excerptCharacters: 2_000,
} as const;

export type MeaningReaderState = 'reader_known' | 'reveal_now' | 'reader_hidden';
export type MeaningKnowledgeStatus = 'unknown' | 'suspects' | 'believes_false' | 'knows';

export interface MeaningContextProject {
  id: string;
  title: string;
  genre?: string;
  authorIntent?: string;
}

export interface MeaningContextChapter {
  id: string;
  projectId: string;
  order: number;
  title: string;
  content: string;
  purpose?: string;
  povCharacterId?: string | null;
  narratorId?: string | null;
}

export interface MeaningContextCharacter {
  id: string;
  name: string;
  role?: string;
  relevant?: boolean;
}

export interface MeaningContextNarrator {
  id: string;
  name: string;
  linkedCharacterId?: string | null;
  identityDisclosureMode?: string;
  relevant?: boolean;
}

export interface MeaningContextCastMember {
  characterId: string;
  participation?: string;
  notes?: string;
  relevant?: boolean;
}

export interface MeaningContextFact {
  id: string;
  content: string;
  readerState: MeaningReaderState;
  importance?: string;
  relevant?: boolean;
}

export interface MeaningContextKnowledge {
  id: string;
  factId: string;
  characterId: string;
  status: MeaningKnowledgeStatus;
  phase: 'before_chapter' | 'during_chapter';
  beliefNotes?: string;
  notes?: string;
  relevant?: boolean;
}

export interface MeaningContextRelationship {
  id: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  relationship: string;
  notes?: string;
  relevant?: boolean;
}

export interface MeaningContextPlot {
  id: string;
  title: string;
  content: string;
  status?: string;
  relevant?: boolean;
}

export interface MeaningContextForeshadowing {
  id: string;
  title: string;
  content: string;
  status?: string;
  relevant?: boolean;
}

export interface MeaningContextCreativeRule {
  id: string;
  title: string;
  guidance: string;
  mode?: string;
  authorAdjustment?: string;
  relevant?: boolean;
}

export interface BuildChapterMeaningContextInput {
  project: MeaningContextProject;
  chapter: MeaningContextChapter;
  characters?: MeaningContextCharacter[];
  narrators?: MeaningContextNarrator[];
  cast?: MeaningContextCastMember[];
  facts?: MeaningContextFact[];
  knowledge?: MeaningContextKnowledge[];
  relationships?: MeaningContextRelationship[];
  plots?: MeaningContextPlot[];
  foreshadowings?: MeaningContextForeshadowing[];
  creativeRules?: MeaningContextCreativeRule[];
}

export interface MeaningSemanticPayload {
  version: typeof STORY_MEANING_CONTEXT_VERSION;
  target: Omit<MeaningContextChapter, 'content'> & { projectTitle: string };
  actualCanonical: {
    characters: MeaningContextCharacter[];
    narrators: MeaningContextNarrator[];
    cast: MeaningContextCastMember[];
    facts: MeaningContextFact[];
    knowledge: MeaningContextKnowledge[];
    relationships: MeaningContextRelationship[];
  };
  planned: {
    plots: MeaningContextPlot[];
    foreshadowings: MeaningContextForeshadowing[];
  };
  authorIntent: string;
  interpretiveLens: {
    genre: string;
    creativeRules: MeaningContextCreativeRule[];
  };
}

export interface ChapterMeaningContext {
  version: typeof STORY_MEANING_CONTEXT_VERSION;
  targetChapterId: string;
  targetChapterText: string;
  supplementalContext: string;
  semanticPayload: MeaningSemanticPayload;
  contentHash: string;
  contextFingerprint: string;
  manifest: {
    included: string[];
    omitted: string[];
  };
}
