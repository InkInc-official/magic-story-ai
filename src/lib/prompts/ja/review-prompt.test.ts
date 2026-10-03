import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildContextWithinBudget, type ContextEntry } from './context-budget.js';
import { REVIEW_SUPPLEMENTAL_CONTEXT_LIMIT, buildReviewUserMessage } from './review-prompt.js';

test('review supplemental context is capped independently from target prose', () => {
  const entries: ContextEntry[] = [
    { id: 'required', tier: 0, required: true, full: '必須設定', minimum: '必須設定' },
    ...Array.from({ length: 30 }, (_, index) => ({ id: `optional-${index}`, tier: 2 as const, full: `辞書設定${index}：${'補助'.repeat(500)}` })),
  ];
  const supplemental = buildContextWithinBudget(entries, REVIEW_SUPPLEMENTAL_CONTEXT_LIMIT).text;
  const targetProse = '長編本文'.repeat(3_000);
  const message = buildReviewUserMessage({
    reviewerInstruction: '構成を確認する', outputContract: '根拠を示す', supplementalContext: supplemental,
    chapterPurpose: '転換点', chapterTitle: '長い章', targetProse,
  });

  assert.ok(supplemental.length <= REVIEW_SUPPLEMENTAL_CONTEXT_LIMIT);
  assert.match(supplemental, /必須設定/);
  assert.match(message, /【作品設定・補助コンテキスト】/);
  assert.match(message, /【評価対象本文】/);
  assert.ok(message.includes(targetProse), '8,000文字の補助context上限で評価対象本文を切断しない');
});

test('review prompt rejects an uncapped supplemental context', () => {
  assert.throws(() => buildReviewUserMessage({
    reviewerInstruction: '確認', outputContract: '出力', supplementalContext: 'x'.repeat(REVIEW_SUPPLEMENTAL_CONTEXT_LIMIT + 1),
    chapterTitle: '章', targetProse: '本文',
  }), /8,000文字/);
});
