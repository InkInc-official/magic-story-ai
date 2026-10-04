import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync('prisma/migrations/20261004000000_add_story_meaning_analysis/migration.sql', 'utf8');

test('meaning migration is additive and creates the four persistence tables', () => {
  for (const table of ['StoryMeaningAnalysisRun', 'StoryMeaningEvent', 'StoryMeaningClaim', 'StoryMeaningDecision']) {
    assert.match(sql, new RegExp(`CREATE TABLE "magic_story"\\."${table}"`));
  }
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN|SCHEMA)|TRUNCATE|UPDATE\s+"magic_story"|DELETE\s+FROM|ALTER\s+COLUMN/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO/i);
});

test('meaning migration has lifecycle, domain and range constraints', () => {
  assert.match(sql, /status" IN \('pending', 'completed', 'failed'\)/);
  assert.match(sql, /layer" IN \('observed', 'derived', 'interpretive'\)/);
  assert.match(sql, /decision" IN \('adopted', 'alternative', 'held', 'not_applicable'\)/);
  assert.match(sql, /fingerprintVersion" = 'meaning-v1'/);
  assert.match(sql, /StoryMeaningEvent_order_check/);
  assert.match(sql, /StoryMeaningClaim_order_check/);
});

test('meaning history cascades only through owned Project, Chapter, Run, Event and Claim hierarchy', () => {
  assert.match(sql, /StoryMeaningAnalysisRun_projectId_fkey[\s\S]*Project"\("id"\) ON DELETE CASCADE/);
  assert.match(sql, /StoryMeaningAnalysisRun_chapterId_fkey[\s\S]*Chapter"\("id"\) ON DELETE CASCADE/);
  assert.match(sql, /StoryMeaningEvent_runId_fkey[\s\S]*StoryMeaningAnalysisRun"\("id"\) ON DELETE CASCADE/);
  assert.match(sql, /StoryMeaningClaim_eventId_fkey[\s\S]*StoryMeaningEvent"\("id"\) ON DELETE CASCADE/);
  assert.match(sql, /StoryMeaningDecision_claimId_fkey[\s\S]*StoryMeaningClaim"\("id"\) ON DELETE CASCADE/);
  assert.doesNotMatch(sql, /REFERENCES "magic_story"\."(Character|StoryFact|CharacterRelationship|Plot|Foreshadowing)"/);
});
