import { CREATIVE_TECHNIQUE_CATALOG } from './catalog';
import type { CreativeTechniqueDefinition, ProjectCreativeRule } from './types';

export interface RuntimeCreativeRuleSet {
  rules: ProjectCreativeRule[];
  excluded: Array<{ id: string; reason: 'outdated' | 'unknown' }>;
}

export interface RuntimeBuiltinRow {
  id: string; techniqueKey: string; mode: string; priority: number; overridable: boolean;
  authorAdjustment: string; notes: string; source: string; active: boolean; catalogContractVersion: number;
}

export interface RuntimeCustomRow {
  id: string; title: string; instruction: string; category: string; mode: string; priority: number;
  overridable: boolean; notes: string; source: string; active: boolean;
}

/** Converts persistence rows into a DB-independent runtime DTO without reinterpreting stale catalog contracts. */
export function buildRuntimeCreativeRuleSet(
  builtins: readonly RuntimeBuiltinRow[],
  custom: readonly RuntimeCustomRow[],
  catalog: readonly CreativeTechniqueDefinition[] = CREATIVE_TECHNIQUE_CATALOG,
): RuntimeCreativeRuleSet {
  const definitions: ReadonlyMap<string, CreativeTechniqueDefinition> = new Map(catalog.map(value => [value.key, value]));
  const rules: ProjectCreativeRule[] = [];
  const excluded: RuntimeCreativeRuleSet['excluded'] = [];
  for (const row of builtins) {
    const definition = definitions.get(row.techniqueKey);
    if (!definition) { excluded.push({ id: row.id, reason: 'unknown' }); continue; }
    if (row.catalogContractVersion !== definition.catalogContractVersion) { excluded.push({ id: row.id, reason: 'outdated' }); continue; }
    rules.push({
      id: row.id, kind: 'builtin', techniqueKey: row.techniqueKey, mode: row.mode as ProjectCreativeRule['mode'],
      priority: row.priority, overridable: row.overridable, authorAdjustment: row.authorAdjustment,
      notes: row.notes, source: row.source as 'author', active: row.active,
    });
  }
  for (const row of custom) rules.push({
    id: row.id, kind: 'custom', title: row.title, instruction: row.instruction,
    category: row.category as 'style', mode: row.mode as 'reference', priority: row.priority,
    overridable: row.overridable, notes: row.notes, source: row.source as 'author', active: row.active,
  });
  return { rules, excluded };
}
