import {
  MEANING_CLAIM_LAYERS, MEANING_DIMENSIONS, MEANING_ENTITY_TYPES, MEANING_IMPACT_SCOPES,
  MEANING_OUTPUT_BOUNDS, MEANING_SUBTYPES, MEANING_SUPPORT_LEVELS, STORY_MEANING_OUTPUT_SCHEMA_VERSION,
  type ChapterMeaningAnalysisOutput, type MeaningClaimLayer, type MeaningDimension, type MeaningEntityType,
  type MeaningClaim, type MeaningEvent, type MeaningSupportLevel,
} from './types';

export type MeaningValidationCode =
  | 'invalid_type' | 'unknown_key' | 'invalid_value' | 'invalid_range' | 'invalid_utf16_boundary'
  | 'excerpt_mismatch' | 'wrong_chapter' | 'missing_primary' | 'duplicate_key' | 'missing_evidence_ref'
  | 'unknown_entity' | 'output_bound_exceeded' | 'invalid_layer_support' | 'invalid_subtype';

export class StoryMeaningValidationError extends Error {
  constructor(public readonly code: MeaningValidationCode, public readonly path: string, message: string) {
    super(message);
    this.name = 'StoryMeaningValidationError';
  }
}

export interface MeaningValidationOptions {
  knownEntityIds?: Partial<Record<MeaningEntityType, ReadonlySet<string>>>;
}

const layerSupports: Record<MeaningClaimLayer, ReadonlySet<MeaningSupportLevel>> = {
  observed: new Set(['explicit_text', 'strongly_supported']),
  derived: new Set(['strongly_supported', 'plausible_interpretation']),
  interpretive: new Set(['strongly_supported', 'plausible_interpretation', 'uncertain']),
};

function fail(code: MeaningValidationCode, path: string, message: string): never {
  throw new StoryMeaningValidationError(code, path, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_type', path, 'objectが必要です。');
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: readonly string[], path: string) {
  const unknown = Object.keys(value).find(key => !allowed.includes(key));
  if (unknown) fail('unknown_key', `${path}.${unknown}`, '未定義のfieldです。');
}

function array(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value)) fail('invalid_type', path, 'arrayが必要です。');
  if (value.length > max) fail('output_bound_exceeded', path, `最大${max}件です。`);
  return value;
}

function string(value: unknown, path: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) fail('invalid_type', path, '空でないstringが必要です。');
  if (value.length > max) fail('output_bound_exceeded', path, `最大${max}文字です。`);
  return value;
}

function rawNonEmptyString(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.length === 0) fail('invalid_type', path, '空でないstringが必要です。');
  if (value.length > max) fail('output_bound_exceeded', path, `最大${max}文字です。`);
  return value;
}

function enumeration<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail('invalid_value', path, '許可されていない値です。');
  return value as T;
}

export function isWellFormedUtf16Boundary(source: string, offset: number): boolean {
  if (!Number.isInteger(offset) || offset < 0 || offset > source.length) return false;
  if (offset === 0 || offset === source.length) return true;
  const before = source.charCodeAt(offset - 1);
  const after = source.charCodeAt(offset);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}

function entityRef(value: unknown, path: string, options: MeaningValidationOptions) {
  const item = record(value, path);
  keys(item, ['type', 'id'], path);
  const type = enumeration(item.type, MEANING_ENTITY_TYPES, `${path}.type`);
  const id = string(item.id, `${path}.id`, 200);
  const allowed = options.knownEntityIds?.[type];
  if (allowed && !allowed.has(id)) fail('unknown_entity', `${path}.id`, 'Contextに存在しないentity IDです。');
  return { type, id };
}

function uniqueKeys(values: string[], path: string) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) fail('duplicate_key', `${path}[${index}]`, 'local keyが重複しています。');
    seen.add(value);
  });
}

function validateEvent(value: unknown, index: number, chapter: { id: string; content: string }, options: MeaningValidationOptions): MeaningEvent {
  const path = `events[${index}]`;
  const item = record(value, path);
  keys(item, ['localEventKey', 'summary', 'evidence', 'actorRefs', 'claims'], path);
  const localEventKey = string(item.localEventKey, `${path}.localEventKey`, MEANING_OUTPUT_BOUNDS.keyCharacters);
  const summary = string(item.summary, `${path}.summary`, MEANING_OUTPUT_BOUNDS.summaryCharacters);
  const evidence = array(item.evidence, `${path}.evidence`, MEANING_OUTPUT_BOUNDS.evidencePerEvent).map((raw, evidenceIndex) => {
    const evidencePath = `${path}.evidence[${evidenceIndex}]`;
    const evidenceItem = record(raw, evidencePath);
    keys(evidenceItem, ['localEvidenceKey', 'chapterId', 'startOffset', 'endOffset', 'exactExcerpt', 'evidenceType'], evidencePath);
    const localEvidenceKey = string(evidenceItem.localEvidenceKey, `${evidencePath}.localEvidenceKey`, MEANING_OUTPUT_BOUNDS.keyCharacters);
    const chapterId = string(evidenceItem.chapterId, `${evidencePath}.chapterId`, 200);
    if (chapterId !== chapter.id) fail('wrong_chapter', `${evidencePath}.chapterId`, '対象章以外のEvidenceです。');
    const startOffset = evidenceItem.startOffset;
    const endOffset = evidenceItem.endOffset;
    if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || (startOffset as number) < 0 || (endOffset as number) <= (startOffset as number) || (endOffset as number) > chapter.content.length) {
      fail('invalid_range', evidencePath, 'UTF-16 rangeが不正です。');
    }
    if (!isWellFormedUtf16Boundary(chapter.content, startOffset as number) || !isWellFormedUtf16Boundary(chapter.content, endOffset as number)) {
      fail('invalid_utf16_boundary', evidencePath, 'surrogate pair内部のoffsetは使用できません。');
    }
    const exactExcerpt = rawNonEmptyString(evidenceItem.exactExcerpt, `${evidencePath}.exactExcerpt`, MEANING_OUTPUT_BOUNDS.excerptCharacters);
    if (chapter.content.slice(startOffset as number, endOffset as number) !== exactExcerpt) fail('excerpt_mismatch', `${evidencePath}.exactExcerpt`, '本文sliceと一致しません。');
    const evidenceType = enumeration(evidenceItem.evidenceType, ['primary', 'supporting'] as const, `${evidencePath}.evidenceType`);
    return { localEvidenceKey, chapterId, startOffset: startOffset as number, endOffset: endOffset as number, exactExcerpt, evidenceType };
  });
  if (!evidence.some(value => value.evidenceType === 'primary')) fail('missing_primary', `${path}.evidence`, 'primary Evidenceが必要です。');
  uniqueKeys(evidence.map(value => value.localEvidenceKey), `${path}.evidence`);
  const evidenceIds = new Set(evidence.map(value => value.localEvidenceKey));
  const actorRefs = array(item.actorRefs, `${path}.actorRefs`, MEANING_OUTPUT_BOUNDS.actorRefsPerEvent).map((raw, actorIndex) => entityRef(raw, `${path}.actorRefs[${actorIndex}]`, options));
  const claims = array(item.claims, `${path}.claims`, MEANING_OUTPUT_BOUNDS.claimsPerEvent).map((raw, claimIndex) => {
    const claimPath = `${path}.claims[${claimIndex}]`;
    const claim = record(raw, claimPath);
    keys(claim, ['localClaimKey', 'layer', 'dimension', 'statement', 'supportLevel', 'evidenceRefs', 'relatedEntityRefs', 'impactScope', 'subtype'], claimPath);
    const localClaimKey = string(claim.localClaimKey, `${claimPath}.localClaimKey`, MEANING_OUTPUT_BOUNDS.keyCharacters);
    const layer = enumeration(claim.layer, MEANING_CLAIM_LAYERS, `${claimPath}.layer`);
    const dimension = enumeration(claim.dimension, MEANING_DIMENSIONS, `${claimPath}.dimension`);
    const statement = string(claim.statement, `${claimPath}.statement`, MEANING_OUTPUT_BOUNDS.statementCharacters);
    const supportLevel = enumeration(claim.supportLevel, MEANING_SUPPORT_LEVELS, `${claimPath}.supportLevel`);
    if (!layerSupports[layer].has(supportLevel)) fail('invalid_layer_support', `${claimPath}.supportLevel`, 'layerとsupport levelの組合せが不正です。');
    const evidenceRefs = array(claim.evidenceRefs, `${claimPath}.evidenceRefs`, MEANING_OUTPUT_BOUNDS.evidencePerEvent).map((ref, refIndex) => string(ref, `${claimPath}.evidenceRefs[${refIndex}]`, MEANING_OUTPUT_BOUNDS.keyCharacters));
    if (evidenceRefs.length === 0) fail('missing_evidence_ref', `${claimPath}.evidenceRefs`, 'ClaimはEvidence参照が必要です。');
    evidenceRefs.forEach((ref, refIndex) => { if (!evidenceIds.has(ref)) fail('missing_evidence_ref', `${claimPath}.evidenceRefs[${refIndex}]`, '同一Event内にEvidenceがありません。'); });
    uniqueKeys(evidenceRefs, `${claimPath}.evidenceRefs`);
    const relatedEntityRefs = array(claim.relatedEntityRefs, `${claimPath}.relatedEntityRefs`, MEANING_OUTPUT_BOUNDS.entityRefsPerClaim).map((ref, refIndex) => entityRef(ref, `${claimPath}.relatedEntityRefs[${refIndex}]`, options));
    const impactScope = claim.impactScope === undefined ? undefined : enumeration(claim.impactScope, MEANING_IMPACT_SCOPES, `${claimPath}.impactScope`);
    let subtype: MeaningClaim['subtype'];
    if (claim.subtype !== undefined) {
      const allowed = MEANING_SUBTYPES[dimension as keyof typeof MEANING_SUBTYPES];
      if (!allowed || typeof claim.subtype !== 'string' || !(allowed as readonly string[]).includes(claim.subtype)) fail('invalid_subtype', `${claimPath}.subtype`, 'dimension固有のsubtypeではありません。');
      subtype = claim.subtype as MeaningClaim['subtype'];
    }
    const result: MeaningClaim = { localClaimKey, layer, dimension, statement, supportLevel, evidenceRefs, relatedEntityRefs };
    if (impactScope) result.impactScope = impactScope;
    if (subtype) result.subtype = subtype;
    return result;
  });
  uniqueKeys(claims.map(value => value.localClaimKey), `${path}.claims`);
  return { localEventKey, summary, evidence, actorRefs, claims };
}

function eventOffset(event: MeaningEvent): number {
  return Math.min(...event.evidence.filter(value => value.evidenceType === 'primary').map(value => value.startOffset));
}

export function validateChapterMeaningAnalysisOutput(
  raw: unknown,
  chapter: { id: string; content: string },
  options: MeaningValidationOptions = {},
): ChapterMeaningAnalysisOutput {
  const root = record(raw, '$');
  keys(root, ['schemaVersion', 'events'], '$');
  if (root.schemaVersion !== STORY_MEANING_OUTPUT_SCHEMA_VERSION) fail('invalid_value', '$.schemaVersion', '未対応のschema versionです。');
  const events = array(root.events, 'events', MEANING_OUTPUT_BOUNDS.events).map((value, index) => validateEvent(value, index, chapter, options));
  uniqueKeys(events.map(value => value.localEventKey), 'events');
  const evidenceKeys = events.flatMap(value => value.evidence.map(evidence => evidence.localEvidenceKey));
  const claimKeys = events.flatMap(value => value.claims.map(claim => claim.localClaimKey));
  uniqueKeys(evidenceKeys, 'events.*.evidence');
  uniqueKeys(claimKeys, 'events.*.claims');
  events.forEach(event => {
    event.evidence.sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset || left.localEvidenceKey.localeCompare(right.localEvidenceKey));
    event.claims.sort((left, right) => left.localClaimKey.localeCompare(right.localClaimKey));
  });
  events.sort((left, right) => eventOffset(left) - eventOffset(right) || left.localEventKey.localeCompare(right.localEventKey));
  return { schemaVersion: STORY_MEANING_OUTPUT_SCHEMA_VERSION, events };
}

export interface DuplicateMeaningEventDiagnostic {
  code: 'duplicate_event_candidate';
  eventKeys: [string, string];
  primaryEvidenceSignature: string;
}

export function findDuplicateMeaningEvents(events: MeaningEvent[]): DuplicateMeaningEventDiagnostic[] {
  const bySignature = new Map<string, string[]>();
  events.forEach(event => {
    const signature = event.evidence.filter(value => value.evidenceType === 'primary')
      .map(value => `${value.chapterId}:${value.startOffset}:${value.endOffset}:${value.exactExcerpt}`)
      .sort().join('|');
    const keys = bySignature.get(signature) || [];
    keys.push(event.localEventKey);
    bySignature.set(signature, keys);
  });
  return [...bySignature.entries()].flatMap(([primaryEvidenceSignature, eventKeys]) => eventKeys.slice(1).map((eventKey, index) => ({
    code: 'duplicate_event_candidate' as const,
    eventKeys: [eventKeys[index], eventKey] as [string, string],
    primaryEvidenceSignature,
  })));
}
