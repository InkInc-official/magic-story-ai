import assert from 'node:assert/strict';
import test from 'node:test';
import { assertOnlyKeys, designStatusForDecision, StoryArchitecturePersistenceError } from './request.js';

test('author API payload rejects provenance and ProposalRun spoofing', () => {
  for (const key of ['provenance', 'proposalRunId']) {
    assert.throws(
      () => assertOnlyKeys({ projectId: 'project-1', [key]: key === 'provenance' ? 'ai_proposal' : 'run-1' }, ['projectId']),
      (error: unknown) => error instanceof StoryArchitecturePersistenceError && error.status === 400,
    );
  }
});

test('persistence payload rejects unknown score/apply fields instead of silently storing them', () => {
  for (const key of ['score', 'applyToChapter', 'sourceManifest']) {
    assert.throws(() => assertOnlyKeys({ title: '作品設計', [key]: true }, ['title']), /未対応のフィールド/);
  }
});

test('raw Unicode values pass DTO key validation without normalization or trimming', () => {
  const title = '  か\u3099\r\n👨‍👩‍👧‍👦  ';
  assert.equal(assertOnlyKeys({ title }, ['title']).title, title);
});

test('Decision and current workflow status have one explicit synchronization contract', () => {
  assert.equal(designStatusForDecision('approved'), 'approved');
  assert.equal(designStatusForDecision('rejected'), 'retired');
  assert.equal(designStatusForDecision('held'), 'proposed');
});
