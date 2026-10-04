import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { buildChapterMeaningContext, validateChapterMeaningAnalysisOutput } from './index.js';

test('validator and context canonicalizer remain linear enough for 3k, 10k and 50k UTF-16 chapters', () => {
  for (const size of [3_000, 10_000, 50_000]) {
    const content = `${'文'.repeat(size - 4)}「終」`;
    const startOffset = content.indexOf('「終」');
    const output = { schemaVersion: 1, events: [{
      localEventKey: 'event', summary: '終端',
      evidence: [{ localEvidenceKey: 'evidence', chapterId: 'chapter', startOffset, endOffset: content.length, exactExcerpt: '「終」', evidenceType: 'primary' }],
      actorRefs: [], claims: [{ localClaimKey: 'claim', layer: 'observed', dimension: 'other', statement: '終端表現がある。', supportLevel: 'explicit_text', evidenceRefs: ['evidence'], relatedEntityRefs: [] }],
    }] };
    const started = performance.now();
    validateChapterMeaningAnalysisOutput(output, { id: 'chapter', content });
    buildChapterMeaningContext({ project: { id: 'project', title: '作品' }, chapter: { id: 'chapter', projectId: 'project', order: 1, title: '章', content } });
    assert.ok(performance.now() - started < 2_000, `${size}文字のpure処理が2秒を超えました。`);
  }
});
