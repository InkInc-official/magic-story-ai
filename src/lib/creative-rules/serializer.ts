import type { CreativeRulePromptEntry } from './types';

const label = { reference: '参考', required: '必須', forbidden: '禁止' } as const;

export function serializeCreativeRuleEntry(entry: CreativeRulePromptEntry): string {
  const stance = entry.mode === 'reference'
    ? '適用可能な場面で参考にする。採用しない場面を違反として扱わない。'
    : entry.mode === 'required'
      ? 'この作品で作者が採用した方針として扱う。一般的な創作上の正解という意味ではない。'
      : 'この作品で作者が避けると決めた方針として扱う。一般的な禁止事項という意味ではない。';
  return [
    `[${label[entry.mode]}] ${entry.title}`,
    `方針：${entry.guidance}`,
    `位置づけ：${stance}`,
    entry.authorAdjustment ? `作者調整：${entry.authorAdjustment}` : '',
    entry.notes ? `作者メモ：${entry.notes}` : '',
    `例外：${entry.overridable ? '今回の明示指示による例外を許可' : '競合時は作者確認が必要'}`,
  ].filter(Boolean).join('\n');
}

export function serializeCreativeRuleEntries(entries: readonly CreativeRulePromptEntry[]): string {
  return entries.map(serializeCreativeRuleEntry).join('\n\n');
}
