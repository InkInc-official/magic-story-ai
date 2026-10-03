import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath = 'prisma/migrations/20261003010000_version_inspector_fingerprints/migration.sql';

test('migrationは既存4モデルをlegacy-v1へ明示backfillし既存fingerprintを更新しない', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  for (const table of ['NarrativeInspectionRun', 'NarrativeIssue', 'NarrativeIssueDecision', 'NarrativeLearningSession']) {
    assert.match(sql, new RegExp(`ALTER TABLE "magic_story"\\."${table}"[\\s\\S]*?ADD COLUMN "fingerprintVersion" TEXT NOT NULL DEFAULT 'legacy-v1'`));
  }
  assert.doesNotMatch(sql, /UPDATE\s+/i);
  assert.doesNotMatch(sql, /DROP\s+(?:COLUMN|TABLE)/i);
  assert.doesNotMatch(sql, /contextFingerprint"\s*=/i);
  assert.equal((sql.match(/ADD COLUMN "fingerprintVersion"/g) || []).length, 4);
});
