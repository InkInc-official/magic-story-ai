import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync('prisma/migrations/20261003020000_add_creative_rules/migration.sql', 'utf8');

test('Creative Rules migrationは2テーブルとProject cascadeだけを追加する', () => {
  assert.match(sql, /CREATE TABLE "magic_story"\."ProjectCreativeTechnique"/);
  assert.match(sql, /CREATE TABLE "magic_story"\."ProjectCustomCreativeRule"/);
  assert.equal((sql.match(/ON DELETE CASCADE/g) || []).length, 2);
  assert.doesNotMatch(sql, /DROP\s+(?:TABLE|COLUMN)/i);
  assert.doesNotMatch(sql, /^\s*UPDATE\s+/im);
  assert.doesNotMatch(sql, /^\s*INSERT\s+/im);
});

test('migrationはunique・mode・priority・length・source・versionをDB constraintで守る', () => {
  assert.match(sql, /UNIQUE INDEX "ProjectCreativeTechnique_projectId_techniqueKey_key"/);
  assert.match(sql, /ProjectCreativeTechnique_mode_check/);
  assert.match(sql, /ProjectCustomCreativeRule_mode_check/);
  assert.match(sql, /ProjectCreativeTechnique_priority_check/);
  assert.match(sql, /ProjectCustomCreativeRule_priority_check/);
  assert.match(sql, /ProjectCreativeTechnique_adjustment_length_check/);
  assert.match(sql, /ProjectCustomCreativeRule_instruction_check/);
  assert.match(sql, /ProjectCreativeTechnique_contract_version_check/);
  assert.equal((sql.match(/_source_check/g) || []).length, 2);
});
