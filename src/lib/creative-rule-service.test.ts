import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db } from '@/lib/db';
import { CREATIVE_TECHNIQUE_CATALOG } from '@/lib/creative-rules';
import {
  buildCreativeTechniqueReadModel, createProjectCreativeTechnique, createProjectCustomCreativeRule,
  deleteProjectCreativeTechnique, deleteProjectCustomCreativeRule, mapCreativeTechniquePersistenceToDomain, mapCustomCreativeRulePersistenceToDomain,
  updateProjectCreativeTechnique, updateProjectCustomCreativeRule,
} from './creative-rule-service.js';

function replaceMethod(target: object, key: string, implementation: (...args: never[]) => unknown) {
  const mutable = target as Record<string, unknown>; const original = mutable[key];
  mutable[key] = implementation; return () => { mutable[key] = original; };
}

const builtinRow = (values: Record<string, unknown> = {}) => ({
  id: 'builtin-1', projectId: 'project-a', techniqueKey: 'show_dont_tell', mode: 'reference', priority: 0,
  overridable: true, authorAdjustment: '', notes: '', source: 'author', active: true,
  catalogContractVersion: 1, createdAt: new Date(0), updatedAt: new Date(0), ...values,
});
const customRow = (values: Record<string, unknown> = {}) => ({
  id: 'custom-1', projectId: 'project-a', title: '独自方針', instruction: '原文', category: 'style',
  mode: 'reference', priority: 0, overridable: true, notes: '', source: 'author', active: true,
  createdAt: new Date(0), updatedAt: new Date(0), ...values,
});

test('zero rowsでも28件のCatalog read modelを返しDB seedを行わない', () => {
  const result = buildCreativeTechniqueReadModel([]);
  assert.equal(result.techniques.length, 28); assert.deepEqual(result.unknownAdoptions, []);
  assert.ok(result.techniques.every(value => value.adoption === null && value.contractStatus === 'current'));
});

test('contract mismatchとunknown historical rowを自動更新せずneedsReviewにする', () => {
  const result = buildCreativeTechniqueReadModel([
    builtinRow({ catalogContractVersion: 0 }), builtinRow({ id: 'unknown', techniqueKey: 'removed_key', catalogContractVersion: 7 }),
  ]);
  const known = result.techniques.find(value => value.definition.key === 'show_dont_tell')!;
  assert.equal(known.contractStatus, 'outdated'); assert.equal(known.needsReview, true);
  assert.equal(known.adoption?.catalogContractVersion, 0);
  assert.equal(result.unknownAdoptions[0].contractStatus, 'unknown'); assert.equal(result.unknownAdoptions[0].needsReview, true);
});

test('Persistence rowから7B-1 domain DTOへ全semantic fieldを保持する', () => {
  assert.deepEqual(mapCreativeTechniquePersistenceToDomain(builtinRow({
    mode: 'off', priority: 9, overridable: false, authorAdjustment: '調整', notes: 'メモ', source: 'imported', active: false,
  })), {
    id: 'builtin-1', kind: 'builtin', techniqueKey: 'show_dont_tell', mode: 'off', priority: 9,
    overridable: false, authorAdjustment: '調整', notes: 'メモ', source: 'imported', active: false,
  });
  assert.deepEqual(mapCustomCreativeRulePersistenceToDomain(customRow({ mode: 'forbidden', active: false })).mode, 'forbidden');
});

test('built-in createはcurrent contract versionを記録しsource/version/mass assignment偽装を無視する', async t => {
  let captured: Record<string, unknown> | undefined;
  const restore = [
    replaceMethod(db.project, 'findUnique', async () => ({ id: 'project-a' })),
    replaceMethod(db.projectCreativeTechnique, 'create', async (args: { data: Record<string, unknown> }) => { captured = args.data; return builtinRow(args.data); }),
  ];
  t.after(() => restore.reverse().forEach(value => value()));
  const created = await createProjectCreativeTechnique({
    projectId: 'project-a', techniqueKey: 'show_dont_tell', mode: 'off', active: false,
    source: 'ai_suggested_then_confirmed', catalogContractVersion: 999, id: 'attacker-id', guidance: '偽装',
  });
  assert.equal(captured?.source, 'author'); assert.equal(captured?.catalogContractVersion, 1);
  assert.equal(captured?.id, undefined); assert.equal(captured?.guidance, undefined);
  assert.equal(created.mode, 'off'); assert.equal(created.active, false);
});

test('built-in validationはunknown key、mode、priority、length abuseを拒否する', async t => {
  const restore = replaceMethod(db.project, 'findUnique', async () => ({ id: 'project-a' })); t.after(restore);
  const base = { projectId: 'project-a', techniqueKey: 'show_dont_tell' };
  await assert.rejects(createProjectCreativeTechnique({ ...base, techniqueKey: 'unknown' }), /未登録/);
  await assert.rejects(createProjectCreativeTechnique({ ...base, mode: 'invalid' }), /mode/);
  await assert.rejects(createProjectCreativeTechnique({ ...base, priority: 101 }), /-100/);
  await assert.rejects(createProjectCreativeTechnique({ ...base, authorAdjustment: 'a'.repeat(2001) }), /2000/);
  await assert.rejects(createProjectCreativeTechnique({ ...base, notes: 'a'.repeat(1001) }), /1000/);
});

test('built-in update/deleteはproject境界を守りkey・source・contract versionを変更しない', async t => {
  let updated: Record<string, unknown> | undefined;
  const restore = [
    replaceMethod(db.projectCreativeTechnique, 'findFirst', async (args: { where: { projectId: string } }) => args.where.projectId === 'project-a' ? builtinRow() : null),
    replaceMethod(db.projectCreativeTechnique, 'update', async (args: { data: Record<string, unknown> }) => { updated = args.data; return builtinRow(args.data); }),
    replaceMethod(db.projectCreativeTechnique, 'deleteMany', async (args: { where: { projectId: string } }) => ({ count: args.where.projectId === 'project-a' ? 1 : 0 })),
  ];
  t.after(() => restore.reverse().forEach(value => value()));
  await updateProjectCreativeTechnique({ id: 'builtin-1', projectId: 'project-a', mode: 'required', source: 'imported', catalogContractVersion: 9 });
  assert.equal(updated?.mode, 'required'); assert.equal(updated?.source, undefined); assert.equal(updated?.catalogContractVersion, undefined);
  await assert.rejects(updateProjectCreativeTechnique({ id: 'builtin-1', projectId: 'project-b', mode: 'required' }), /見つかりません/);
  await assert.rejects(updateProjectCreativeTechnique({ id: 'builtin-1', projectId: 'project-a', techniqueKey: 'sensory_detail' }), /変更できません/);
  await assert.rejects(deleteProjectCreativeTechnique('project-b', 'builtin-1'), /見つかりません/);
});

test('Custom create/updateはUnicode・CRLF・結合文字を保持しsource/mass assignmentを無視する', async t => {
  let createdData: Record<string, unknown> | undefined; let updatedData: Record<string, unknown> | undefined;
  const restore = [
    replaceMethod(db.project, 'findUnique', async () => ({ id: 'project-a' })),
    replaceMethod(db.projectCustomCreativeRule, 'create', async (args: { data: Record<string, unknown> }) => { createdData = args.data; return customRow(args.data); }),
    replaceMethod(db.projectCustomCreativeRule, 'findFirst', async () => customRow()),
    replaceMethod(db.projectCustomCreativeRule, 'update', async (args: { data: Record<string, unknown> }) => { updatedData = args.data; return customRow(args.data); }),
  ];
  t.after(() => restore.reverse().forEach(value => value()));
  const title = 'か\u3099🧭'; const instruction = '  原文\r\nを保持  ';
  await createProjectCustomCreativeRule({ projectId: 'project-a', title, instruction, category: 'style', mode: 'required', active: false, source: 'imported', id: 'spoof' });
  assert.equal(createdData?.title, title); assert.equal(createdData?.instruction, instruction); assert.equal(createdData?.source, 'author'); assert.equal(createdData?.id, undefined);
  assert.equal(createdData?.active, false);
  await updateProjectCustomCreativeRule({ id: 'custom-1', projectId: 'project-a', instruction, source: 'imported' });
  assert.equal(updatedData?.instruction, instruction); assert.equal(updatedData?.source, undefined);
});

test('Custom deleteはproject境界内だけを削除する', async t => {
  const restore = replaceMethod(db.projectCustomCreativeRule, 'deleteMany', async (args: { where: { projectId: string } }) => ({ count: args.where.projectId === 'project-a' ? 1 : 0 }));
  t.after(restore);
  await deleteProjectCustomCreativeRule('project-a', 'custom-1');
  await assert.rejects(deleteProjectCustomCreativeRule('project-b', 'custom-1'), /見つかりません/);
});

test('Customは3 modeを許可しoff・空白・長さ超過を拒否する', async t => {
  const restore = [replaceMethod(db.project, 'findUnique', async () => ({ id: 'project-a' })), replaceMethod(db.projectCustomCreativeRule, 'create', async (args: { data: Record<string, unknown> }) => customRow(args.data))];
  t.after(() => restore.reverse().forEach(value => value()));
  for (const mode of ['reference', 'required', 'forbidden']) assert.equal((await createProjectCustomCreativeRule({ projectId: 'project-a', title: mode, instruction: '原文', category: 'style', mode })).mode, mode);
  const base = { projectId: 'project-a', title: '方針', instruction: '原文', category: 'style' };
  await assert.rejects(createProjectCustomCreativeRule({ ...base, mode: 'off' }), /off/);
  await assert.rejects(createProjectCustomCreativeRule({ ...base, title: '   ' }), /1〜120/);
  await assert.rejects(createProjectCustomCreativeRule({ ...base, instruction: '\r\n  ' }), /1〜2000/);
  await assert.rejects(createProjectCustomCreativeRule({ ...base, title: 'a'.repeat(121) }), /1〜120/);
  await assert.rejects(createProjectCustomCreativeRule({ ...base, instruction: 'a'.repeat(2001) }), /1〜2000/);
  await assert.rejects(createProjectCustomCreativeRule({ ...base, notes: 'a'.repeat(1001) }), /1000/);
});

test('Catalogへ29件目を足したread modelもDB seedなしで29件になる', () => {
  const extra = { ...CREATIVE_TECHNIQUE_CATALOG[0], key: 'future_technique' as typeof CREATIVE_TECHNIQUE_CATALOG[0]['key'], label: '将来技法' };
  assert.equal(buildCreativeTechniqueReadModel([], [...CREATIVE_TECHNIQUE_CATALOG, extra]).techniques.length, 29);
});
