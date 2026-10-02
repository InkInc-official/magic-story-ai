import type { buildInspectorContext } from './inspector-context';

export const INSPECTOR_SCHEMA_VERSION = 1;
export const INSPECTOR_MAX_ISSUES = 30;
export const INSPECTOR_CATEGORIES = ['viewpoint', 'knowledge', 'voice', 'narrative_rule'] as const;
export const INSPECTOR_ISSUE_TYPES = [
  'pov_shift', 'other_character_inner_state', 'narrator_pov_confusion', 'perspective_mismatch',
  'unknown_fact_assertion', 'reader_hidden_leak', 'future_knowledge', 'belief_truth_conflict', 'knowledge_timing_unclear',
  'first_person_mismatch', 'address_term_mismatch', 'speech_register_mismatch', 'speech_style_mismatch', 'narration_voice_mismatch', 'speaker_unclear',
  'required_rule_missing', 'forbidden_rule_violation', 'rule_conflict', 'rule_application_unclear',
] as const;
export const INSPECTOR_SEVERITIES = ['problem', 'check', 'suggestion'] as const;
export const INSPECTOR_LOCATION_KINDS = ['excerpt', 'chapter'] as const;

export type InspectorCategory = typeof INSPECTOR_CATEGORIES[number];
export type InspectorIssueType = typeof INSPECTOR_ISSUE_TYPES[number];
export type InspectorSeverity = typeof INSPECTOR_SEVERITIES[number];
export type InspectorLocationKind = typeof INSPECTOR_LOCATION_KINDS[number];
export type BuiltInspectorContext = ReturnType<typeof buildInspectorContext>;

export interface NarrativeInspectorIssue {
  category: InspectorCategory;
  issueType: InspectorIssueType;
  locationKind: InspectorLocationKind;
  excerpt: string;
  startOffset: number;
  endOffset: number;
  explanation: string;
  suggestedDirection: string;
  severity: InspectorSeverity;
  evidenceRefs: string[];
  adjustments: string[];
}

export interface NarrativeInspectorResult {
  schemaVersion: 1;
  issues: NarrativeInspectorIssue[];
}

export class NarrativeInspectorError extends Error {
  constructor(public code: 'ai_failure' | 'empty_response' | 'invalid_json' | 'invalid_schema', message: string) { super(message); }
}

const ISSUE_TYPE_CATEGORY: Record<InspectorIssueType, InspectorCategory> = {
  pov_shift: 'viewpoint', other_character_inner_state: 'viewpoint', narrator_pov_confusion: 'viewpoint', perspective_mismatch: 'viewpoint',
  unknown_fact_assertion: 'knowledge', reader_hidden_leak: 'knowledge', future_knowledge: 'knowledge', belief_truth_conflict: 'knowledge', knowledge_timing_unclear: 'knowledge',
  first_person_mismatch: 'voice', address_term_mismatch: 'voice', speech_register_mismatch: 'voice', speech_style_mismatch: 'voice', narration_voice_mismatch: 'voice', speaker_unclear: 'voice',
  required_rule_missing: 'narrative_rule', forbidden_rule_violation: 'narrative_rule', rule_conflict: 'narrative_rule', rule_application_unclear: 'narrative_rule',
};

function exactJsonCandidates(raw: string) {
  const trimmed = raw.trim();
  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1].trim());
  const first = trimmed.indexOf('{'); const last = trimmed.lastIndexOf('}');
  return [...new Set([trimmed, ...fenced, first >= 0 && last > first ? trimmed.slice(first, last + 1) : ''].filter(Boolean))];
}

function stringField(value: unknown, key: string, max: number, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new NarrativeInspectorError('invalid_schema', `${key}が不正です`);
  return value;
}

export function allowedInspectorEvidenceRefs(context: BuiltInspectorContext): Set<string> {
  const refs = new Set<string>();
  if (context.manifest.perspectiveSource !== 'unspecified') refs.add(`perspective:${context.manifest.perspectiveSource}`);
  if (context.roles.narrator) refs.add(`narrator:${context.roles.narrator.id}`);
  if (context.roles.pov) refs.add(`pov:${context.roles.pov.id}`);
  context.voices.characters.forEach(character => refs.add(`character:${character.id}`));
  context.voices.relationships.forEach(relationship => refs.add(`relationship:${relationship.id}`));
  context.rules.forEach(rule => refs.add(`rule:${rule.id}`));
  context.knowledge.authorTruth.forEach(fact => refs.add(`fact:${fact.id}`));
  context.manifest.characterKnowledge.forEach(event => refs.add(`knowledge:${event.id}`));
  return refs;
}

export function validateNarrativeInspectorOutput(value: unknown, context: BuiltInspectorContext): NarrativeInspectorResult {
  if (!value || typeof value !== 'object') throw new NarrativeInspectorError('invalid_schema', 'Inspector出力はobjectである必要があります');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== INSPECTOR_SCHEMA_VERSION || !Array.isArray(record.issues)) throw new NarrativeInspectorError('invalid_schema', 'schemaVersionまたはissuesが不正です');
  if (record.issues.length > INSPECTOR_MAX_ISSUES) throw new NarrativeInspectorError('invalid_schema', `Issueは最大${INSPECTOR_MAX_ISSUES}件です`);
  const allowedRefs = allowedInspectorEvidenceRefs(context);
  const seen = new Set<string>();
  const issues = record.issues.map((raw, index): NarrativeInspectorIssue => {
    if (!raw || typeof raw !== 'object') throw new NarrativeInspectorError('invalid_schema', `issues[${index}]が不正です`);
    const issue = raw as Record<string, unknown>;
    if (!INSPECTOR_CATEGORIES.includes(issue.category as InspectorCategory)) throw new NarrativeInspectorError('invalid_schema', `issues[${index}].categoryが不正です`);
    if (!INSPECTOR_ISSUE_TYPES.includes(issue.issueType as InspectorIssueType)) throw new NarrativeInspectorError('invalid_schema', `issues[${index}].issueTypeが不正です`);
    if (ISSUE_TYPE_CATEGORY[issue.issueType as InspectorIssueType] !== issue.category) throw new NarrativeInspectorError('invalid_schema', `issues[${index}]のcategoryとissueTypeが一致しません`);
    if (!INSPECTOR_SEVERITIES.includes(issue.severity as InspectorSeverity)) throw new NarrativeInspectorError('invalid_schema', `issues[${index}].severityが不正です`);
    const locationKind = (issue.locationKind ?? 'excerpt') as InspectorLocationKind;
    if (!INSPECTOR_LOCATION_KINDS.includes(locationKind)) throw new NarrativeInspectorError('invalid_schema', `issues[${index}].locationKindが不正です`);
    const excerpt = stringField(issue.excerpt, `issues[${index}].excerpt`, 1200, locationKind === 'excerpt');
    const startOffset = issue.startOffset; const endOffset = issue.endOffset;
    if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)) throw new NarrativeInspectorError('invalid_schema', `issues[${index}]のoffsetが不正です`);
    if (locationKind === 'excerpt') {
      if ((startOffset as number) < 0 || (endOffset as number) <= (startOffset as number) || (endOffset as number) > context.inspectedText.excerpt.length) throw new NarrativeInspectorError('invalid_schema', `issues[${index}]のoffsetが不正です`);
      if (context.inspectedText.excerpt.slice(startOffset as number, endOffset as number) !== excerpt) throw new NarrativeInspectorError('invalid_schema', `issues[${index}]のexcerptとoffsetが一致しません`);
    } else {
      const fullChapter = context.inspectedText.requestedRange.start === 0
        && context.inspectedText.requestedRange.end === context.inspectedText.endOffset
        && !context.inspectedText.truncated;
      if (issue.issueType !== 'required_rule_missing' || issue.category !== 'narrative_rule' || !fullChapter || excerpt !== '' || startOffset !== 0 || endOffset !== 0) {
        throw new NarrativeInspectorError('invalid_schema', `issues[${index}]のchapter locationが不正です`);
      }
    }
    if (!Array.isArray(issue.evidenceRefs) || issue.evidenceRefs.length === 0 || issue.evidenceRefs.length > 12 || issue.evidenceRefs.some(ref => typeof ref !== 'string' || !allowedRefs.has(ref))) throw new NarrativeInspectorError('invalid_schema', `issues[${index}].evidenceRefsが不正です`);
    const evidenceRefs = [...new Set(issue.evidenceRefs as string[])];
    const evidenceRules = evidenceRefs.filter(ref => ref.startsWith('rule:')).map(ref => context.rules.find(rule => `rule:${rule.id}` === ref)!);
    if (issue.category === 'narrative_rule' && evidenceRules.length === 0) throw new NarrativeInspectorError('invalid_schema', `issues[${index}]にはRule evidenceが必要です`);
    if (issue.issueType === 'required_rule_missing' && !evidenceRules.some(rule => rule.mode === 'require')) throw new NarrativeInspectorError('invalid_schema', `issues[${index}]はrequire Ruleを参照していません`);
    if (issue.issueType === 'forbidden_rule_violation' && !evidenceRules.some(rule => rule.mode === 'forbid')) throw new NarrativeInspectorError('invalid_schema', `issues[${index}]はforbid Ruleを参照していません`);
    let severity = issue.severity as InspectorSeverity;
    const adjustments: string[] = [];
    if (severity === 'problem' && evidenceRules.length > 0 && evidenceRules.every(rule => rule.mode === 'guidance')) {
      severity = 'check';
      adjustments.push('guidance_only_problem_downgraded');
    }
    if (issue.issueType === 'speaker_unclear' && severity === 'problem') {
      severity = 'check';
      adjustments.push('speaker_unclear_problem_downgraded');
    }
    const duplicateKey = `${issue.category}:${issue.issueType}:${startOffset}:${endOffset}`;
    if (seen.has(duplicateKey)) throw new NarrativeInspectorError('invalid_schema', '同一箇所・同一種別のIssueが重複しています');
    seen.add(duplicateKey);
    return {
      category: issue.category as InspectorCategory, issueType: issue.issueType as InspectorIssueType, locationKind, excerpt,
      startOffset: locationKind === 'excerpt' ? context.inspectedText.startOffset + (startOffset as number) : context.inspectedText.startOffset,
      endOffset: locationKind === 'excerpt' ? context.inspectedText.startOffset + (endOffset as number) : context.inspectedText.endOffset,
      explanation: stringField(issue.explanation, `issues[${index}].explanation`, 2000),
      suggestedDirection: stringField(issue.suggestedDirection, `issues[${index}].suggestedDirection`, 2000),
      severity, evidenceRefs, adjustments,
    };
  });
  return { schemaVersion: 1, issues };
}

export function extractNarrativeInspectorOutput(raw: string, context: BuiltInspectorContext): NarrativeInspectorResult {
  if (!raw.trim()) throw new NarrativeInspectorError('empty_response', 'Inspector AIから空の応答が返されました');
  let parsed = false;
  for (const candidate of exactJsonCandidates(raw)) {
    try { parsed = true; return validateNarrativeInspectorOutput(JSON.parse(candidate), context); } catch (error) {
      if (error instanceof SyntaxError) { parsed = false; continue; }
      throw error;
    }
  }
  throw new NarrativeInspectorError(parsed ? 'invalid_schema' : 'invalid_json', 'Inspector応答を有効なJSONとして解釈できません');
}

export function sanitizeInspectorResult(result: NarrativeInspectorResult, context: BuiltInspectorContext): NarrativeInspectorResult {
  return { schemaVersion: 1, issues: result.issues.map(issue => ({ ...issue, explanation: sanitizeInspectorText(issue.explanation, context), suggestedDirection: sanitizeInspectorText(issue.suggestedDirection, context) })) };
}

export function sanitizeInspectorText(text: string, context: BuiltInspectorContext): string {
  const concealedNarrator = context.roles.narrator?.identityDisclosureMode === 'concealed' ? context.roles.narrator : null;
  const identityFact = concealedNarrator?.identityFactId ? context.knowledge.authorTruth.find(fact => fact.id === concealedNarrator.identityFactId) : null;
  const secrets = [concealedNarrator?.name, identityFact?.content].filter((value): value is string => Boolean(value && value.length >= 2));
  return secrets.reduce((result, secret) => result.split(secret).join('［秘匿中の作者設定］'), text);
}
