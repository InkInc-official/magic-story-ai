import { createHash } from 'node:crypto';
import { STORY_MEANING_CONTEXT_VERSION, type ChapterMeaningContext, type MeaningClaim, type MeaningEvidence } from './types';

export const STORY_MEANING_PROMPT_VERSION = 'meaning-prompt-v1' as const;
export const STORY_MEANING_RUN_STATUSES = ['pending', 'completed', 'failed'] as const;
export type StoryMeaningRunStatus = typeof STORY_MEANING_RUN_STATUSES[number];
export const STORY_MEANING_PROVENANCES = ['ai_analysis', 'author_confirmed', 'author_edited', 'author_added'] as const;
export type StoryMeaningProvenance = typeof STORY_MEANING_PROVENANCES[number];
export const STORY_MEANING_DECISIONS = ['adopted', 'alternative', 'held', 'not_applicable'] as const;
export type StoryMeaningDecisionValue = typeof STORY_MEANING_DECISIONS[number];

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, stable(item)]));
  return value;
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function buildStoryMeaningClaimFingerprint(claim: MeaningClaim, evidence: MeaningEvidence[]): string {
  const byKey = new Map(evidence.map(item => [item.localEvidenceKey, item]));
  const groundedEvidence = claim.evidenceRefs.map(key => {
    const item = byKey.get(key);
    if (!item) throw new Error(`Claim Evidenceが見つかりません: ${key}`);
    return {
      chapterId: item.chapterId,
      startOffset: item.startOffset,
      endOffset: item.endOffset,
      exactExcerpt: item.exactExcerpt,
      evidenceType: item.evidenceType,
    };
  }).sort((left, right) => left.chapterId.localeCompare(right.chapterId)
    || left.startOffset - right.startOffset || left.endOffset - right.endOffset
    || left.exactExcerpt.localeCompare(right.exactExcerpt) || left.evidenceType.localeCompare(right.evidenceType));
  const relatedEntityRefs = [...claim.relatedEntityRefs]
    .map(value => ({ type: value.type, id: value.id }))
    .sort((left, right) => left.type.localeCompare(right.type) || left.id.localeCompare(right.id));
  return hash({
    layer: claim.layer,
    dimension: claim.dimension,
    subtype: claim.subtype || null,
    statement: claim.statement,
    impactScope: claim.impactScope || null,
    supportLevel: claim.supportLevel,
    evidence: groundedEvidence,
    relatedEntityRefs,
  });
}

export interface MeaningFreshness {
  contentHash: string;
  contextFingerprint: string;
  fingerprintVersion: string;
}

export function storyMeaningRunIsFresh(run: MeaningFreshness, current: MeaningFreshness): boolean {
  return run.contentHash === current.contentHash
    && run.contextFingerprint === current.contextFingerprint
    && run.fingerprintVersion === STORY_MEANING_CONTEXT_VERSION
    && current.fingerprintVersion === STORY_MEANING_CONTEXT_VERSION;
}

export function storyMeaningDecisionIsFresh(
  decision: { claimFingerprint: string; decidedAgainstContentHash: string; decidedAgainstContextFingerprint: string; fingerprintVersion: string },
  claim: { claimFingerprint: string },
  current: MeaningFreshness,
): boolean {
  return decision.claimFingerprint === claim.claimFingerprint
    && decision.decidedAgainstContentHash === current.contentHash
    && decision.decidedAgainstContextFingerprint === current.contextFingerprint
    && decision.fingerprintVersion === STORY_MEANING_CONTEXT_VERSION
    && current.fingerprintVersion === STORY_MEANING_CONTEXT_VERSION;
}

export function buildStoryMeaningSourceManifest(context: ChapterMeaningContext) {
  const payload = context.semanticPayload;
  return {
    version: STORY_MEANING_CONTEXT_VERSION,
    targetChapterId: context.targetChapterId,
    includedSections: context.manifest.included,
    omittedSections: context.manifest.omitted,
    sources: {
      characterIds: payload.actualCanonical.characters.map(value => value.id),
      narratorIds: payload.actualCanonical.narrators.map(value => value.id),
      castCharacterIds: payload.actualCanonical.cast.map(value => value.characterId),
      storyFactIds: payload.actualCanonical.facts.map(value => value.id),
      characterKnowledgeIds: payload.actualCanonical.knowledge.map(value => value.id),
      relationshipIds: payload.actualCanonical.relationships.map(value => value.id),
      plotIds: payload.planned.plots.map(value => value.id),
      foreshadowingIds: payload.planned.foreshadowings.map(value => value.id),
      creativeRuleIds: payload.interpretiveLens.creativeRules.map(value => value.id),
    },
    contentHash: context.contentHash,
    contextFingerprint: context.contextFingerprint,
  };
}
