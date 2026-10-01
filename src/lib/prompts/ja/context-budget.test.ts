import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildContextWithinBudget, safeContextExcerpt, type ContextEntry } from './context-budget.js';

const entry = (overrides: Partial<ContextEntry> & Pick<ContextEntry, 'id' | 'tier' | 'full'>): ContextEntry => overrides;

describe('buildContextWithinBudget', () => {
  test('keeps required chapter intent and POV within the hard cap', () => {
    const result = buildContextWithinBudget([
      entry({ id: 'outline', tier: 0, required: true, full: `詳細プロット：${'長い入力。'.repeat(5000)}`, compact: `詳細プロット：${'要点。'.repeat(1000)}`, minimum: `詳細プロット：${'最小。'.repeat(300)}` }),
      entry({ id: 'purpose', tier: 0, required: true, full: '章の目的：主人公が決意する' }),
      entry({ id: 'pov', tier: 0, required: true, full: '視点人物：葵' }),
    ]);
    assert.ok(result.text.length <= 18_000);
    assert.ok(result.text.includes('章の目的：主人公が決意する'));
    assert.ok(result.text.includes('視点人物：葵'));
  });

  test('never lets extremely relevant Tier 1 or Tier 3 optional entries displace Tier 0 required entries', () => {
    const result = buildContextWithinBudget([
      entry({ id: 'pov', tier: 0, required: true, full: '視点人物：葵' }),
      entry({ id: 'purpose', tier: 0, required: true, full: '章の目的：事件への関与を決意する' }),
      entry({ id: 'writing', tier: 0, required: true, full: '明示執筆指示：簡潔な地の文' }),
      entry({ id: 'tier-1', tier: 1, relevance: Number.MAX_SAFE_INTEGER, full: '高関連Tier 1'.repeat(100) }),
      entry({ id: 'tier-3', tier: 3, relevance: Number.MAX_SAFE_INTEGER, full: '高関連Tier 3'.repeat(100) }),
      ...Array.from({ length: 100 }, (_, index) => entry({ id: `optional-${index}`, tier: 2, relevance: 150, full: `任意情報${index}`.repeat(50) })),
    ], 100);
    assert.ok(result.text.includes('視点人物：葵'));
    assert.ok(result.text.includes('章の目的：事件への関与を決意する'));
    assert.ok(result.text.includes('明示執筆指示：簡潔な地の文'));
    assert.equal(result.included.slice(0, 3).every(item => ['pov', 'purpose', 'writing'].includes(item.id)), true);
  });

  test('respects the review context budget independently', () => {
    const result = buildContextWithinBudget([
      entry({ id: 'review-intent', tier: 0, required: true, full: '視点・作品意図' }),
      ...Array.from({ length: 100 }, (_, index) => entry({ id: `review-${index}`, tier: 1, full: 'レビュー参考情報'.repeat(500) })),
    ], 8_000);
    assert.ok(result.text.length <= 8_000);
    assert.ok(result.text.includes('視点・作品意図'));
  });

  test('falls back from full to compact, minimum, then omission without cutting an entry', () => {
    const entries = [
      entry({ id: 'required', tier: 0, required: true, full: '必須設定' }),
      entry({ id: 'compact', tier: 1, full: 'F'.repeat(80), compact: 'COMPACT', minimum: 'MIN' }),
      entry({ id: 'minimum', tier: 2, full: 'F'.repeat(80), compact: 'C'.repeat(60), minimum: 'M' }),
      entry({ id: 'omitted', tier: 3, full: 'F'.repeat(80), compact: 'C'.repeat(60), minimum: 'O'.repeat(40) }),
    ];
    const result = buildContextWithinBudget(entries, 35);
    assert.equal(result.included.find(item => item.id === 'compact')?.representation, 'compact');
    assert.equal(result.included.find(item => item.id === 'minimum')?.representation, 'minimum');
    assert.ok(result.omitted.includes('omitted'));
    assert.ok(result.text.endsWith('M'));
  });

  test('drops mentioned and graph context before primary character voice', () => {
    const result = buildContextWithinBudget([
      entry({ id: 'voice', tier: 1, relevance: 100, full: `主要人物の音声：${'声'.repeat(80)}`, compact: '主要人物の音声：一人称「私」', minimum: '主要人物：私' }),
      entry({ id: 'mentioned', tier: 3, full: `言及人物：${'人'.repeat(80)}`, compact: '言及人物：遠藤', minimum: '遠藤' }),
      entry({ id: 'graph', tier: 4, full: `背景グラフ：${'辺'.repeat(80)}`, minimum: '背景辺' }),
    ], 23);
    assert.ok(result.text.includes('主要人物'));
    assert.ok(result.omitted.includes('graph'));
    assert.ok(result.included.find(item => item.id === 'voice'));
  });

  test('uses tier then relevance deterministically', () => {
    const result = buildContextWithinBudget([
      entry({ id: 'mentioned', tier: 3, relevance: 1, full: '言及人物'.repeat(5) }),
      entry({ id: 'present', tier: 3, relevance: 100, full: '主要present人物' }),
      entry({ id: 'world', tier: 2, full: '重要な世界規則' }),
    ], 28);
    assert.ok(result.text.includes('重要な世界規則'));
    assert.ok(result.text.includes('主要present人物'));
    assert.ok(result.omitted.includes('mentioned'));
  });

  test('allows exceptional chapter relevance to promote an adjacent-tier entry', () => {
    const result = buildContextWithinBudget([
      entry({ id: 'background', tier: 2, full: '低関連の背景設定' }),
      entry({ id: 'named-scene', tier: 3, relevance: 130, full: '章題に一致する場面' }),
    ], 10);
    assert.ok(result.text.includes('章題に一致'));
    assert.ok(result.omitted.includes('background'));
  });

  test('truncates only an abnormally large required representation at a safe boundary', () => {
    const result = buildContextWithinBudget([
      entry({ id: 'huge', tier: 0, required: true, full: `章設定\n\n${'段落です。'.repeat(100)}` }),
    ], 80);
    assert.ok(result.text.length <= 80);
    assert.equal(result.included[0]?.representation, 'truncated');
    assert.ok(result.text.endsWith('…'));
  });
});

describe('safeContextExcerpt', () => {
  test('prefers trailing context for previous chapter prose', () => {
    const text = `冒頭${'前'.repeat(100)}\n\n終盤の継続情報`;
    const excerpt = safeContextExcerpt(text, 30, true);
    assert.ok(excerpt.includes('終盤の継続情報'));
    assert.ok(excerpt.length <= 30);
  });
});
