import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStoryMeaningClaimFingerprint,
  storyMeaningDecisionIsFresh,
  storyMeaningRunIsFresh,
  type MeaningClaim,
  type MeaningEvidence,
} from './index.js';

const evidence: MeaningEvidence[] = [{
  localEvidenceKey: 'e1', chapterId: 'chapter-1', startOffset: 2, endOffset: 8,
  exactExcerpt: '「帰る」', evidenceType: 'primary',
}];
const claim: MeaningClaim = {
  localClaimKey: 'c1', layer: 'derived', dimension: 'decision_commitment',
  statement: '帰る決意を表明した。', supportLevel: 'strongly_supported', evidenceRefs: ['e1'],
  relatedEntityRefs: [{ type: 'character', id: 'a' }, { type: 'story_fact', id: 'f' }], impactScope: 'chapter',
};

test('claim fingerprint is deterministic exact semantic identity and excludes local/DB metadata', () => {
  const baseline = buildStoryMeaningClaimFingerprint(claim, evidence);
  assert.equal(buildStoryMeaningClaimFingerprint({ ...claim, localClaimKey: 'different-local-key' }, evidence), baseline);
  assert.equal(buildStoryMeaningClaimFingerprint({ ...claim, relatedEntityRefs: [...claim.relatedEntityRefs].reverse() }, evidence), baseline);
  for (const changed of [
    { ...claim, statement: '別の決意をした。' },
    { ...claim, layer: 'interpretive' as const },
    { ...claim, dimension: 'turning_point' as const },
    { ...claim, subtype: 'other' as const, dimension: 'state_change' as const },
    { ...claim, supportLevel: 'plausible_interpretation' as const },
    { ...claim, relatedEntityRefs: [{ type: 'character' as const, id: 'b' }] },
  ]) assert.notEqual(buildStoryMeaningClaimFingerprint(changed, evidence), baseline);
  assert.notEqual(buildStoryMeaningClaimFingerprint(claim, [{ ...evidence[0], startOffset: 3 }]), baseline);
  assert.notEqual(buildStoryMeaningClaimFingerprint(claim, [{ ...evidence[0], exactExcerpt: '「戻る」' }]), baseline);
});

test('claim fingerprint preserves Unicode and normalization differences', () => {
  const composed = buildStoryMeaningClaimFingerprint({ ...claim, statement: 'é' }, evidence);
  const decomposed = buildStoryMeaningClaimFingerprint({ ...claim, statement: 'e\u0301' }, evidence);
  assert.notEqual(composed, decomposed);
  assert.notEqual(
    buildStoryMeaningClaimFingerprint(claim, [{ ...evidence[0], exactExcerpt: '行く\r\n' }]),
    buildStoryMeaningClaimFingerprint(claim, [{ ...evidence[0], exactExcerpt: '行く\n' }]),
  );
});

test('run freshness requires raw content, semantic context and meaning-v1', () => {
  const current = { contentHash: 'content', contextFingerprint: 'context', fingerprintVersion: 'meaning-v1' };
  assert.equal(storyMeaningRunIsFresh(current, current), true);
  assert.equal(storyMeaningRunIsFresh({ ...current, contentHash: 'changed' }, current), false);
  assert.equal(storyMeaningRunIsFresh({ ...current, contextFingerprint: 'changed' }, current), false);
  assert.equal(storyMeaningRunIsFresh({ ...current, fingerprintVersion: 'meaning-v2' }, current), false);
});

test('decision freshness is conservative across claim/source/context changes', () => {
  const current = { contentHash: 'content', contextFingerprint: 'context', fingerprintVersion: 'meaning-v1' };
  const decision = { claimFingerprint: 'claim', decidedAgainstContentHash: 'content', decidedAgainstContextFingerprint: 'context', fingerprintVersion: 'meaning-v1' };
  assert.equal(storyMeaningDecisionIsFresh(decision, { claimFingerprint: 'claim' }, current), true);
  assert.equal(storyMeaningDecisionIsFresh(decision, { claimFingerprint: 'other' }, current), false);
  assert.equal(storyMeaningDecisionIsFresh(decision, { claimFingerprint: 'claim' }, { ...current, contentHash: 'changed' }), false);
  assert.equal(storyMeaningDecisionIsFresh(decision, { claimFingerprint: 'claim' }, { ...current, contextFingerprint: 'changed' }), false);
});
