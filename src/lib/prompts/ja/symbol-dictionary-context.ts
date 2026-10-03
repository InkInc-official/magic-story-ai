import { buildContextWithinBudget, type ContextEntry } from './context-budget';

export interface PromptSymbolUsageRule {
  id: string;
  label: string;
  description?: string;
  semanticKind?: string;
  countsAsDialogue?: boolean | null;
  countsAsNarration?: boolean | null;
  countsAsInnerVoice?: boolean | null;
  readerVisible?: boolean | null;
  spokenAloud?: boolean | null;
  speakerMode?: string;
  fixedSpeakerId?: string | null;
  fixedSpeaker?: { id: string; name: string } | null;
  priority: number;
  active: boolean;
}

export interface PromptSymbolDefinition {
  id: string;
  openSymbol: string;
  closeSymbol: string;
  label: string;
  active: boolean;
  order: number;
  defaultUsageRuleId?: string | null;
  usageRules: PromptSymbolUsageRule[];
}

export interface SymbolDictionaryPromptSection {
  text: string;
  includedDefinitionIds: string[];
  omittedDefinitionIds: string[];
}

const quoted = (value: string) => JSON.stringify(value);
const yesNo = (value: boolean) => value ? 'はい' : 'いいえ';

function speakerLabel(rule: PromptSymbolUsageRule): string | null {
  if (rule.speakerMode === 'fixed_character') return rule.fixedSpeaker?.name ? `固定人物：${quoted(rule.fixedSpeaker.name)}` : '固定人物（人物情報を取得できません）';
  if (rule.speakerMode === 'current_pov') return '現在のPOV人物';
  if (rule.speakerMode === 'contextual') return '文脈によって変わる';
  if (rule.speakerMode === 'none') return '話者なし';
  return null;
}

function usageDetails(rule: PromptSymbolUsageRule, analysisMetadata: boolean): string[] {
  const lines = [
    rule.description?.trim() && `説明：${quoted(rule.description)}`,
    speakerLabel(rule) && `話者：${speakerLabel(rule)}`,
    rule.spokenAloud !== null && rule.spokenAloud !== undefined && `声に出している：${yesNo(rule.spokenAloud)}`,
    rule.readerVisible !== null && rule.readerVisible !== undefined && `読者に見える：${yesNo(rule.readerVisible)}`,
  ];
  if (analysisMetadata) lines.push(
    rule.countsAsDialogue !== null && rule.countsAsDialogue !== undefined && `会話として数える：${yesNo(rule.countsAsDialogue)}`,
    rule.countsAsNarration !== null && rule.countsAsNarration !== undefined && `地の文として数える：${yesNo(rule.countsAsNarration)}`,
    rule.countsAsInnerVoice !== null && rule.countsAsInnerVoice !== undefined && `内面として数える：${yesNo(rule.countsAsInnerVoice)}`,
  );
  return lines.filter((line): line is string => Boolean(line));
}

function definitionRepresentations(definition: PromptSymbolDefinition, analysisMetadata: boolean): Pick<ContextEntry, 'full' | 'compact' | 'minimum'> {
  const usages = definition.usageRules
    .filter(rule => rule.active)
    .sort((a, b) => Number(b.id === definition.defaultUsageRuleId) - Number(a.id === definition.defaultUsageRuleId)
      || b.priority - a.priority || a.id.localeCompare(b.id));
  const defaultRule = usages.find(rule => rule.id === definition.defaultUsageRuleId);
  const alternatives = usages.filter(rule => rule.id !== defaultRule?.id);
  const pair = `${definition.openSymbol}...${definition.closeSymbol}`;
  const usageLines = usages.flatMap(rule => [
    `  - ${rule.id === defaultRule?.id ? '通常の用途' : '登録用途'}：${quoted(rule.label)}`,
    ...usageDetails(rule, analysisMetadata).map(line => `    ${line}`),
  ]);
  const selectionRule = defaultRule
    ? (alternatives.length > 0 ? '  - 別用途は登録されていますが、現在の明示指示なしに通常用途から切り替えない。' : '')
    : '  - 既定用途：未設定。用途が1件だけでも既定とはみなさず、現在の明示指示なしに用途を決めない。';
  const heading = `- 表記 ${pair}${definition.label.trim() ? `（${quoted(definition.label)}）` : ''}`;
  const compactAlternatives = alternatives.length > 0 ? `\n  - 別の登録用途：${alternatives.map(rule => quoted(rule.label)).join('、')}` : '';
  const compact = defaultRule
    ? `${heading}\n  - 通常は${quoted(defaultRule.label)}${compactAlternatives}${alternatives.length > 0 ? '\n  - 明示指示なしに別用途へ切り替えない。' : ''}`
    : `${heading}\n  - 登録用途：${usages.map(rule => quoted(rule.label)).join('、')}\n  - 既定用途は未設定。明示指示なしに用途を決めない。`;
  return {
    full: [heading, ...usageLines, selectionRule].filter(Boolean).join('\n'),
    compact,
    minimum: defaultRule
      ? `${heading}\n  - 通常は${quoted(defaultRule.label)}。明示指示がある場合だけ別用途を使う。`
      : `${heading}\n  - 既定用途は未設定。用途を推定しない。`,
  };
}

export function buildSymbolDictionaryPromptSection(
  definitions: PromptSymbolDefinition[] | undefined,
  options: { maxCharacters: number; audience: 'writer' | 'review' },
): SymbolDictionaryPromptSection {
  const active = (definitions || [])
    .filter(definition => definition.active && definition.usageRules.some(rule => rule.active))
    .sort((a, b) => a.order - b.order || a.openSymbol.localeCompare(b.openSymbol)
      || a.closeSymbol.localeCompare(b.closeSymbol) || a.id.localeCompare(b.id));
  if (active.length === 0) return { text: '', includedDefinitionIds: [], omittedDefinitionIds: [] };

  const header = `【作品固有の表記ルール】
以下は作者がProjectで確定した表記設定であり、一般的な日本語表記より優先する。
現在の明示的な執筆・修正指示が競合する場合は今回だけ現在指示を優先し、Project辞書が変更されたとはみなさない。
登録された別用途を文脈だけで勝手に選ばない。辞書の説明や分析情報を読者向け本文へ直接書き出さない。`;
  const entries: ContextEntry[] = [
    { id: 'symbol-dictionary-guidance', tier: 0, required: true, full: header },
    ...active.map((definition, index) => ({
      id: `symbol-definition:${definition.id}`,
      tier: 1 as const,
      relevance: active.length - index,
      ...definitionRepresentations(definition, options.audience === 'review'),
    })),
  ];
  const result = buildContextWithinBudget(entries, options.maxCharacters);
  const includedDefinitionIds = result.included.flatMap(item => item.id.startsWith('symbol-definition:') ? [item.id.slice('symbol-definition:'.length)] : []);
  const included = new Set(includedDefinitionIds);
  const omittedDefinitionIds = active.map(definition => definition.id).filter(id => !included.has(id));
  const omission = omittedDefinitionIds.length > 0 ? `\n\n（表記辞書 ${omittedDefinitionIds.length}件は専用上限のため省略）` : '';
  return { text: `${result.text}${result.text.length + omission.length <= options.maxCharacters ? omission : ''}`, includedDefinitionIds, omittedDefinitionIds };
}
