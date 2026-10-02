export const NARRATOR_DISCLOSURE_MODES = ['normal', 'concealed'] as const;
export const NARRATIVE_RULE_CATEGORIES = ['viewpoint', 'knowledge', 'voice', 'disclosure', 'structure', 'prose', 'custom'] as const;
export const NARRATIVE_RULE_MODES = ['require', 'forbid', 'allow', 'guidance'] as const;
export const NARRATIVE_RULE_SOURCES = ['author', 'preset', 'inferred'] as const;

export type NarratorDisclosureMode = typeof NARRATOR_DISCLOSURE_MODES[number];
export type NarrativeRuleCategory = typeof NARRATIVE_RULE_CATEGORIES[number];
export type NarrativeRuleMode = typeof NARRATIVE_RULE_MODES[number];
export type NarrativeRuleSource = typeof NARRATIVE_RULE_SOURCES[number];

export interface NarrativeCharacter { id: string; name: string }
export interface NarrativeFact { id: string; content?: string; readerInitiallyKnows?: boolean }
export interface NarratorValue {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  voiceNotes?: string;
  linkedCharacterId?: string | null;
  identityFactId?: string | null;
  identityDisclosureMode: string;
  notes?: string;
  linkedCharacter?: NarrativeCharacter | null;
  identityFact?: NarrativeFact | null;
}
export interface NarrativeRuleValue {
  id: string;
  projectId: string;
  title: string;
  description: string;
  category: string;
  mode: string;
  priority: number;
  source: string;
  machineKey?: string | null;
  active: boolean;
  overridable: boolean;
}

const stringWithin = (value: unknown, max: number, required = false) =>
  typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);

export function validateNarratorInput(value: Record<string, unknown>, partial = false): string | null {
  if ((!partial || value.name !== undefined) && !stringWithin(value.name, 120, true)) return '語り手名は1〜120文字で指定してください';
  for (const [key, max] of [['description', 4000], ['voiceNotes', 4000], ['notes', 4000]] as const) {
    if (value[key] !== undefined && !stringWithin(value[key], max)) return `${key}は${max}文字以内で指定してください`;
  }
  if ((!partial || value.identityDisclosureMode !== undefined)
    && !NARRATOR_DISCLOSURE_MODES.includes(value.identityDisclosureMode as NarratorDisclosureMode)) return '正体の開示設定が不正です';
  for (const key of ['linkedCharacterId', 'identityFactId'] as const) {
    if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'string') return `${key}が不正です`;
  }
  return null;
}

export function validateNarrativeRuleInput(value: Record<string, unknown>, partial = false): string | null {
  if ((!partial || value.title !== undefined) && !stringWithin(value.title, 160, true)) return 'ルール名は1〜160文字で指定してください';
  if ((!partial || value.description !== undefined) && !stringWithin(value.description, 8000, true)) return 'ルール本文は1〜8000文字で指定してください';
  if ((!partial || value.category !== undefined) && !NARRATIVE_RULE_CATEGORIES.includes(value.category as NarrativeRuleCategory)) return 'ルール分類が不正です';
  if ((!partial || value.mode !== undefined) && !NARRATIVE_RULE_MODES.includes(value.mode as NarrativeRuleMode)) return 'ルール種別が不正です';
  if ((!partial || value.source !== undefined) && !NARRATIVE_RULE_SOURCES.includes(value.source as NarrativeRuleSource)) return 'ルール由来が不正です';
  if (value.priority !== undefined && (!Number.isInteger(value.priority) || (value.priority as number) < -1000 || (value.priority as number) > 1000)) return '優先度は-1000〜1000の整数で指定してください';
  if (value.machineKey !== undefined && value.machineKey !== null && !stringWithin(value.machineKey, 120)) return 'machineKeyは120文字以内で指定してください';
  for (const key of ['active', 'overridable'] as const) if (value[key] !== undefined && typeof value[key] !== 'boolean') return `${key}が不正です`;
  return null;
}

export function resolveNarrativeRoles<TCast, TCharacter extends NarrativeCharacter = NarrativeCharacter>(args: {
  project: { narrativePerspective?: string | null; defaultPovCharacterId?: string | null; defaultNarratorId?: string | null };
  chapter?: { povCharacterId?: string | null; narratorId?: string | null } | null;
  characters: TCharacter[];
  narrators: NarratorValue[];
  cast: TCast[];
  readerKnownFactIds?: ReadonlySet<string>;
}) {
  const povId = args.chapter?.povCharacterId || args.project.defaultPovCharacterId || null;
  const narratorId = args.chapter?.narratorId || args.project.defaultNarratorId || null;
  const narrator = args.narrators.find(item => item.id === narratorId) || null;
  const identityReaderVisible = Boolean(narrator?.identityFactId
    && narrator.identityDisclosureMode !== 'concealed'
    && args.readerKnownFactIds?.has(narrator.identityFactId));
  return {
    perspective: args.project.narrativePerspective || null,
    narrator,
    pov: args.characters.find(character => character.id === povId) || null,
    cast: [...args.cast],
    narratorIdentity: narrator?.identityFactId ? {
      factId: narrator.identityFactId,
      authorSide: true as const,
      readerVisible: identityReaderVisible,
      concealed: narrator.identityDisclosureMode === 'concealed',
    } : null,
  };
}

export function resolveProjectNarrativeRules(rules: NarrativeRuleValue[]) {
  return rules
    .filter(rule => rule.active)
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .map(rule => ({
      ...rule,
      provenance: { level: 'project' as const, source: rule.source, ruleId: rule.id },
    }));
}

export function referencesBelongToProject(projectId: string, references: Array<{ projectId: string } | null | undefined>): boolean {
  return references.every(reference => !reference || reference.projectId === projectId);
}
