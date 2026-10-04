import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { loadChapterMeaningContext, StoryMeaningContextLoadError } from './index.js';

function fakeLoaderDatabase(options: { projectId?: string; failFacts?: boolean } = {}) {
  const projectId = options.projectId || 'p1';
  const calls: string[] = [];
  const track = <T>(name: string, value: T) => async () => { calls.push(name); return value; };
  const database = {
    chapter: { findFirst: async ({ where }: { where: { projectId: string } }) => {
      calls.push('chapter');
      if (where.projectId !== projectId) return null;
      return {
        id: 'ch3', projectId, order: 3, title: '第三章', content: '葵は「鍵」を見つけた。', outlineContent: '鍵の発見', summary: '', purpose: '疑念を深める',
        povCharacterId: 'char1', narratorId: 'narrator1', targetWordCount: 3000, endingNotes: '静かな疑問',
        chapterCharacters: [{ characterId: 'char1', participation: 'present', notes: '', order: 0 }, { characterId: 'char2', participation: 'mentioned', notes: '', order: 1 }],
      };
    } },
    project: { findUnique: track('project', {
      id: projectId, title: '作品', genre: 'ミステリー', authorIntent: '赦しを描く', genreGuidanceMode: 'reference', genreGuidanceNotes: 'フェアプレイを参考にする',
      narrativePerspective: 'first_person', defaultPovCharacterId: null, defaultNarratorId: null, povNotes: '視点変更なし', writingStyleNotes: '簡潔', formattingNotes: '標準',
    }) },
    narratorProfile: { findFirst: track('narrator', { id: 'narrator1', projectId, name: '私', description: '一人称語り手', voiceNotes: '抑制的', linkedCharacterId: 'char1', identityFactId: 'factHidden', identityDisclosureMode: 'concealed', notes: '' }) },
    character: { findMany: track('characters', [
      { id: 'char1', name: '葵', role: '主角', personality: '慎重', background: '', arc: '', firstPerson: '私', defaultSecondPerson: 'あなた', speechRegister: 'polite', speechStyleNotes: '', narrationVoiceNotes: '自己弁護的' },
      { id: 'char2', name: '蓮', role: '配角', personality: '', background: '', arc: '', firstPerson: '僕', defaultSecondPerson: '君', speechRegister: '', speechStyleNotes: '', narrationVoiceNotes: '' },
    ]) },
    storyFact: { findMany: async () => {
      calls.push('facts'); if (options.failFacts) throw new Error('fact load failed');
      return [
        { id: 'factKnown', content: '鍵は蓮の物だ', importance: 'high', readerInitiallyKnows: true, plannedRevealChapterId: null, revealedChapterId: null, notes: '', plannedRevealChapter: null, revealedChapter: null },
        { id: 'factHidden', content: '語り手の正体は犯人だ', importance: 'high', readerInitiallyKnows: false, plannedRevealChapterId: 'ch5', revealedChapterId: null, notes: '', plannedRevealChapter: { id: 'ch5', order: 5, title: '第五章' }, revealedChapter: null },
        { id: 'factNow', content: '鍵が見つかる', importance: 'medium', readerInitiallyKnows: false, plannedRevealChapterId: 'ch3', revealedChapterId: null, notes: '', plannedRevealChapter: { id: 'ch3', order: 3, title: '第三章' }, revealedChapter: null },
      ];
    } },
    characterKnowledge: { findMany: track('knowledge', [
      { id: 'kPast', factId: 'factHidden', characterId: 'char1', status: 'believes_false', effectiveChapterId: 'ch2', beliefNotes: '自分は無実だ', notes: '', createdAt: new Date(1), effectiveChapter: { id: 'ch2', order: 2, title: '第二章' } },
      { id: 'kCurrent', factId: 'factNow', characterId: 'char1', status: 'knows', effectiveChapterId: 'ch3', beliefNotes: '', notes: '', createdAt: new Date(2), effectiveChapter: { id: 'ch3', order: 3, title: '第三章' } },
    ]) },
    characterRelationship: { findMany: track('relationships', [{ id: 'rel1', fromCharacterId: 'char1', toCharacterId: 'char2', type: '友人', description: '現在は疎遠', addressTerm: '蓮', speechRegister: '', speechStyleNotes: '' }]) },
    plot: { findMany: track('plots', [{ id: 'plot1', name: '鍵の謎', description: '鍵を追う', status: 'active', priority: 1, order: 0 }]) },
    foreshadowing: { findMany: track('foreshadowings', [{ id: 'fs1', chapterId: 'ch3', content: '鍵', expectedResolveChapter: 5, status: 'planted' }]) },
  } as unknown as PrismaClient;
  return { database, calls };
}

const creativeRules = async () => ({ rules: [
  { id: 'rule1', kind: 'builtin' as const, techniqueKey: 'fair_play_clues', mode: 'required' as const, priority: 1, overridable: true, authorAdjustment: '', notes: '', source: 'author' as const, active: true },
  { id: 'rule2', kind: 'builtin' as const, techniqueKey: 'sensory_detail', mode: 'reference' as const, priority: 0, overridable: true, authorAdjustment: '', notes: '', source: 'author' as const, active: true },
  { id: 'rule3', kind: 'builtin' as const, techniqueKey: 'cliffhanger', mode: 'reference' as const, priority: 0, overridable: true, authorAdjustment: '', notes: '', source: 'author' as const, active: true },
  { id: 'rule4', kind: 'custom' as const, title: '独自の構成原則', instruction: '反復を意味の変化として読む', category: 'structure' as const, mode: 'reference' as const, priority: 0, overridable: true, notes: '', source: 'author' as const, active: true },
], excluded: [{ id: 'outdated-rule', reason: 'outdated' }] });

test('loader selects saved Chapter sources and preserves truth/knowledge/planned/lens boundaries', async () => {
  const { database, calls } = fakeLoaderDatabase();
  const result = await loadChapterMeaningContext('p1', 'ch3', { database, loadCreativeRules: creativeRules });
  const payload = result.context.semanticPayload;
  assert.equal(result.context.targetChapterText, '葵は「鍵」を見つけた。');
  assert.equal(payload.target.povCharacterId, 'char1'); assert.equal(payload.target.narratorId, 'narrator1');
  assert.deepEqual(payload.actualCanonical.cast.map(value => value.characterId), ['char1', 'char2']);
  assert.equal(payload.actualCanonical.narrators[0].identityDisclosureMode, 'concealed');
  assert.equal(payload.actualCanonical.facts.find(value => value.id === 'factNow')?.readerState, 'reveal_now');
  assert.equal(payload.actualCanonical.facts.find(value => value.id === 'factHidden')?.readerState, 'reader_hidden');
  assert.equal(payload.actualCanonical.knowledge.find(value => value.id === 'kPast')?.phase, 'before_chapter');
  assert.equal(payload.actualCanonical.knowledge.find(value => value.id === 'kCurrent')?.phase, 'during_chapter');
  assert.equal(payload.actualCanonical.relationships[0].relationship, '友人');
  assert.equal(payload.planned.plots[0].id, 'plot1'); assert.equal(payload.planned.foreshadowings[0].id, 'fs1');
  assert.equal(payload.authorIntent, '赦しを描く'); assert.equal(payload.interpretiveLens.genre, 'ミステリー');
  assert.deepEqual(payload.interpretiveLens.creativeRules.map(value => value.id), ['rule1', 'rule3', 'rule4']);
  assert.ok(result.diagnostics.some(value => value.code === 'relationship_history_unavailable'));
  assert.ok(result.diagnostics.some(value => value.sourceIds?.includes('rule2')));
  assert.ok(result.diagnostics.some(value => value.sourceIds?.includes('outdated-rule')));
  assert.doesNotMatch(JSON.stringify(result.sourceManifest), /葵は「鍵」を見つけた/);
  assert.equal(calls.some(value => value.toLowerCase().includes('navigator')), false);
});

test('cross-project target and source load failures fail closed', async () => {
  const first = fakeLoaderDatabase();
  await assert.rejects(loadChapterMeaningContext('other', 'ch3', { database: first.database, loadCreativeRules: creativeRules }), (error: unknown) => error instanceof StoryMeaningContextLoadError && error.code === 'ownership');
  const second = fakeLoaderDatabase({ failFacts: true });
  await assert.rejects(loadChapterMeaningContext('p1', 'ch3', { database: second.database, loadCreativeRules: creativeRules }), (error: unknown) => error instanceof StoryMeaningContextLoadError && error.code === 'source_load_failed');
});

test('loader query count is bounded and does not grow per Fact or Character', async () => {
  const { database, calls } = fakeLoaderDatabase();
  await loadChapterMeaningContext('p1', 'ch3', { database, loadCreativeRules: creativeRules });
  for (const name of ['chapter', 'project', 'narrator', 'characters', 'facts', 'knowledge', 'relationships', 'plots', 'foreshadowings']) assert.equal(calls.filter(value => value === name).length, 1);
});
