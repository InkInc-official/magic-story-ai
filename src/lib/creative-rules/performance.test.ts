import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { selectCreativeRulesForSurface } from './resolver.js';
import type { CustomCreativeRule } from './types.js';

test('resolverは500 custom rulesでもall-pairs比較に依存しない', () => {
  const rules: CustomCreativeRule[] = Array.from({ length: 500 }, (_, index) => ({
    id: `custom-${index}`, kind: 'custom', title: `方針${index}`, instruction: `作者方針${index}`,
    category: 'style', mode: index % 5 === 0 ? 'required' : 'reference', priority: index % 101,
    overridable: true, source: 'author', active: true,
  }));
  const started = performance.now(); const result = selectCreativeRulesForSurface(rules, 'writer'); const elapsed = performance.now() - started;
  assert.equal(result.activeGuidanceRules.length, 500);
  assert.ok(elapsed < 1_000, `resolver took ${elapsed.toFixed(1)}ms`);
});
