import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CREATIVE_TECHNIQUE_CATALOG } from './catalog.js';
import { validateCreativeTechniqueCatalog } from './validation.js';
import type { CreativeTechniqueKey } from './types.js';

test('built-in catalogの全contractが有効でkeyが一意', () => {
  assert.equal(CREATIVE_TECHNIQUE_CATALOG.length, 28);
  assert.deepEqual(validateCreativeTechniqueCatalog(CREATIVE_TECHNIQUE_CATALOG), []);
  assert.equal(new Set(CREATIVE_TECHNIQUE_CATALOG.map(value => value.key)).size, CREATIVE_TECHNIQUE_CATALOG.length);
});

test('異なる創作文化の技法を同格のbuilt-inとして保持する', () => {
  const keys = new Set(CREATIVE_TECHNIQUE_CATALOG.map(value => value.key));
  for (const key of ['three_act_structure', 'kishotenketsu', 'chapter_end_hook', 'quiet_chapter_ending', 'reversal_catharsis'] as CreativeTechniqueKey[]) assert.ok(keys.has(key));
});

test('catalog wordingは普遍的な品質断定を含まない', () => {
  const text = CREATIVE_TECHNIQUE_CATALOG.flatMap(value => [value.label, value.shortDescription, ...Object.values(value.guidance)]).join('\n');
  assert.doesNotMatch(text, /良い小説|正しい小説|読者を飽きさせないため絶対|必ず.{0,8}べき/u);
});

test('現在のcommon doctrineに対応するfallback metadataを持つ', () => {
  const fallbacks = new Set(CREATIVE_TECHNIQUE_CATALOG.filter(value => value.fallbackSectionKey).map(value => value.key));
  assert.deepEqual([...fallbacks].sort(), ['causal_progression', 'scene_focus_change', 'sentence_ending_variety', 'sentence_length_variation']);
});
