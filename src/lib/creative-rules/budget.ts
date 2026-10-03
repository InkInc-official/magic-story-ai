import { compareCreativeRuleEntries } from './resolver';
import { serializeCreativeRuleEntry } from './serializer';
import type { CreativeRulePromptEntry } from './types';

export interface CreativeRuleBudgetResult {
  selected: CreativeRulePromptEntry[];
  omitted: string[];
  text: string;
  characterCount: number;
  requiredOverflow: boolean;
}

export function selectCreativeRuleEntriesWithinBudget(entries: readonly CreativeRulePromptEntry[], maximumCharacters: number): CreativeRuleBudgetResult {
  const ordered = [...entries].sort(compareCreativeRuleEntries);
  const selected: CreativeRulePromptEntry[] = []; const omitted: string[] = []; const blocks: string[] = [];
  let characterCount = 0; let requiredOverflow = false;
  for (const entry of ordered) {
    const block = serializeCreativeRuleEntry(entry); const separator = blocks.length > 0 ? 2 : 0;
    if (characterCount + separator + block.length <= maximumCharacters) {
      selected.push(entry); blocks.push(block); characterCount += separator + block.length;
    } else {
      omitted.push(entry.stableId);
      if (entry.mode === 'required' || entry.mode === 'forbidden') requiredOverflow = true;
    }
  }
  return { selected, omitted, text: blocks.join('\n\n'), characterCount, requiredOverflow };
}
