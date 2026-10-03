import { CREATIVE_TECHNIQUE_CATALOG } from './catalog';
import { validateCreativeTechniqueCatalog, validateProjectCreativeRule } from './validation';
import type {
  CreativeRuleConflict, CreativeRulePromptEntry, CreativeRuleSurface, CreativeTechniqueDefinition,
  CreativeTechniqueKey, ProjectCreativeRule, ResolvedCreativeRuleSet,
} from './types';

export const CUSTOM_CREATIVE_RULE_DEFAULT_SURFACES: readonly CreativeRuleSurface[] = Object.freeze(['writer', 'editor', 'review', 'inspector', 'learning']);

const strength = (mode: CreativeRulePromptEntry['mode']) => mode === 'reference' ? 1 : 2;
export function compareCreativeRuleEntries(left: CreativeRulePromptEntry, right: CreativeRulePromptEntry): number {
  return strength(right.mode) - strength(left.mode)
    || right.priority - left.priority
    || (left.techniqueKey || left.title).localeCompare(right.techniqueKey || right.title)
    || left.stableId.localeCompare(right.stableId);
}

function catalogConflicts(entries: CreativeRulePromptEntry[], definitions: ReadonlyMap<string, CreativeTechniqueDefinition>): CreativeRuleConflict[] {
  const required = entries.filter(entry => entry.kind === 'builtin' && entry.mode === 'required' && entry.techniqueKey);
  const result: CreativeRuleConflict[] = [];
  const seen = new Set<string>();
  for (const left of required) {
    const configured = new Set(definitions.get(left.techniqueKey!)?.conflictKeys || []);
    for (const right of required) {
      if (left.stableId === right.stableId || !right.techniqueKey) continue;
      const reverse = new Set(definitions.get(right.techniqueKey)?.conflictKeys || []);
      if (!configured.has(right.techniqueKey) && !reverse.has(left.techniqueKey!)) continue;
      const pair = [left.stableId, right.stableId].sort(); const key = pair.join('\u0000');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        code: 'catalog_conflict', ruleIds: pair as [string, string],
        techniqueKeys: [left.techniqueKey!, right.techniqueKey].sort() as [CreativeTechniqueKey, CreativeTechniqueKey],
        message: `「${left.title}」と「${right.title}」は同時に必須指定されているため、適用関係を作者が確認してください。`,
      });
    }
  }
  return result.sort((a, b) => a.ruleIds.join(':').localeCompare(b.ruleIds.join(':')));
}

export function selectCreativeRulesForSurface(
  rules: readonly ProjectCreativeRule[], surface: CreativeRuleSurface,
  catalog: readonly CreativeTechniqueDefinition[] = CREATIVE_TECHNIQUE_CATALOG,
): ResolvedCreativeRuleSet {
  const catalogIssues = validateCreativeTechniqueCatalog(catalog);
  const definitions = new Map(catalog.map(value => [value.key, value]));
  const validationIssues = [...catalogIssues];
  const duplicateKeys = new Set<string>(); const builtinIdsByKey = new Map<string, string[]>();
  for (const rule of rules) {
    if (rule.active !== true || rule.kind !== 'builtin') continue;
    builtinIdsByKey.set(rule.techniqueKey, [...(builtinIdsByKey.get(rule.techniqueKey) || []), rule.id]);
  }
  for (const [key, ids] of builtinIdsByKey) if (ids.length > 1) {
    duplicateKeys.add(key);
    validationIssues.push({ code: 'duplicate_builtin_adoption', path: `techniqueKey.${key}`, message: `同じbuilt-in technique「${key}」が複数指定されています（${ids.sort().join('、')}）。` });
  }

  const activeGuidanceRules: CreativeRulePromptEntry[] = [];
  const suppressed = new Set<CreativeTechniqueKey>(); const omitted: string[] = [];
  for (const rule of rules) {
    if (rule.active === false) continue;
    const issues = validateProjectCreativeRule(rule, catalog); validationIssues.push(...issues);
    if (issues.length > 0 || (rule.kind === 'builtin' && duplicateKeys.has(rule.techniqueKey))) { omitted.push(rule.id); continue; }
    if (rule.kind === 'builtin') {
      const technique = definitions.get(rule.techniqueKey as CreativeTechniqueKey)!;
      if (!technique.applicableSurfaces.includes(surface)) { omitted.push(rule.id); continue; }
      if (rule.mode === 'off') { suppressed.add(technique.key); continue; }
      activeGuidanceRules.push({
        stableId: rule.id, kind: 'builtin', techniqueKey: technique.key, title: technique.label,
        category: technique.category, mode: rule.mode, guidance: technique.guidance[rule.mode],
        authorAdjustment: rule.authorAdjustment, notes: rule.notes, priority: rule.priority,
        overridable: rule.overridable, source: rule.source, semanticContractVersion: technique.catalogContractVersion,
      });
    } else {
      if (rule.mode === 'off') { omitted.push(rule.id); continue; }
      if (!CUSTOM_CREATIVE_RULE_DEFAULT_SURFACES.includes(surface)) { omitted.push(rule.id); continue; }
      activeGuidanceRules.push({
        stableId: rule.id, kind: 'custom', title: rule.title, category: rule.category, mode: rule.mode,
        guidance: rule.instruction, notes: rule.notes, priority: rule.priority, overridable: rule.overridable,
        source: rule.source, semanticContractVersion: 1,
      });
    }
  }
  activeGuidanceRules.sort(compareCreativeRuleEntries);
  return {
    activeGuidanceRules,
    suppressedTechniqueKeys: [...suppressed].sort(),
    conflicts: catalogConflicts(activeGuidanceRules, definitions),
    omitted: [...new Set(omitted)].sort(), validationIssues,
  };
}

export const resolveCreativeRules = selectCreativeRulesForSurface;
