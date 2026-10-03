import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import {
  CREATIVE_TECHNIQUE_CATALOG,
  validateProjectCreativeRule,
  type BuiltinCreativeRuleAdoption,
  type CreativeTechniqueDefinition,
  type CustomCreativeRule,
  type ProjectCreativeRule,
} from '@/lib/creative-rules';

export class CreativeRuleServiceError extends Error {
  constructor(public code: 'validation' | 'not_found' | 'conflict', message: string) { super(message); }
}

export interface CreativeTechniquePersistenceRow {
  id: string;
  projectId: string;
  techniqueKey: string;
  mode: string;
  priority: number;
  overridable: boolean;
  authorAdjustment: string;
  notes: string;
  source: string;
  active: boolean;
  catalogContractVersion: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CustomCreativeRulePersistenceRow {
  id: string;
  projectId: string;
  title: string;
  instruction: string;
  category: string;
  mode: string;
  priority: number;
  overridable: boolean;
  notes: string;
  source: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CreativeTechniqueContractStatus = 'current' | 'outdated' | 'unknown';

const definitionByKey = (catalog: readonly CreativeTechniqueDefinition[] = CREATIVE_TECHNIQUE_CATALOG): ReadonlyMap<string, CreativeTechniqueDefinition> => new Map(catalog.map(value => [value.key, value]));

export function mapCreativeTechniquePersistenceToDomain(row: CreativeTechniquePersistenceRow): BuiltinCreativeRuleAdoption {
  return {
    id: row.id, kind: 'builtin', techniqueKey: row.techniqueKey, mode: row.mode as BuiltinCreativeRuleAdoption['mode'],
    priority: row.priority, overridable: row.overridable, authorAdjustment: row.authorAdjustment,
    notes: row.notes, source: row.source as BuiltinCreativeRuleAdoption['source'], active: row.active,
  };
}

export function mapCustomCreativeRulePersistenceToDomain(row: CustomCreativeRulePersistenceRow): CustomCreativeRule {
  return {
    id: row.id, kind: 'custom', title: row.title, instruction: row.instruction,
    category: row.category as CustomCreativeRule['category'], mode: row.mode as CustomCreativeRule['mode'],
    priority: row.priority, overridable: row.overridable, notes: row.notes,
    source: row.source as CustomCreativeRule['source'], active: row.active,
  };
}

export function buildCreativeTechniqueReadModel(
  rows: readonly CreativeTechniquePersistenceRow[],
  catalog: readonly CreativeTechniqueDefinition[] = CREATIVE_TECHNIQUE_CATALOG,
) {
  const definitions = definitionByKey(catalog);
  const rowsByKey = new Map(rows.map(row => [row.techniqueKey, row]));
  const techniques = catalog.map(definition => {
    const adoption = rowsByKey.get(definition.key) || null;
    const contractStatus: CreativeTechniqueContractStatus = !adoption ? 'current'
      : adoption.catalogContractVersion === definition.catalogContractVersion ? 'current' : 'outdated';
    return { definition, adoption, currentCatalogContractVersion: definition.catalogContractVersion, contractStatus, needsReview: contractStatus === 'outdated' };
  });
  const unknownAdoptions = rows.filter(row => !definitions.has(row.techniqueKey)).map(adoption => ({
    adoption, definition: null, currentCatalogContractVersion: null, contractStatus: 'unknown' as const, needsReview: true,
  }));
  return { techniques, unknownAdoptions };
}

const stringValue = (value: unknown, name: string, fallback?: string): string => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string') throw new CreativeRuleServiceError('validation', `${name}が不正です。`);
  return value;
};
const integerValue = (value: unknown, name: string, fallback?: number): number => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isInteger(value)) throw new CreativeRuleServiceError('validation', `${name}は整数で指定してください。`);
  return value as number;
};
const booleanValue = (value: unknown, name: string, fallback?: boolean): boolean => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') throw new CreativeRuleServiceError('validation', `${name}が不正です。`);
  return value;
};
const validate = (rule: ProjectCreativeRule) => {
  const issues = validateProjectCreativeRule(rule, CREATIVE_TECHNIQUE_CATALOG);
  if (issues.length) throw new CreativeRuleServiceError('validation', issues.map(value => value.message).join(' '));
};
const requireProject = async (projectId: string) => {
  if (!projectId) throw new CreativeRuleServiceError('validation', 'Project IDは必須です。');
  if (!await db.project.findUnique({ where: { id: projectId }, select: { id: true } })) throw new CreativeRuleServiceError('not_found', 'Projectが見つかりません。');
};
const conflict = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new CreativeRuleServiceError('conflict', 'このProjectでは同じ技法がすでに設定されています。');
  throw error;
};

export async function listProjectCreativeTechniques(projectId: string) {
  await requireProject(projectId);
  const rows = await db.projectCreativeTechnique.findMany({ where: { projectId }, orderBy: [{ priority: 'desc' }, { techniqueKey: 'asc' }] });
  return buildCreativeTechniqueReadModel(rows);
}

export async function loadProjectCreativeRuleDomain(projectId: string): Promise<ProjectCreativeRule[]> {
  await requireProject(projectId);
  const [builtins, custom] = await Promise.all([
    db.projectCreativeTechnique.findMany({ where: { projectId } }),
    db.projectCustomCreativeRule.findMany({ where: { projectId } }),
  ]);
  return [...builtins.map(mapCreativeTechniquePersistenceToDomain), ...custom.map(mapCustomCreativeRulePersistenceToDomain)];
}

export async function createProjectCreativeTechnique(input: Record<string, unknown>) {
  const projectId = stringValue(input.projectId, 'Project ID');
  await requireProject(projectId);
  const techniqueKey = stringValue(input.techniqueKey, 'Technique key');
  const definition = definitionByKey().get(techniqueKey);
  if (!definition) throw new CreativeRuleServiceError('validation', '未登録のCreative Techniqueです。');
  const candidate: BuiltinCreativeRuleAdoption = {
    id: '__new__', kind: 'builtin', techniqueKey, mode: stringValue(input.mode, 'mode', 'reference') as BuiltinCreativeRuleAdoption['mode'],
    priority: integerValue(input.priority, 'priority', 0), overridable: booleanValue(input.overridable, 'overridable', true),
    authorAdjustment: stringValue(input.authorAdjustment, 'authorAdjustment', ''), notes: stringValue(input.notes, 'notes', ''),
    source: 'author', active: booleanValue(input.active, 'active', true),
  };
  validate(candidate);
  try {
    return await db.projectCreativeTechnique.create({ data: {
      projectId, techniqueKey, mode: candidate.mode, priority: candidate.priority, overridable: candidate.overridable,
      authorAdjustment: candidate.authorAdjustment || '', notes: candidate.notes || '', source: 'author', active: candidate.active,
      catalogContractVersion: definition.catalogContractVersion,
    } });
  } catch (error) { return conflict(error); }
}

export async function updateProjectCreativeTechnique(input: Record<string, unknown>) {
  const id = stringValue(input.id, 'ID'); const projectId = stringValue(input.projectId, 'Project ID');
  const existing = await db.projectCreativeTechnique.findFirst({ where: { id, projectId } });
  if (!existing) throw new CreativeRuleServiceError('not_found', 'Creative Technique設定が見つかりません。');
  if (input.techniqueKey !== undefined && input.techniqueKey !== existing.techniqueKey) throw new CreativeRuleServiceError('validation', 'Technique keyは変更できません。');
  const candidate: BuiltinCreativeRuleAdoption = {
    ...mapCreativeTechniquePersistenceToDomain(existing),
    mode: stringValue(input.mode, 'mode', existing.mode) as BuiltinCreativeRuleAdoption['mode'],
    priority: integerValue(input.priority, 'priority', existing.priority),
    overridable: booleanValue(input.overridable, 'overridable', existing.overridable),
    authorAdjustment: stringValue(input.authorAdjustment, 'authorAdjustment', existing.authorAdjustment),
    notes: stringValue(input.notes, 'notes', existing.notes), active: booleanValue(input.active, 'active', existing.active),
  };
  validate(candidate);
  return db.projectCreativeTechnique.update({ where: { id: existing.id }, data: {
    mode: candidate.mode, priority: candidate.priority, overridable: candidate.overridable,
    authorAdjustment: candidate.authorAdjustment || '', notes: candidate.notes || '', active: candidate.active,
  } });
}

export async function deleteProjectCreativeTechnique(projectId: string, id: string) {
  const deleted = await db.projectCreativeTechnique.deleteMany({ where: { id, projectId } });
  if (!deleted.count) throw new CreativeRuleServiceError('not_found', 'Creative Technique設定が見つかりません。');
}

export async function listProjectCustomCreativeRules(projectId: string) {
  await requireProject(projectId);
  return db.projectCustomCreativeRule.findMany({ where: { projectId }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] });
}

const customCandidate = (input: Record<string, unknown>, existing?: CustomCreativeRulePersistenceRow): CustomCreativeRule => ({
  id: existing?.id || '__new__', kind: 'custom', title: stringValue(input.title, 'title', existing?.title),
  instruction: stringValue(input.instruction, 'instruction', existing?.instruction),
  category: stringValue(input.category, 'category', existing?.category) as CustomCreativeRule['category'],
  mode: stringValue(input.mode, 'mode', existing?.mode || 'reference') as CustomCreativeRule['mode'],
  priority: integerValue(input.priority, 'priority', existing?.priority ?? 0),
  overridable: booleanValue(input.overridable, 'overridable', existing?.overridable ?? true),
  notes: stringValue(input.notes, 'notes', existing?.notes || ''), source: 'author',
  active: booleanValue(input.active, 'active', existing?.active ?? true),
});

export async function createProjectCustomCreativeRule(input: Record<string, unknown>) {
  const projectId = stringValue(input.projectId, 'Project ID'); await requireProject(projectId);
  const candidate = customCandidate(input); validate(candidate);
  return db.projectCustomCreativeRule.create({ data: {
    projectId, title: candidate.title, instruction: candidate.instruction, category: candidate.category,
    mode: candidate.mode, priority: candidate.priority, overridable: candidate.overridable,
    notes: candidate.notes || '', source: 'author', active: candidate.active,
  } });
}

export async function updateProjectCustomCreativeRule(input: Record<string, unknown>) {
  const id = stringValue(input.id, 'ID'); const projectId = stringValue(input.projectId, 'Project ID');
  const existing = await db.projectCustomCreativeRule.findFirst({ where: { id, projectId } });
  if (!existing) throw new CreativeRuleServiceError('not_found', 'Custom Creative Ruleが見つかりません。');
  const candidate = customCandidate(input, existing); validate(candidate);
  return db.projectCustomCreativeRule.update({ where: { id: existing.id }, data: {
    title: candidate.title, instruction: candidate.instruction, category: candidate.category,
    mode: candidate.mode, priority: candidate.priority, overridable: candidate.overridable,
    notes: candidate.notes || '', active: candidate.active,
  } });
}

export async function deleteProjectCustomCreativeRule(projectId: string, id: string) {
  const deleted = await db.projectCustomCreativeRule.deleteMany({ where: { id, projectId } });
  if (!deleted.count) throw new CreativeRuleServiceError('not_found', 'Custom Creative Ruleが見つかりません。');
}

export function creativeRuleServiceErrorStatus(error: unknown): number {
  if (!(error instanceof CreativeRuleServiceError)) return 500;
  if (error.code === 'validation') return 400;
  if (error.code === 'not_found') return 404;
  return 409;
}
