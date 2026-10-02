import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILTIN_SYMBOL_PAIRS, JAPANESE_TEXT_PARSER_VERSION, analyzeJapaneseTextSource } from '../japanese-text/index.js';
import {
  buildRuntimeSymbolPairDefinitions,
  buildSymbolOccurrenceAnchor,
  hashRawSymbolSource,
  matchSymbolOccurrence,
  resolveSymbolOccurrences,
  sortSymbolDefinitions,
  sortSymbolOccurrenceOverrides,
  sortSymbolUsageRules,
  validateSymbolDefinitions,
  validateSymbolDictionary,
  validateSymbolUsageRules,
  type SymbolDefinition,
  type SymbolOccurrenceOverride,
  type SymbolUsageRule,
} from './index.js';

const projectId = 'project';
const chapterId = 'chapter';

function definition(overrides: Partial<SymbolDefinition> = {}): SymbolDefinition {
  return {
    id: 'kagi', projectId, openSymbol: '「', closeSymbol: '」', label: 'かぎ括弧', active: true, order: 0, defaultUsageRuleId: null,
    ...overrides,
  };
}

function rule(overrides: Partial<SymbolUsageRule> = {}): SymbolUsageRule {
  return {
    id: 'dialogue', projectId, definitionId: 'kagi', label: '通常会話', description: '人物が声に出す通常会話', semanticKind: 'dialogue',
    countsAsDialogue: true, countsAsNarration: false, countsAsInnerVoice: null, readerVisible: true, spokenAloud: true,
    speakerMode: 'contextual', fixedSpeakerId: null, priority: 0, active: true, provenance: 'author', ...overrides,
  };
}

function resolve(content: string, values: Partial<Parameters<typeof resolveSymbolOccurrences>[0]> = {}) {
  return resolveSymbolOccurrences({ projectId, chapterId, content, definitions: [], usageRules: [], overrides: [], ...values });
}

test('custom pairを追加してもbuilt-in 10 pairを完全に維持する', () => {
  const custom = definition({ id: 'custom', openSymbol: '<<', closeSymbol: '>>', label: '特殊' });
  const runtime = buildRuntimeSymbolPairDefinitions([custom]);
  assert.equal(runtime.filter(value => value.source === 'builtin').length, BUILTIN_SYMBOL_PAIRS.length);
  assert.equal(runtime.length, BUILTIN_SYMBOL_PAIRS.length + 1);
  for (const value of BUILTIN_SYMBOL_PAIRS) assert.ok(runtime.some(item => item.id === value.id && item.openSymbol === value.openSymbol && item.closeSymbol === value.closeSymbol));
});

test('built-in pairのsemantic Definitionはstructural pairを重複させない', () => {
  const runtime = buildRuntimeSymbolPairDefinitions([definition()]);
  assert.equal(runtime.filter(value => value.openSymbol === '「' && value.closeSymbol === '」').length, 1);
  assert.equal(runtime.find(value => value.openSymbol === '「')?.structuralKey, 'builtin:corner-brackets');
  assert.equal(runtime.find(value => value.openSymbol === '「')?.projectDefinitionId, 'kagi');
});

test('custom pairをruntime parserへ渡してRegion検出できる', () => {
  const custom = definition({ id: 'custom', openSymbol: '<<', closeSymbol: '>>', label: '特殊' });
  const runtime = buildRuntimeSymbolPairDefinitions([custom]);
  const analysis = analyzeJapaneseTextSource('<<hello>>', { pairedSymbols: runtime });
  assert.equal(analysis.symbolRegions.length, 1);
  assert.equal(analysis.symbolRegions[0].pairId, 'project-symbol:custom');
});

test('長いprefixを優先して短いpairと決定的に共存する', () => {
  const definitions = [
    definition({ id: 'short', openSymbol: '<', closeSymbol: '>', label: '短い', order: 1 }),
    definition({ id: 'long', openSymbol: '<<', closeSymbol: '>>', label: '長い', order: 0 }),
  ];
  const analysis = analyzeJapaneseTextSource('<a>\n<<b>>', { pairedSymbols: buildRuntimeSymbolPairDefinitions(definitions) });
  assert.deepEqual(analysis.symbolRegions.map(value => analysisText('<a>\n<<b>>', value)), ['<a>', '<<b>>']);
});

test('same pair重複とsame opener different closerを拒否する', () => {
  const duplicate = validateSymbolDefinitions([definition(), definition({ id: 'duplicate' })]);
  assert.ok(duplicate.some(value => value.code === 'duplicate_pair'));
  const conflicting = validateSymbolDefinitions([definition({ openSymbol: '<', closeSymbol: '>' }), definition({ id: 'other', openSymbol: '<', closeSymbol: '/>' })]);
  assert.ok(conflicting.some(value => value.code === 'same_opener_different_closer'));
});

test('symmetric ASCII quote pairをclosed Regionとして扱う', () => {
  for (const [openSymbol, id] of [['"', 'double'], ["'", 'single']] as const) {
    const custom = definition({ id, openSymbol, closeSymbol: openSymbol, label: id });
    const content = `${openSymbol}hello${openSymbol}`;
    const result = resolve(content, { definitions: [custom] });
    assert.equal(result.occurrences[0].region.status, 'closed');
  }
});

test('empty・newline・control・8書記素超のsymbolを拒否しraw表記をnormalizeしない', () => {
  const invalid = [
    definition({ openSymbol: '' }),
    definition({ id: 'newline', openSymbol: '\n' }),
    definition({ id: 'control', openSymbol: '\u0001' }),
    definition({ id: 'long', openSymbol: 'あ'.repeat(9) }),
  ];
  const codes = invalid.flatMap(value => validateSymbolDefinitions([value]).map(item => item.code));
  for (const code of ['empty_symbol', 'line_break_symbol', 'control_character_symbol', 'symbol_too_long']) assert.ok(codes.includes(code));
  const decomposed = definition({ openSymbol: 'か\u3099', closeSymbol: 'ぎ', label: '結合文字' });
  assert.equal(validateSymbolDefinitions([decomposed]).length, 0);
  assert.equal(buildRuntimeSymbolPairDefinitions([decomposed]).at(-1)?.openSymbol, 'か\u3099');
});

test('複数Usageまたは単一Usageだけではdefault確定しない', () => {
  for (const usageRules of [[rule()], [rule(), rule({ id: 'inner', semanticKind: 'inner_voice' }), rule({ id: 'special', semanticKind: 'special_voice' })]]) {
    const result = resolve('「本文」', { definitions: [definition()], usageRules });
    assert.equal(result.occurrences[0].status, 'unresolved');
  }
});

test('activeなauthor defaultだけをconfirmed_defaultにする', () => {
  const result = resolve('「本文」', { definitions: [definition({ defaultUsageRuleId: 'dialogue' })], usageRules: [rule()] });
  assert.equal(result.occurrences[0].status, 'confirmed_default');
  assert.equal(result.occurrences[0].usageRule?.id, 'dialogue');
});

test('exact confirmed Overrideがdefaultより優先される', () => {
  const content = '「本文」';
  const base = definition({ defaultUsageRuleId: 'dialogue' });
  const inner = rule({ id: 'inner', semanticKind: 'inner_voice', countsAsDialogue: true, countsAsInnerVoice: true, spokenAloud: false });
  const override = buildSymbolOccurrenceAnchor({ id: 'override', projectId, chapterId, content, definition: base, usageRuleId: 'inner', status: 'confirmed', range: { startOffset: 0, endOffset: content.length } });
  const result = resolve(content, { definitions: [base], usageRules: [rule(), inner], overrides: [override] });
  assert.equal(result.occurrences[0].status, 'confirmed_override');
  assert.equal(result.occurrences[0].usageRule?.id, 'inner');
  assert.equal(result.occurrences[0].usageRule?.countsAsDialogue, true);
  assert.equal(result.occurrences[0].usageRule?.countsAsInnerVoice, true);
});

test('conventional suggestionをconfirmedへ昇格せずknown pairの意味なしはunresolved', () => {
  const convention = resolve('「本文」', { conventionalSuggestions: [{ openSymbol: '「', closeSymbol: '」', label: '一般的な会話', semanticKind: 'dialogue' }] });
  assert.equal(convention.occurrences[0].status, 'convention_only');
  assert.equal(convention.occurrences[0].usageRule, null);
  assert.equal(resolve('「本文」').occurrences[0].status, 'unresolved');
  assert.equal(resolve('「本文」', { definitions: [definition()] }).occurrences[0].status, 'unresolved');
});

test('nested Regionをouter/inner別Occurrenceとして解決する', () => {
  const outer = definition({ defaultUsageRuleId: 'dialogue' });
  const innerDefinition = definition({ id: 'nijukagi', openSymbol: '『', closeSymbol: '』', label: '二重かぎ', defaultUsageRuleId: 'quote' });
  const quote = rule({ id: 'quote', definitionId: 'nijukagi', semanticKind: 'quotation' });
  const result = resolve('「彼は『行く』と言った」', { definitions: [outer, innerDefinition], usageRules: [rule(), quote] });
  assert.deepEqual(result.occurrences.map(value => [value.region.depth, value.status, value.usageRule?.id]), [[0, 'confirmed_default', 'dialogue'], [1, 'confirmed_default', 'quote']]);
});

test('unclosed/mismatched Regionをsemantic confirmedにしない', () => {
  const values = [resolve('「閉じない', { definitions: [definition({ defaultUsageRuleId: 'dialogue' })], usageRules: [rule()] }), resolve('「不一致』', { definitions: [definition({ defaultUsageRuleId: 'dialogue' })], usageRules: [rule()] })];
  assert.ok(values.every(value => value.occurrences[0].status === 'invalid_structure'));
});

test('Occurrence anchorはpair全体range・raw hash・決定的fingerprintを保持する', () => {
  const content = '前。「本文」。後。'; const startOffset = content.indexOf('「'); const endOffset = content.indexOf('」') + 1;
  const first = buildSymbolOccurrenceAnchor({ id: 'o', projectId, chapterId, content, definition: definition(), usageRuleId: 'dialogue', status: 'confirmed', range: { startOffset, endOffset } });
  const second = buildSymbolOccurrenceAnchor({ id: 'o2', projectId, chapterId, content, definition: definition(), usageRuleId: 'dialogue', status: 'confirmed', range: { startOffset, endOffset } });
  assert.equal(first.exactExcerpt, '「本文」');
  assert.equal(first.contentHash, hashRawSymbolSource(content));
  assert.equal(first.anchorFingerprint, second.anchorFingerprint);
  assert.deepEqual(matchSymbolOccurrence(content, first), { status: 'exact', range: { startOffset, endOffset } });
});

test('本文前方の編集後はunique anchorをreanchorableとして提案するが自動確定しない', () => {
  const stablePrefix = '前'.repeat(80); const original = `${stablePrefix}「本文」後`; const startOffset = original.indexOf('「');
  const base = definition();
  const override = buildSymbolOccurrenceAnchor({ id: 'o', projectId, chapterId, content: original, definition: base, usageRuleId: 'dialogue', status: 'confirmed', range: { startOffset, endOffset: startOffset + '「本文」'.length } });
  const changed = `追加${original}`;
  const match = matchSymbolOccurrence(changed, override);
  assert.equal(match.status, 'reanchorable');
  if (match.status !== 'reanchorable') assert.fail();
  const result = resolve(changed, { definitions: [base], usageRules: [rule()], overrides: [override] });
  const occurrence = result.occurrences.find(value => value.rawText === '「本文」')!;
  assert.equal(occurrence.status, 'stale_override');
  assert.deepEqual(occurrence.suggestedRange, match.suggestedRange);
});

test('同じexcerpt/anchorが複数ならambiguous staleにする', () => {
  const content = `${'A'.repeat(64)}「同じ」${'B'.repeat(64)}`; const startOffset = content.indexOf('「');
  const override = buildSymbolOccurrenceAnchor({ id: 'o', projectId, chapterId, content, definition: definition(), usageRuleId: 'dialogue', status: 'confirmed', range: { startOffset, endOffset: startOffset + '「同じ」'.length } });
  const ambiguous = `${content}区切り${content}`;
  assert.deepEqual(matchSymbolOccurrence(ambiguous, { ...override, contentHash: 'changed' }), { status: 'stale', reason: 'ambiguous' });
});

test('Unicode anchorはemoji/ZWJ/combiningを分断せずCRLFをraw保持する', () => {
  const family = '👨‍👩‍👧‍👦'; const combining = 'か\u3099';
  const content = `${family.repeat(8)}${combining.repeat(8)}\r\n「本文」\r\n${family.repeat(8)}`;
  const startOffset = content.indexOf('「');
  const override = buildSymbolOccurrenceAnchor({ id: 'o', projectId, chapterId, content, definition: definition(), usageRuleId: 'dialogue', status: 'confirmed', range: { startOffset, endOffset: startOffset + '「本文」'.length } });
  assert.doesNotMatch(override.anchorBefore, /^[\u0300-\u036f\u3099\uFE0F\u200D]/u);
  assert.doesNotMatch(override.anchorBefore, /[\uD800-\uDBFF]$/u);
  assert.ok(override.anchorBefore.endsWith('\r\n'));
  assert.equal(content.slice(override.startOffset, override.endOffset), override.exactExcerpt);
});

test('inactive custom Definitionはruntimeから消え、inactive built-in semantic Definitionでもbuilt-in構造は残る', () => {
  const custom = definition({ id: 'custom', openSymbol: '<<', closeSymbol: '>>', label: 'custom', active: false });
  const inactiveBuiltIn = definition({ active: false, defaultUsageRuleId: 'dialogue' });
  const runtime = buildRuntimeSymbolPairDefinitions([custom, inactiveBuiltIn]);
  assert.equal(runtime.some(value => value.openSymbol === '<<'), false);
  assert.equal(runtime.some(value => value.openSymbol === '「'), true);
  assert.equal(runtime.find(value => value.openSymbol === '「')?.projectDefinitionId, null);
  const result = resolve('「本文」', { definitions: [inactiveBuiltIn], usageRules: [rule()] });
  assert.equal(result.occurrences[0].status, 'unresolved');
});

test('inactive default ruleはvalidation errorとなりresolverではconfirmedにしない', () => {
  const def = definition({ defaultUsageRuleId: 'dialogue' }); const inactive = rule({ active: false });
  assert.ok(validateSymbolDictionary({ projectId, definitions: [def], usageRules: [inactive] }).some(value => value.code === 'invalid_default_usage'));
  assert.equal(resolve('「本文」', { definitions: [def], usageRules: [inactive] }).occurrences[0].status, 'unresolved');
});

test('fixed speaker shapeを検証しnullable/nonexclusive dimensionsを保持する', () => {
  assert.ok(validateSymbolUsageRules([rule({ speakerMode: 'fixed_character', fixedSpeakerId: null })]).some(value => value.code === 'missing_fixed_speaker'));
  assert.ok(validateSymbolUsageRules([rule({ speakerMode: 'contextual', fixedSpeakerId: 'character' })]).some(value => value.code === 'unexpected_fixed_speaker'));
  const mixed = rule({ countsAsDialogue: true, countsAsInnerVoice: true, countsAsNarration: null, readerVisible: true, spokenAloud: false });
  assert.equal(validateSymbolUsageRules([mixed]).length, 0);
  assert.deepEqual([mixed.countsAsDialogue, mixed.countsAsInnerVoice, mixed.countsAsNarration, mixed.readerVisible, mixed.spokenAloud], [true, true, null, true, false]);
});

test('missing/inactive/different Definition Usageを持つOverrideはdefaultへsilent fallbackしない', () => {
  const content = '「本文」'; const def = definition({ defaultUsageRuleId: 'dialogue' });
  const override = buildSymbolOccurrenceAnchor({ id: 'o', projectId, chapterId, content, definition: def, usageRuleId: 'foreign', status: 'confirmed', range: { startOffset: 0, endOffset: content.length } });
  const result = resolve(content, { definitions: [def], usageRules: [rule()], overrides: [override] });
  assert.equal(result.occurrences[0].status, 'stale_override');
  assert.equal(result.occurrences[0].usageRule, null);
});

test('deterministic orderingとparser version/parse countを維持する', () => {
  const definitions = sortSymbolDefinitions([definition({ id: 'b', order: 1 }), definition({ id: 'a', openSymbol: '<', closeSymbol: '>', order: 0 })]);
  assert.deepEqual(definitions.map(value => value.id), ['a', 'b']);
  assert.deepEqual(sortSymbolUsageRules([rule({ id: 'a', priority: 0 }), rule({ id: 'b', priority: 10 })]).map(value => value.id), ['b', 'a']);
  const overrides = [{ id: 'b', startOffset: 10, endOffset: 12 }, { id: 'a', startOffset: 1, endOffset: 2 }] as SymbolOccurrenceOverride[];
  assert.deepEqual(sortSymbolOccurrenceOverrides(overrides).map(value => value.id), ['a', 'b']);
  const result = resolve('「本文」');
  assert.equal(result.parserVersion, JAPANESE_TEXT_PARSER_VERSION);
  assert.equal(result.parseCount, 1);
});

function analysisText(content: string, range: { startOffset: number; endOffset: number }) {
  return content.slice(range.startOffset, range.endOffset);
}
