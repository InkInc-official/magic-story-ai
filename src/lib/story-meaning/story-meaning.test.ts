import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChapterMeaningContext, buildChapterMeaningPrompt, computeMeaningContentHash,
  findDuplicateMeaningEvents, MeaningContextBudgetError, StoryMeaningValidationError,
  validateChapterMeaningAnalysisOutput, type BuildChapterMeaningContextInput,
} from './index.js';

const chapter = { id: 'chapter-1', content: '静かな朝だった。\r\n「帰る」😀とか\u3099👨‍👩‍👧‍👦𠮷。' };

interface TestClaim {
  localClaimKey: string;
  layer: string;
  dimension: string;
  statement: string;
  supportLevel: string;
  evidenceRefs: string[];
  relatedEntityRefs: Array<{ type: string; id: string }>;
  impactScope?: string;
  subtype?: string;
}

interface TestOutput {
  schemaVersion: number;
  events: Array<{
    localEventKey: string;
    summary: string;
    evidence: Array<{ localEvidenceKey: string; chapterId: string; startOffset: number; endOffset: number; exactExcerpt: string; evidenceType: string }>;
    actorRefs: Array<{ type: string; id: string }>;
    claims: TestClaim[];
  }>;
}

function validOutput(excerpt = '「帰る」'): TestOutput {
  const startOffset = chapter.content.indexOf(excerpt);
  return {
    schemaVersion: 1,
    events: [{
      localEventKey: 'event-1', summary: '帰る意思を述べる',
      evidence: [{ localEvidenceKey: 'evidence-1', chapterId: chapter.id, startOffset, endOffset: startOffset + excerpt.length, exactExcerpt: excerpt, evidenceType: 'primary' }],
      actorRefs: [{ type: 'character', id: 'character-a' }],
      claims: [{ localClaimKey: 'claim-1', layer: 'observed', dimension: 'decision_commitment', statement: '人物は「帰る」と発話した。', supportLevel: 'explicit_text', evidenceRefs: ['evidence-1'], relatedEntityRefs: [{ type: 'character', id: 'character-a' }], impactScope: 'chapter' }],
    }],
  };
}

function expectCode(mutator: (value: ReturnType<typeof validOutput>) => void, code: string) {
  const value = validOutput();
  mutator(value);
  assert.throws(() => validateChapterMeaningAnalysisOutput(value, chapter), (error: unknown) => error instanceof StoryMeaningValidationError && error.code === code);
}

test('exact excerpt validates and events canonicalize by primary source order', () => {
  const first = validOutput();
  const second = structuredClone(first.events[0]);
  second.localEventKey = 'event-0';
  second.evidence[0].localEvidenceKey = 'evidence-0';
  second.evidence[0].startOffset = 0;
  second.evidence[0].endOffset = 7;
  second.evidence[0].exactExcerpt = '静かな朝だった';
  second.claims[0].localClaimKey = 'claim-0';
  second.claims[0].evidenceRefs = ['evidence-0'];
  first.events.unshift(second);
  const result = validateChapterMeaningAnalysisOutput(first, chapter, { knownEntityIds: { character: new Set(['character-a']) } });
  assert.deepEqual(result.events.map(value => value.localEventKey), ['event-0', 'event-1']);
});

test('strict validator rejects grounding, reference, enum, subtype, ownership and bounds errors', () => {
  expectCode(value => { value.events[0].evidence[0].exactExcerpt = '不一致'; }, 'excerpt_mismatch');
  expectCode(value => { value.events[0].evidence[0].startOffset = -1; }, 'invalid_range');
  expectCode(value => { value.events[0].evidence[0].chapterId = 'other'; }, 'wrong_chapter');
  expectCode(value => { value.events[0].evidence[0].evidenceType = 'supporting'; }, 'missing_primary');
  expectCode(value => { value.events.push(structuredClone(value.events[0])); }, 'duplicate_key');
  expectCode(value => { value.events[0].claims[0].evidenceRefs = ['missing']; }, 'missing_evidence_ref');
  expectCode(value => { value.events[0].claims[0].layer = 'fact' as never; }, 'invalid_value');
  expectCode(value => { value.events[0].claims[0].dimension = 'quality' as never; }, 'invalid_value');
  expectCode(value => { value.events[0].claims[0].supportLevel = 'uncertain'; }, 'invalid_layer_support');
  expectCode(value => { value.events[0].actorRefs[0].type = 'scene' as never; }, 'invalid_value');
  expectCode(value => { value.events[0].claims[0].subtype = 'external'; }, 'invalid_subtype');
  expectCode(value => { value.events[0].summary = '長'.repeat(501); }, 'output_bound_exceeded');
  expectCode(value => { value.events = Array.from({ length: 31 }, (_, index) => ({ ...structuredClone(value.events[0]), localEventKey: `event-${index}` })); }, 'output_bound_exceeded');
  assert.throws(() => validateChapterMeaningAnalysisOutput(validOutput(), chapter, { knownEntityIds: { character: new Set() } }), (error: unknown) => error instanceof StoryMeaningValidationError && error.code === 'unknown_entity');
});

test('unknown keys including hidden reasoning are rejected', () => {
  const value = validOutput() as ReturnType<typeof validOutput> & { reasoning?: string };
  value.reasoning = 'hidden chain';
  assert.throws(() => validateChapterMeaningAnalysisOutput(value, chapter), (error: unknown) => error instanceof StoryMeaningValidationError && error.code === 'unknown_key');
});

test('UTF-16 exactness preserves CRLF, emoji, ZWJ, combining marks, quotes and supplementary characters', () => {
  for (const excerpt of ['\r\n', '😀', '👨‍👩‍👧‍👦', 'か\u3099', '「帰る」', '𠮷']) {
    const result = validateChapterMeaningAnalysisOutput(validOutput(excerpt), chapter);
    assert.equal(result.events[0].evidence[0].exactExcerpt, excerpt);
  }
  const emoji = chapter.content.indexOf('😀');
  const value = validOutput('😀');
  value.events[0].evidence[0].startOffset = emoji + 1;
  value.events[0].evidence[0].endOffset = emoji + 2;
  value.events[0].evidence[0].exactExcerpt = chapter.content.slice(emoji + 1, emoji + 2);
  assert.throws(() => validateChapterMeaningAnalysisOutput(value, chapter), (error: unknown) => error instanceof StoryMeaningValidationError && error.code === 'invalid_utf16_boundary');
});

test('overlap is allowed while identical primary range sets produce warning only', () => {
  const output = validOutput();
  const duplicate = structuredClone(output.events[0]);
  duplicate.localEventKey = 'event-2';
  duplicate.evidence[0].localEvidenceKey = 'evidence-2';
  duplicate.claims[0].localClaimKey = 'claim-2';
  duplicate.claims[0].evidenceRefs = ['evidence-2'];
  output.events.push(duplicate);
  const validated = validateChapterMeaningAnalysisOutput(output, chapter);
  assert.equal(findDuplicateMeaningEvents(validated.events).length, 1);
  assert.equal(validated.events.length, 2);
});

const baseContext = (): BuildChapterMeaningContextInput => ({
  project: { id: 'project-1', title: '作品', genre: 'ミステリー', authorIntent: '赦しを直接説明しない' },
  chapter: { ...chapter, projectId: 'project-1', order: 4, title: '帰路', purpose: '決意', povCharacterId: 'character-a', narratorId: 'narrator-a' },
  characters: [{ id: 'character-a', name: '葵' }],
  narrators: [{ id: 'narrator-a', name: '私', linkedCharacterId: 'character-a' }],
  cast: [{ characterId: 'character-a', participation: 'present' }],
  facts: [{ id: 'fact-1', content: '葵は犯人ではない', readerState: 'reader_hidden' }, { id: 'fact-ignored', content: '未関連', readerState: 'reader_hidden', relevant: false }],
  knowledge: [{ id: 'knowledge-1', factId: 'fact-1', characterId: 'character-a', status: 'believes_false', phase: 'before_chapter', beliefNotes: '自分が犯人だと思う' }],
  relationships: [{ id: 'relationship-1', sourceCharacterId: 'character-a', targetCharacterId: 'character-b', relationship: '疎遠' }],
  plots: [{ id: 'plot-1', title: '次章', content: '真実を知る' }],
  foreshadowings: [{ id: 'foreshadowing-1', title: '鍵', content: '古い鍵' }],
  creativeRules: [{ id: 'rule-1', title: '説明抑制', guidance: '台詞で全部説明しない' }],
});

test('meaning-v1 separates raw source, canonical, planned, author intent and interpretive lens', () => {
  const context = buildChapterMeaningContext(baseContext());
  assert.equal(context.targetChapterText, chapter.content);
  assert.match(context.supplementalContext, /PLANNED — NOT ACTUAL/);
  assert.match(context.supplementalContext, /AUTHOR INTENT — NOT TEXTUAL FACT/);
  assert.match(context.supplementalContext, /INTERPRETIVE \/ AUTHOR TECHNIQUE CONTEXT — NOT ACTUAL MEANING/);
  assert.doesNotMatch(context.supplementalContext, /未関連/);
  assert.equal(buildChapterMeaningPrompt(context).userMessage.includes(chapter.content), true);
});

test('required context fails closed instead of truncating, target prose remains outside supplemental budget', () => {
  assert.throws(() => buildChapterMeaningContext(baseContext(), { maxSupplementalCharacters: 100 }), MeaningContextBudgetError);
  const input = baseContext();
  input.chapter.content = '本文'.repeat(50_000);
  const context = buildChapterMeaningContext(input);
  assert.equal(context.targetChapterText.length, 100_000);
  assert.ok(context.supplementalContext.length <= 12_000);
});

test('fingerprints use supplied semantic input only and raw content has a separate non-normalizing hash', () => {
  const firstInput = baseContext();
  const first = buildChapterMeaningContext(firstInput);
  const reordered = baseContext();
  reordered.facts!.reverse();
  assert.equal(buildChapterMeaningContext(reordered).contextFingerprint, first.contextFingerprint);
  const changedIntent = baseContext(); changedIntent.project.authorIntent = '別の意図';
  assert.notEqual(buildChapterMeaningContext(changedIntent).contextFingerprint, first.contextFingerprint);
  const changedFact = baseContext(); changedFact.facts![0].content = '別の真実';
  assert.notEqual(buildChapterMeaningContext(changedFact).contextFingerprint, first.contextFingerprint);
  const changedIgnored = baseContext(); changedIgnored.facts![1].content = '変更された未関連';
  assert.equal(buildChapterMeaningContext(changedIgnored).contextFingerprint, first.contextFingerprint);
  const changedRule = baseContext(); changedRule.creativeRules![0].guidance = '別の技法';
  assert.notEqual(buildChapterMeaningContext(changedRule).contextFingerprint, first.contextFingerprint);
  assert.notEqual(computeMeaningContentHash('a\r\nb'), computeMeaningContentHash('a\nb'));
  assert.notEqual(computeMeaningContentHash('é'), computeMeaningContentHash('e\u0301'));
});

test('semantic golden cases permit quiet significance, low-significance battle, negative/static paths, aftermath and multiple interpretations', () => {
  const output = validOutput();
  output.events[0].claims = [
    { localClaimKey: 'quiet', layer: 'interpretive', dimension: 'narrative_significance', statement: '静かな発話が選択条件を変える。', supportLevel: 'plausible_interpretation', evidenceRefs: ['evidence-1'], relatedEntityRefs: [], impactScope: 'multi_chapter' },
    { localClaimKey: 'battle', layer: 'derived', dimension: 'external_tension', statement: '戦闘の障害はその場で解消する。', supportLevel: 'strongly_supported', evidenceRefs: ['evidence-1'], relatedEntityRefs: [], impactScope: 'local' },
    { localClaimKey: 'negative', layer: 'interpretive', dimension: 'character_trajectory', subtype: 'negative_change', statement: '悪化として読める。', supportLevel: 'plausible_interpretation', evidenceRefs: ['evidence-1'], relatedEntityRefs: [] },
    { localClaimKey: 'static', layer: 'interpretive', dimension: 'character_trajectory', subtype: 'stable_catalyst', statement: '変化せず他者を動かす。', supportLevel: 'plausible_interpretation', evidenceRefs: ['evidence-1'], relatedEntityRefs: [] },
    { localClaimKey: 'aftermath', layer: 'interpretive', dimension: 'aftermath', subtype: 'emotional_settling', statement: '事件後の感情を処理する。', supportLevel: 'strongly_supported', evidenceRefs: ['evidence-1'], relatedEntityRefs: [] },
    { localClaimKey: 'other-reading', layer: 'interpretive', dimension: 'thematic_significance', statement: '作者意図とは異なる解釈も成立する。', supportLevel: 'uncertain', evidenceRefs: ['evidence-1'], relatedEntityRefs: [] },
  ];
  assert.equal(validateChapterMeaningAnalysisOutput(output, chapter).events[0].claims.length, 6);
});

test('semantic golden cases preserve reader/character, false belief, narrated claim, planned/actual and apparent resolution distinctions', () => {
  const output = validOutput();
  output.events[0].claims = [
    { localClaimKey: 'reader', layer: 'derived', dimension: 'reader_knowledge_change', subtype: 'reader_learns', statement: '読者だけが手掛かりを得る。', supportLevel: 'strongly_supported', evidenceRefs: ['evidence-1'], relatedEntityRefs: [] },
    { localClaimKey: 'false-belief', layer: 'derived', dimension: 'character_knowledge_change', subtype: 'false_belief_introduced', statement: '主人公に誤認が生じる。', supportLevel: 'strongly_supported', evidenceRefs: ['evidence-1'], relatedEntityRefs: [] },
    { localClaimKey: 'narrated', layer: 'observed', dimension: 'truth_revelation', subtype: 'claim_introduced', statement: '語り手は無実だと述べた。', supportLevel: 'explicit_text', evidenceRefs: ['evidence-1'], relatedEntityRefs: [] },
    { localClaimKey: 'planned', layer: 'interpretive', dimension: 'narrative_significance', statement: '計画情報は本文で起きた事実ではない。', supportLevel: 'uncertain', evidenceRefs: ['evidence-1'], relatedEntityRefs: [] },
    { localClaimKey: 'apparent', layer: 'interpretive', dimension: 'resolution', subtype: 'apparent_temporary', statement: '一時的解決として読める。', supportLevel: 'plausible_interpretation', evidenceRefs: ['evidence-1'], relatedEntityRefs: [] },
    { localClaimKey: 'failed', layer: 'interpretive', dimension: 'character_trajectory', subtype: 'failed_change', statement: '変化の試みは実らない。', supportLevel: 'plausible_interpretation', evidenceRefs: ['evidence-1'], relatedEntityRefs: [] },
    { localClaimKey: 'relationship', layer: 'derived', dimension: 'relationship_change', statement: '関係の距離が変化する。', supportLevel: 'plausible_interpretation', evidenceRefs: ['evidence-1'], relatedEntityRefs: [] },
  ];
  assert.equal(validateChapterMeaningAnalysisOutput(output, chapter).events[0].claims.length, 7);
});
