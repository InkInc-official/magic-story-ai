import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildChapterGenerationContext, type ChapterGenerationSource } from './generation-context.js';

function source(overrides: Partial<ChapterGenerationSource> = {}): ChapterGenerationSource {
  const characters = Array.from({ length: 12 }, (_, index) => ({
    id: `c${index}`, name: `人物${index}`, role: index === 0 ? '主角' : '配角',
    personality: '慎重で観察力が高い。'.repeat(30), firstPerson: index === 0 ? '私' : '僕',
    defaultSecondPerson: 'あなた', speechRegister: 'polite', speechStyleNotes: '短く落ち着いて話す。'.repeat(20),
    narrationVoiceNotes: index === 0 ? '感情を抑えた近い語り。' : '',
  }));
  return {
    chapterId: 'chapter', chapterOrder: 10, title: '人物0の決意', outline: '人物0が禁域へ進むと決める。'.repeat(200), summary: '',
    emotionTarget: '紧张', emotionArc: 'V型', hookStart: '', hookEnd: '悬念', povCharacterId: 'c0', purpose: '事件への関与を決意する', targetWordCount: 4000, endingNotes: '静かな決意で終える',
    project: { title: '長編', genre: '奇幻', description: '世界の秘密を追う物語。'.repeat(100), narrativePerspective: 'first_person', writingStyleNotes: '簡潔な地の文', chapterLengthPolicy: 'guide', formattingNotes: '会話末尾に句点を付けない' },
    previousChapter: { id: 'previous', title: '前章', summary: '人物0は手掛かりを得た。', content: '本文。'.repeat(3000) }, latestOutline: '全体プロット。'.repeat(1000), characters, relationships: [],
    chapterCharacters: characters.map((character, index) => ({ characterId: character.id, participation: index < 10 ? 'present' as const : 'mentioned' as const, notes: index === 0 ? '決意を固める' : '', order: index, character })),
    worldSettings: Array.from({ length: 20 }, (_, index) => ({ name: `世界${index}`, description: '長い背景。'.repeat(300), rules: '破ってはならない規則。'.repeat(100) })),
    scenes: [], foreshadowings: Array.from({ length: 20 }, (_, index) => ({ chapterId: 'chapter', content: `伏線${index}。秘密の鍵。`.repeat(50), expectedResolveChapter: 11, status: 'active', importance: 'high' })),
    storyStates: [{ chapterId: 'chapter', type: 'location', data: '禁域の入口。'.repeat(200) }], plots: [{ name: '禁域編', description: '進行中の筋。'.repeat(500), status: 'active', priority: 10 }],
    storyNodes: Array.from({ length: 20 }, (_, index) => ({ id: `n${index}`, title: `人物0のノード${index}`, description: '背景ノード。'.repeat(100), order: index })),
    storyEdges: Array.from({ length: 20 }, (_, index) => ({ sourceId: `n${index}`, targetId: `n${index + 1}`, edgeType: 'next' })), ...overrides,
  };
}

describe('buildChapterGenerationContext integration', () => {
  test('protects chapter intent, POV, voice, cast and continuity under heavy optional context', () => {
    const context = buildChapterGenerationContext(source());
    assert.ok(context.length <= 18_000);
    assert.ok(context.includes('章の目的：事件への関与を決意する'));
    assert.ok(context.includes('視点人物：人物0'));
    assert.ok(context.includes('文体：簡潔な地の文'));
    assert.ok(context.includes('表記・組版：会話末尾に句点を付けない'));
    assert.ok(context.includes('一人称：私'));
    assert.ok(context.includes('決意を固める'));
    assert.ok(context.includes('直前の章'));
    const mentionedIndex = context.indexOf('言及のみ');
    assert.ok(mentionedIndex === -1 || context.indexOf('人物0') < mentionedIndex);
  });

  test('retains fallback cast selection when explicit cast is absent', () => {
    const context = buildChapterGenerationContext(source({ chapterCharacters: [] }));
    assert.ok(context.includes('POV人物'));
    assert.ok(context.includes('人物0'));
  });

  test('adds a POV character even when absent from explicit cast', () => {
    const base = source();
    const context = buildChapterGenerationContext(source({ chapterCharacters: base.chapterCharacters?.filter(entry => entry.characterId !== 'c0') }));
    assert.ok(context.includes('【POV人物】'));
    assert.ok(context.includes('人物0'));
  });
});
