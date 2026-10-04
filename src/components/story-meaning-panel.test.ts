import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/components/story-meaning-panel.tsx', 'utf8');

test('author UI is event-first, Japanese, progressive, and not a scoring surface', () => {
  assert.match(source, /物語意味解析/); assert.match(source, /作品評価ではありません/);
  assert.match(source, /読み取られた出来事/); assert.match(source, /本文の根拠/); assert.match(source, /aria-expanded/);
  assert.doesNotMatch(source, /importanceScore|climaxScore|tensionScore|growthScore|qualityScore|meaningScore|信頼度\s*%/);
});

test('dirty and stale source boundaries disable analysis and evidence navigation', () => {
  assert.match(source, /未保存本文は解析対象になりません/);
  assert.match(source, /disabled=\{loading \|\| state === 'pending' \|\| hasUnsavedChanges\}/);
  assert.match(source, /selectedRun\?\.fresh && !hasUnsavedChanges/);
  assert.match(source, /現在本文への移動は無効/);
});

test('analysis is explicit and author decisions do not invoke analysis', () => {
  assert.match(source, /onClick=\{\(\) => void analyze/);
  assert.match(source, /\/api\/story-meaning\/decisions/);
  const decisionFunction = source.slice(source.indexOf('const decide ='), source.indexOf('return <div'));
  assert.doesNotMatch(decisionFunction, /analyze\(/);
});
