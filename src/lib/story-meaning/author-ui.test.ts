import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStoryMeaningUiState, toStoryMeaningRunDto, validateStoryMeaningDecisionDraft } from './author-ui.js';

test('author DTO exposes event/evidence/claim/decision history without raw persistence fields', () => {
  const dto = toStoryMeaningRunDto({
    id: 'run1', status: 'completed', fresh: true, error: '', createdAt: new Date('2026-10-04T00:00:00Z'), completedAt: new Date('2026-10-04T00:01:00Z'),
    sourceManifest: { secret: true }, contentHash: 'hidden', events: [{ id: 'event1', summary: '静かな決意', evidenceJson: 'raw',
      evidence: [{ localEvidenceKey: 'e1', startOffset: 2, endOffset: 6, exactExcerpt: '帰ろう', evidenceType: 'primary' }],
      actorRefs: [{ type: 'character', id: 'char1' }], claims: [{ id: 'claim1', statement: '人物が決意した。', layer: 'derived', dimension: 'decision_commitment', supportLevel: 'strongly_supported', impactScope: 'chapter', subtype: null,
        evidenceRefs: ['e1'], relatedEntityRefs: [{ type: 'story_fact', id: 'deleted-fact' }],
        decisionHistory: [{ id: 'd2', decision: 'alternative', authorInterpretation: '迷いを残した決意', createdAt: new Date('2026-10-04T01:00:00Z'), fresh: true }, { id: 'd1', decision: 'held', authorInterpretation: '', createdAt: new Date('2026-10-04T00:30:00Z'), fresh: true }],
      }],
    }],
  }, { character: new Map([['char1', '葵']]), story_fact: new Map() });
  assert.equal(dto.events[0].actors[0].label, '葵');
  assert.deepEqual(dto.events[0].claims[0].latestDecision, dto.events[0].claims[0].decisionHistory[0]);
  assert.equal(dto.events[0].claims[0].relatedEntities[0].label, '削除済みの参照');
  assert.equal(dto.events[0].claims[0].relatedEntities[0].deleted, true);
  assert.equal('sourceManifest' in dto, false); assert.equal('contentHash' in dto, false); assert.equal('evidenceJson' in dto.events[0], false);
});

test('author DTO preserves zero Event and failed safe error code states', () => {
  const zero = toStoryMeaningRunDto({ id: 'run0', status: 'completed', fresh: false, error: '', createdAt: '', completedAt: '', events: [] });
  assert.equal(zero.events.length, 0); assert.equal(zero.fresh, false);
  const failed = toStoryMeaningRunDto({ id: 'run2', status: 'failed', fresh: false, error: 'meaning_model_failed', createdAt: '', completedAt: '', events: [] });
  assert.equal(failed.errorCode, 'meaning_model_failed');
});

test('UI state distinguishes unanalysed, pending, fresh, stale and failed', () => {
  const run = (status: 'pending' | 'completed' | 'failed', fresh: boolean) => toStoryMeaningRunDto({ id: status, status, fresh, error: '', createdAt: '', completedAt: '', events: [] });
  assert.equal(resolveStoryMeaningUiState([]), 'unanalysed');
  assert.equal(resolveStoryMeaningUiState([run('pending', false)]), 'pending');
  assert.equal(resolveStoryMeaningUiState([run('completed', true)]), 'fresh');
  assert.equal(resolveStoryMeaningUiState([run('completed', false)]), 'stale');
  assert.equal(resolveStoryMeaningUiState([run('failed', false)]), 'failed');
});

test('decision draft supports four author choices and requires text only for alternative', () => {
  for (const decision of ['adopted', 'held', 'not_applicable']) assert.equal(validateStoryMeaningDecisionDraft(decision, ''), null);
  assert.equal(validateStoryMeaningDecisionDraft('alternative', '作者自身の読み'), null);
  assert.match(validateStoryMeaningDecisionDraft('alternative', '   ') || '', /入力/);
  assert.match(validateStoryMeaningDecisionDraft('adopted', '余分') || '', /別解釈/);
  assert.match(validateStoryMeaningDecisionDraft('unknown', '') || '', /不正/);
});
