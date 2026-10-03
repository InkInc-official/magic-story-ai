import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

const { Client } = pg;
const EXPECTED_DATABASE = 'magic_story_integration';
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', 'postgres']);

function guardedUrl(name) {
  const raw = process.env[name];
  assert.ok(raw, `${name} is required`);
  const parsed = new URL(raw);
  assert.equal(process.env.NODE_ENV, 'test', 'NODE_ENV=test is required');
  assert.equal(process.env.RUN_POSTGRES_INTEGRATION, '1', 'RUN_POSTGRES_INTEGRATION=1 is required');
  assert.ok(ALLOWED_HOSTS.has(parsed.hostname), `${name} host must be an ephemeral local/CI PostgreSQL service`);
  assert.equal(parsed.pathname.slice(1), EXPECTED_DATABASE, `${name} must target ${EXPECTED_DATABASE}`);
  return raw;
}

const databaseUrl = guardedUrl('DATABASE_URL');
const directUrl = guardedUrl('DIRECT_URL');
assert.equal(new URL(databaseUrl).pathname, new URL(directUrl).pathname, 'DATABASE_URL and DIRECT_URL must use the same test database');

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const admin = new Client({ connectionString: directUrl });

const migrations = readdirSync('prisma/migrations', { withFileTypes: true })
  .filter(value => value.isDirectory())
  .map(value => value.name)
  .sort();

async function resetTestDatabase() {
  await admin.query('DROP SCHEMA IF EXISTS magic_story CASCADE');
  await admin.query('CREATE SCHEMA magic_story');
  await admin.query('DROP TABLE IF EXISTS public._prisma_migrations');
}

function deployMigrations() {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl }, stdio: 'inherit',
  });
}

async function project(title = 'Integration Project') {
  return prisma.project.create({ data: { title, genre: 'ミステリー' } });
}

async function character(projectId, name = '語り手') {
  return prisma.character.create({ data: { projectId, name } });
}

async function chapter(projectId) {
  return prisma.chapter.create({ data: { projectId, title: '第一章', order: 1, content: '「確認」' } });
}

async function definition(projectId, suffix = randomUUID()) {
  return prisma.projectSymbolDefinition.create({ data: { projectId, openSymbol: `《${suffix}`, closeSymbol: `${suffix}》`, label: '統合テスト記号' } });
}

async function usage(projectId, definitionId, extra = {}) {
  return prisma.symbolUsageRule.create({ data: {
    projectId, definitionId, label: '台詞', semanticKind: 'dialogue', speakerMode: 'unknown', ...extra,
  } });
}

before(async () => {
  await admin.connect();
  await resetTestDatabase();
  deployMigrations();
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
  await resetTestDatabase();
  await admin.end();
});

test('fresh databaseへ全migrationを順番どおりdeployできる', async () => {
  const applied = await admin.query('SELECT migration_name, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY started_at');
  assert.deepEqual(applied.rows.map(value => value.migration_name), migrations);
  assert.ok(applied.rows.every(value => value.finished_at && !value.rolled_back_at));
});

test('Symbol Dictionaryの循環参照とProject cascadeが実DBで成立する', async () => {
  const value = await project('Cascade');
  const speaker = await character(value.id);
  const currentChapter = await chapter(value.id);
  const symbol = await definition(value.id);
  const rule = await usage(value.id, symbol.id, { speakerMode: 'fixed_character', fixedSpeakerId: speaker.id });
  await prisma.projectCreativeTechnique.create({ data: { projectId: value.id, techniqueKey: 'show_dont_tell', mode: 'off', catalogContractVersion: 1 } });
  await prisma.projectCustomCreativeRule.create({ data: { projectId: value.id, title: '固有方針', instruction: '原文を保持する', category: 'style' } });
  await prisma.projectSymbolDefinition.update({ where: { id: symbol.id }, data: { defaultUsageRuleId: rule.id } });
  await prisma.symbolOccurrenceOverride.create({ data: {
    projectId: value.id, chapterId: currentChapter.id, definitionId: symbol.id, usageRuleId: rule.id,
    startOffset: 0, endOffset: 4, exactExcerpt: '「確認」', anchorBefore: '', anchorAfter: '', contentHash: 'hash', anchorFingerprint: 'fingerprint',
  } });
  await prisma.project.delete({ where: { id: value.id } });
  assert.equal(await prisma.projectSymbolDefinition.count({ where: { projectId: value.id } }), 0);
  assert.equal(await prisma.symbolUsageRule.count({ where: { projectId: value.id } }), 0);
  assert.equal(await prisma.symbolOccurrenceOverride.count({ where: { projectId: value.id } }), 0);
  assert.equal(await prisma.projectCreativeTechnique.count({ where: { projectId: value.id } }), 0);
  assert.equal(await prisma.projectCustomCreativeRule.count({ where: { projectId: value.id } }), 0);
});

test('Creative Rulesのunique・CHECK・off/delete・raw text contractが実DBで成立する', async () => {
  const value = await project('Creative Rules');
  const adoption = await prisma.projectCreativeTechnique.create({ data: {
    projectId: value.id, techniqueKey: 'show_dont_tell', mode: 'off', priority: -100,
    active: false, catalogContractVersion: 1,
  } });
  assert.equal(adoption.mode, 'off'); assert.equal(adoption.active, false);
  await assert.rejects(prisma.projectCreativeTechnique.create({ data: {
    projectId: value.id, techniqueKey: 'show_dont_tell', mode: 'reference', catalogContractVersion: 1,
  } }));
  await assert.rejects(admin.query(`INSERT INTO magic_story."ProjectCreativeTechnique"
    (id, "projectId", "techniqueKey", mode, priority, "catalogContractVersion", "updatedAt")
    VALUES ('invalid-mode', $1, 'sensory_detail', 'invalid', 0, 1, NOW())`, [value.id]));
  await assert.rejects(admin.query(`INSERT INTO magic_story."ProjectCreativeTechnique"
    (id, "projectId", "techniqueKey", mode, priority, "catalogContractVersion", "updatedAt")
    VALUES ('invalid-priority', $1, 'sensory_detail', 'reference', 101, 1, NOW())`, [value.id]));
  const rawTitle = 'か\u3099\r\n🧭'; const rawInstruction = '  改行を保持\r\n正規化しない  ';
  const custom = await prisma.projectCustomCreativeRule.create({ data: {
    projectId: value.id, title: rawTitle, instruction: rawInstruction, category: 'style', mode: 'required',
  } });
  assert.equal(custom.title, rawTitle); assert.equal(custom.instruction, rawInstruction);
  await assert.rejects(admin.query(`INSERT INTO magic_story."ProjectCustomCreativeRule"
    (id, "projectId", title, instruction, category, mode, "updatedAt")
    VALUES ('custom-off', $1, '拒否', 'offは保存しない', 'style', 'off', NOW())`, [value.id]));
  await prisma.projectCreativeTechnique.delete({ where: { id: adoption.id } });
  assert.equal(await prisma.projectCreativeTechnique.count({ where: { projectId: value.id } }), 0, 'row deleteはoff rowの保持と異なる');
  await prisma.project.delete({ where: { id: value.id } });
});

test('Definition/default Usageの設定・解除・削除順序を実DBで扱える', async () => {
  const value = await project('Default lifecycle');
  const symbol = await definition(value.id);
  const rule = await usage(value.id, symbol.id);
  await prisma.projectSymbolDefinition.update({ where: { id: symbol.id }, data: { defaultUsageRuleId: rule.id } });
  assert.equal((await prisma.projectSymbolDefinition.findUniqueOrThrow({ where: { id: symbol.id } })).defaultUsageRuleId, rule.id);
  await prisma.projectSymbolDefinition.update({ where: { id: symbol.id }, data: { defaultUsageRuleId: null } });
  await prisma.symbolUsageRule.delete({ where: { id: rule.id } });
  await prisma.projectSymbolDefinition.delete({ where: { id: symbol.id } });
  await prisma.project.delete({ where: { id: value.id } });
});

test('fixed_characterを保存でき、直接Character DELETEはDB制約で拒否される', async () => {
  const value = await project('Direct delete');
  const speaker = await character(value.id);
  const symbol = await definition(value.id);
  const rule = await usage(value.id, symbol.id, { speakerMode: 'fixed_character', fixedSpeakerId: speaker.id });
  assert.equal((await prisma.symbolUsageRule.findUniqueOrThrow({ where: { id: rule.id } })).fixedSpeakerId, speaker.id);
  await assert.rejects(prisma.character.delete({ where: { id: speaker.id } }));
  assert.equal((await prisma.symbolUsageRule.findUniqueOrThrow({ where: { id: rule.id } })).speakerMode, 'fixed_character');
  await prisma.project.delete({ where: { id: value.id } });
});

test('通常APIと同じtransactionでfixed speakerをunknownへ戻してCharacterを削除できる', async () => {
  const value = await project('API delete');
  const speaker = await character(value.id);
  const symbol = await definition(value.id);
  const rule = await usage(value.id, symbol.id, { speakerMode: 'fixed_character', fixedSpeakerId: speaker.id });
  await prisma.$transaction(async transaction => {
    const owned = await transaction.character.findFirst({ where: { id: speaker.id, projectId: value.id }, select: { id: true } });
    assert.ok(owned);
    await transaction.symbolUsageRule.updateMany({
      where: { projectId: value.id, fixedSpeakerId: speaker.id, speakerMode: 'fixed_character' },
      data: { fixedSpeakerId: null, speakerMode: 'unknown' },
    });
    await transaction.character.delete({ where: { id: speaker.id } });
  });
  const persisted = await prisma.symbolUsageRule.findUniqueOrThrow({ where: { id: rule.id } });
  assert.equal(persisted.fixedSpeakerId, null);
  assert.equal(persisted.speakerMode, 'unknown');
  await prisma.project.delete({ where: { id: value.id } });
});

test('別ProjectのCharacterはownership checkで削除対象にならない', async () => {
  const projectA = await project('A'); const projectB = await project('B');
  const speakerA = await character(projectA.id, 'A人物');
  assert.equal(await prisma.character.findFirst({ where: { id: speakerA.id, projectId: projectB.id } }), null);
  assert.ok(await prisma.character.findUnique({ where: { id: speakerA.id } }));
  await prisma.project.deleteMany({ where: { id: { in: [projectA.id, projectB.id] } } });
});

test('transaction failureはfixed speaker cleanupを含めてrollbackする', async () => {
  const value = await project('Rollback');
  const speaker = await character(value.id);
  const symbol = await definition(value.id);
  const rule = await usage(value.id, symbol.id, { speakerMode: 'fixed_character', fixedSpeakerId: speaker.id });
  await assert.rejects(prisma.$transaction(async transaction => {
    await transaction.symbolUsageRule.updateMany({ where: { projectId: value.id, fixedSpeakerId: speaker.id }, data: { fixedSpeakerId: null, speakerMode: 'unknown' } });
    throw new Error('intentional rollback');
  }));
  const persisted = await prisma.symbolUsageRule.findUniqueOrThrow({ where: { id: rule.id } });
  assert.equal(persisted.fixedSpeakerId, speaker.id);
  assert.equal(persisted.speakerMode, 'fixed_character');
  await prisma.project.delete({ where: { id: value.id } });
});

async function concurrentDefaultAndDeactivate(firstOperation) {
  const value = await project(`Lock ${firstOperation}`);
  const symbol = await definition(value.id);
  const rule = await usage(value.id, symbol.id);
  const first = new Client({ connectionString: directUrl }); const second = new Client({ connectionString: directUrl });
  await first.connect(); await second.connect();
  try {
    await first.query('BEGIN'); await second.query('BEGIN');
    await first.query('SELECT id FROM magic_story."ProjectSymbolDefinition" WHERE id = $1 FOR UPDATE', [symbol.id]);
    if (firstOperation === 'set-default') {
      await first.query('SELECT id FROM magic_story."SymbolUsageRule" WHERE id = $1 FOR UPDATE', [rule.id]);
      await first.query('UPDATE magic_story."ProjectSymbolDefinition" SET "defaultUsageRuleId" = $1 WHERE id = $2', [rule.id, symbol.id]);
    } else {
      await first.query('SELECT id FROM magic_story."SymbolUsageRule" WHERE id = $1 FOR UPDATE', [rule.id]);
      await first.query('UPDATE magic_story."SymbolUsageRule" SET active = false WHERE id = $1', [rule.id]);
    }
    let secondAcquired = false;
    const waiting = second.query('SELECT id FROM magic_story."ProjectSymbolDefinition" WHERE id = $1 FOR UPDATE', [symbol.id]).then(() => { secondAcquired = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(secondAcquired, false, 'second transaction must wait for the Definition lock');
    await first.query('COMMIT'); await waiting;
    const [definitionState, usageState] = await Promise.all([
      second.query('SELECT "defaultUsageRuleId" FROM magic_story."ProjectSymbolDefinition" WHERE id = $1', [symbol.id]),
      second.query('SELECT active FROM magic_story."SymbolUsageRule" WHERE id = $1 FOR UPDATE', [rule.id]),
    ]);
    if (firstOperation === 'set-default') {
      assert.equal(definitionState.rows[0].defaultUsageRuleId, rule.id);
      assert.equal(usageState.rows[0].active, true);
    } else {
      assert.equal(usageState.rows[0].active, false);
      assert.equal(definitionState.rows[0].defaultUsageRuleId, null);
    }
    await second.query('ROLLBACK');
  } finally {
    await first.end(); await second.end();
    await prisma.project.delete({ where: { id: value.id } });
  }
}

test('Definition→Usage lock順序は両開始順で直列化されdeadlockを起こさない', async () => {
  await concurrentDefaultAndDeactivate('set-default');
  await concurrentDefaultAndDeactivate('deactivate');
});

test('fingerprint migrationの4列はlegacy-v1 defaultを保持する', async () => {
  const columns = await admin.query(`
    SELECT table_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'magic_story' AND column_name = 'fingerprintVersion'
      AND table_name = ANY($1::text[])
    ORDER BY table_name
  `, [['NarrativeInspectionRun', 'NarrativeIssue', 'NarrativeIssueDecision', 'NarrativeLearningSession']]);
  assert.equal(columns.rows.length, 4);
  assert.ok(columns.rows.every(value => value.column_default === "'legacy-v1'::text"));
});

test('④以前のmigration pointからsample Projectを保持したままremaining migrationを適用できる', async () => {
  await prisma.$disconnect();
  await resetTestDatabase();
  const boundary = migrations.indexOf('20261003000000_add_semantic_symbol_dictionary');
  assert.ok(boundary > 0);
  for (const name of migrations.slice(0, boundary)) {
    await admin.query(readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'));
  }
  await admin.query('INSERT INTO magic_story."Project" (id, title, "createdAt", "updatedAt") VALUES ($1, $2, NOW(), NOW())', ['upgrade-project', 'Upgrade sample']);
  await admin.query('INSERT INTO magic_story."Chapter" (id, "projectId", "order") VALUES ($1, $2, $3)', ['upgrade-chapter', 'upgrade-project', 1]);
  await admin.query(`
    INSERT INTO magic_story."NarrativeInspectionRun"
      (id, "projectId", "chapterId", "requestedStartOffset", "requestedEndOffset", "inspectorVersion")
    VALUES ($1, $2, $3, 0, 0, $4)
  `, ['upgrade-run', 'upgrade-project', 'upgrade-chapter', 'pre-semantic-v3']);
  for (const name of migrations.slice(boundary)) {
    await admin.query(readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'));
  }
  assert.equal((await admin.query('SELECT title FROM magic_story."Project" WHERE id = $1', ['upgrade-project'])).rows[0].title, 'Upgrade sample');
  assert.equal((await admin.query('SELECT "fingerprintVersion" FROM magic_story."NarrativeInspectionRun" WHERE id = $1', ['upgrade-run'])).rows[0].fingerprintVersion, 'legacy-v1');
  assert.equal((await admin.query("SELECT to_regclass('magic_story.\"ProjectSymbolDefinition\"') AS value")).rows[0].value, 'magic_story."ProjectSymbolDefinition"');
  assert.equal((await admin.query("SELECT to_regclass('magic_story.\"ProjectCreativeTechnique\"') AS value")).rows[0].value, 'magic_story."ProjectCreativeTechnique"');
  assert.equal((await admin.query('SELECT COUNT(*)::int AS count FROM magic_story."ProjectCreativeTechnique"')).rows[0].count, 0);
  assert.equal((await admin.query('SELECT COUNT(*)::int AS count FROM magic_story."ProjectCustomCreativeRule"')).rows[0].count, 0);
});
