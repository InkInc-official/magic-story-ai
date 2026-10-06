import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/components/story-architecture-panel.tsx', 'utf8');

test('author UI has explicit zero state and never generates on mount', () => {
  assert.match(source, /まだ物語設計は作成されていません/);
  assert.match(source, /物語設計を始める/);
  assert.match(source, /AIに提案してもらう/);
  const effects = [...source.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[/g)].map(match => match[1]);
  assert.equal(effects.some(effect => effect.includes('generateProposal(')), false);
});

test('UI keeps proposal, approved design, canon and applied data distinct', () => {
  assert.match(source, /AI提案・承認済み設計・正史・反映済みデータは別の状態/);
  assert.match(source, /承認済み設計です。正史ではなく、まだPlotにも反映されていません/);
  assert.match(source, /物語設計として承認|設計として承認/);
  assert.doesNotMatch(source, />正史に反映</);
});

test('ordering, unresolved questions and literary-safe states are first class', () => {
  assert.match(source, /作中時系列/); assert.match(source, /読者への提示順/); assert.match(source, /非線形の提示/);
  assert.match(source, /未決定や保留はエラーではなく、正常な設計状態/);
  assert.match(source, /非線形構成や静かな構造も正常な設計/);
  assert.doesNotMatch(source, /構成点|面白さ点|完成度|成長度|tension score|主人公が成長していません|転換点がありません/);
});

test('proposal alternatives remain isolated and decisions are item-level', () => {
  assert.match(source, /run\.alternatives\?\.map/);
  assert.match(source, /alternative\.threads/); assert.match(source, /alternative\.beats/);
  assert.match(source, /Object\.entries\(DECISION\)/); assert.match(source, /AI提案：却下/);
  assert.match(source, /使用終了/);
});

test('dirty state blocks proposal and apply while project switch clears transient state', () => {
  assert.match(source, /AI提案を実行する前に変更を保存してください/);
  assert.match(source, /Plot計画への反映を準備する前に変更を保存してください/);
  assert.match(source, /setSelection\(null\)[\s\S]*setDraft\(\{\}\)[\s\S]*setDirty\(false\)[\s\S]*setProposalRuns\(\[\]\)[\s\S]*setProposalOpen\(false\)[\s\S]*setApplyPreview\(null\)/);
  assert.match(source, /requestId\.current/);
});

test('apply UX preserves draft preview approve execute separation', () => {
  assert.match(source, /apply-actions\/draft/); assert.match(source, /apply-actions\/preview/);
  assert.match(source, /この反映内容を承認/); assert.match(source, /Plotを作成する/);
  assert.match(source, /作成：1 \/ 更新：0 \/ 削除：0/);
  assert.match(source, /StoryFact：変更なし/); assert.match(source, /登場人物の知識：変更なし/);
  assert.match(source, /作成済みPlotはここから自動削除されません/);
});

test('responsive workspace uses existing component system and accessible dialogs', () => {
  assert.match(source, /lg:grid-cols-\[240px_minmax\(320px,1fr\)_360px\]/);
  assert.match(source, /role="dialog"/); assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-label="物語の流れを追加"/);
});
