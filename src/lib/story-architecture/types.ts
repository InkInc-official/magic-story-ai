export const STORY_ARCHITECTURE_FRAMEWORK_MODES = ['freeform', 'custom'] as const;
export const STORY_ARCHITECTURE_CANON_MODES = ['respect_current_canon', 'revise_canon'] as const;
export const STORY_ARCHITECTURE_DESIGN_STATUSES = ['draft', 'proposed', 'approved', 'retired'] as const;
export const STORY_ARCHITECTURE_PROVENANCES = ['author', 'ai_proposal', 'imported'] as const;
export const STORY_ARCHITECTURE_DECISIONS = ['approved', 'rejected', 'held'] as const;
export const STORY_ARCHITECTURE_THREAD_TYPES = ['character', 'relationship', 'mystery', 'conflict', 'theme', 'world', 'information', 'goal', 'custom'] as const;
export const STORY_ARCHITECTURE_RHYTHMS = ['build', 'release', 'quiet', 'aftermath', 'uncertainty', 'transition', 'custom'] as const;
export const STORY_ARCHITECTURE_CONSTRAINT_MODES = ['required', 'forbidden', 'preferred'] as const;
export const STORY_ARCHITECTURE_SCOPES = ['architecture', 'thread', 'beat'] as const;
export const STORY_ARCHITECTURE_QUESTION_STATES = ['open', 'deferred', 'resolved'] as const;
export const STORY_ARCHITECTURE_RELATION_TYPES = ['precedes', 'depends_on', 'causes', 'enables'] as const;
export const STORY_ARCHITECTURE_ITEM_TYPES = ['thread', 'beat', 'constraint', 'question'] as const;

export type StoryArchitectureFrameworkMode = typeof STORY_ARCHITECTURE_FRAMEWORK_MODES[number];
export type StoryArchitectureCanonMode = typeof STORY_ARCHITECTURE_CANON_MODES[number];
export type StoryArchitectureDesignStatus = typeof STORY_ARCHITECTURE_DESIGN_STATUSES[number];
export type StoryArchitectureProvenance = typeof STORY_ARCHITECTURE_PROVENANCES[number];
export type StoryArchitectureDecisionValue = typeof STORY_ARCHITECTURE_DECISIONS[number];
export type StoryArchitectureThreadType = typeof STORY_ARCHITECTURE_THREAD_TYPES[number];
export type StoryArchitectureRhythm = typeof STORY_ARCHITECTURE_RHYTHMS[number];
export type StoryArchitectureConstraintMode = typeof STORY_ARCHITECTURE_CONSTRAINT_MODES[number];
export type StoryArchitectureScope = typeof STORY_ARCHITECTURE_SCOPES[number];
export type StoryArchitectureQuestionState = typeof STORY_ARCHITECTURE_QUESTION_STATES[number];
export type StoryArchitectureRelationType = typeof STORY_ARCHITECTURE_RELATION_TYPES[number];
export type StoryArchitectureItemType = typeof STORY_ARCHITECTURE_ITEM_TYPES[number];

export interface StoryArchitectureItemBase {
  id: string;
  architectureId: string;
  status: StoryArchitectureDesignStatus;
  provenance: StoryArchitectureProvenance;
  revision: number;
  proposalAlternativeId?: string | null;
}

/** A continuing line of design, not merely a folder and not a required arc. */
export interface StoryArchitectureThread extends StoryArchitectureItemBase {
  title: string;
  description: string;
  threadType: StoryArchitectureThreadType;
  customTypeLabel: string | null;
  order: number;
}

/** A planned meaningful change. It is not a Chapter, Scene, Meaning Event, or StoryFact. */
export interface StoryArchitectureBeat extends StoryArchitectureItemBase {
  threadId: string | null;
  title: string;
  summary: string;
  intention: string;
  storyOrder: number | null;
  presentationOrder: number | null;
  chapterId: string | null;
  rhythm: StoryArchitectureRhythm | null;
  customRhythmLabel: string | null;
}

/** A story-design requirement, distinct from CreativeRule and NarrativeRule. */
export interface StoryArchitectureConstraint extends StoryArchitectureItemBase {
  title: string;
  statement: string;
  mode: StoryArchitectureConstraintMode;
  scope: StoryArchitectureScope;
  threadId: string | null;
  beatId: string | null;
  order: number;
}

/** An intentionally unresolved design question. Open and deferred are valid states. */
export interface StoryArchitectureQuestion extends StoryArchitectureItemBase {
  question: string;
  notes: string;
  state: StoryArchitectureQuestionState;
  resolution: string | null;
  scope: StoryArchitectureScope;
  threadId: string | null;
  beatId: string | null;
  order: number;
}

export interface StoryArchitectureBeatRelation {
  id: string;
  architectureId: string;
  fromBeatId: string;
  toBeatId: string;
  type: StoryArchitectureRelationType;
  proposalAlternativeId?: string | null;
}

/** Append-only persistence is introduced later; this contract preserves source-item identity. */
export interface StoryArchitectureDecision {
  id: string;
  architectureId: string;
  itemType: StoryArchitectureItemType;
  itemId: string;
  decision: StoryArchitectureDecisionValue;
  note: string;
}

/**
 * Pure JSON aggregate. Approved items remain design data: approval never makes
 * them Canon and never means they have been applied to another model.
 */
export interface StoryArchitecture {
  id: string;
  projectId: string;
  title: string;
  frameworkMode: StoryArchitectureFrameworkMode;
  customFrameworkNotes: string;
  canonMode: StoryArchitectureCanonMode;
  notes: string;
  revision: number;
  threads: StoryArchitectureThread[];
  beats: StoryArchitectureBeat[];
  constraints: StoryArchitectureConstraint[];
  questions: StoryArchitectureQuestion[];
  relations: StoryArchitectureBeatRelation[];
  decisions: StoryArchitectureDecision[];
}
