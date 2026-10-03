import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInspectorContext, type InspectorSources } from './inspector-context.js';
import {
  buildCanonicalInspectorSemanticFingerprintPayloadV2,
  buildCanonicalInspectorSemanticFingerprintPayloadV3,
  buildCanonicalInspectorSemanticFingerprintPayloadV4,
  buildInspectorContextFingerprint,
  CURRENT_INSPECTOR_FINGERPRINT_VERSION,
} from './inspector-fingerprint.js';
import { buildSymbolOccurrenceAnchor } from './symbol-dictionary/occurrence-anchor.js';
import { buildRuntimeCreativeRuleSet } from './creative-rules/runtime.js';

function source(): InspectorSources {
  return {
    project: { id: 'p1', narrativePerspective: 'first_person', defaultPovCharacterId: 'c1', defaultNarratorId: 'n1' },
    chapter: { id: 'ch1', projectId: 'p1', order: 2, title: '秘密', content: '前の文。秘密を疑う。後の文。', povCharacterId: 'c1', narratorId: 'n1', updatedAt: null },
    characters: [
      { id: 'c1', projectId: 'p1', name: '葵', firstPerson: '私', narrationVoiceNotes: '静かに語る' },
      { id: 'c2', projectId: 'p1', name: '蓮', firstPerson: '僕', speechStyleNotes: '短く話す' },
    ],
    narrators: [{ id: 'n1', projectId: 'p1', name: '語り手', description: '観察者', voiceNotes: '抑制的', linkedCharacterId: 'c1', identityFactId: 'f1', identityDisclosureMode: 'concealed' }],
    cast: [
      { chapterId: 'ch1', characterId: 'c2', participation: 'present', notes: '同席', order: 2 },
      { chapterId: 'ch1', characterId: 'c1', participation: 'present', notes: '視点', order: 1 },
    ],
    narrativeRules: [{ id: 'r1', projectId: 'p1', title: '秘密を伏せる', description: '開示前は断定しない', category: 'disclosure', mode: 'forbid', priority: 100, source: 'author', active: true, overridable: false }],
    storyFacts: [{ id: 'f1', projectId: 'p1', content: '秘密は葵の出自である', importance: 'high', readerInitiallyKnows: false, notes: '核心' }],
    characterKnowledge: [{ id: 'k1', factId: 'f1', characterId: 'c1', status: 'suspects', effectiveChapterId: null, beliefNotes: '自分の出自を疑う', notes: '確信はない' }],
    relationships: [{ id: 'rel1', projectId: 'p1', fromCharacterId: 'c1', toCharacterId: 'c2', type: '友人', addressTerm: '蓮', speechRegister: 'plain', speechStyleNotes: '率直' }],
  };
}

const semantic = (value: InspectorSources) => buildInspectorContextFingerprint(buildInspectorContext(value), 'semantic-v2');

test('CURRENT Inspector fingerprint versionはsemantic-v4', () => {
  assert.equal(CURRENT_INSPECTOR_FINGERPRINT_VERSION, 'semantic-v4');
});

test('legacy-v1 dispatcherはrollout前fixtureを完全維持する', () => {
  const legacy: InspectorSources = {
    project: { id: 'p1', narrativePerspective: 'first_person', defaultPovCharacterId: 'c1' },
    chapter: { id: 'ch1', projectId: 'p1', order: 0, title: '章', content: '前の文。中央の文。後の文。', povCharacterId: 'c1', narratorId: null, updatedAt: null },
    characters: [{ id: 'c1', projectId: 'p1', name: '人物', firstPerson: '私', narrationVoiceNotes: '静かに語る' }],
    narrators: [], cast: [], narrativeRules: [], storyFacts: [], characterKnowledge: [], relationships: [],
  };
  assert.equal(buildInspectorContextFingerprint(buildInspectorContext(legacy, { range: { start: 5, end: 9 } }), 'legacy-v1'), '54a95970fbd581da2e3f9bf28ebf632ec69a20ffcae498c613fe6503bd2f3ad9');
});

test('semantic-v2はmanifest-only provenance変更を無視する', () => {
  const context = buildInspectorContext(source());
  const first = buildInspectorContextFingerprint(context, 'semantic-v2');
  const changed = structuredClone(context);
  const manifest = changed.manifest as unknown as { builderVersion: string; textStructure?: { parserVersion: string; adapterVersion: string; expansionMode: string; diagnosticCodes: string[] } };
  manifest.builderVersion = 'future-builder';
  if (manifest.textStructure) {
    manifest.textStructure.parserVersion = 'future-parser';
    manifest.textStructure.adapterVersion = 'future-adapter';
    manifest.textStructure.expansionMode = 'future-expansion';
    manifest.textStructure.diagnosticCodes = ['changed'];
  }
  assert.equal(buildInspectorContextFingerprint(changed, 'semantic-v2'), first);
});

test('semantic-v2はPOV・Rule・Knowledge・Voiceの実変更を検知する', () => {
  const base = semantic(source());
  const pov = source(); pov.chapter.povCharacterId = 'c2';
  const rule = source(); rule.narrativeRules[0].description = '秘密を直ちに開示する';
  const knowledge = source(); knowledge.characterKnowledge[0].status = 'knows';
  const voice = source(); voice.characters[0].narrationVoiceNotes = '激しく語る';
  for (const changed of [pov, rule, knowledge, voice]) assert.notEqual(semantic(changed), base);
});

test('意味上順不同のDB取得順とupdatedAtだけの変更ではsemantic-v2が変わらない', () => {
  const base = source();
  const reordered = structuredClone(base);
  reordered.characters.reverse(); reordered.cast.reverse(); reordered.storyFacts.reverse();
  reordered.characterKnowledge.reverse(); reordered.relationships.reverse(); reordered.narrativeRules.reverse();
  reordered.characters[0].updatedAt = '2030-01-01T00:00:00Z';
  reordered.storyFacts[0].updatedAt = '2030-01-01T00:00:00Z';
  assert.equal(semantic(reordered), semantic(base));
});

test('raw proseをNFC化せずUnicode表現差を保持する', () => {
  const composed = source(); composed.chapter.content = 'é';
  const decomposed = source(); decomposed.chapter.content = 'e\u0301';
  assert.notEqual(semantic(composed), semantic(decomposed));
});

test('surrounding proseは意味入力だが構造node IDはpayloadへ入れない', () => {
  const context = buildInspectorContext(source(), { range: { start: 5, end: 10 } });
  const payload = buildCanonicalInspectorSemanticFingerprintPayloadV2(context);
  assert.equal(payload.target.surroundingBefore, context.inspectedText.surroundingBefore);
  assert.equal(payload.target.surroundingAfter, context.inspectedText.surroundingAfter);
  assert.doesNotMatch(JSON.stringify(payload), /sectionIds|paragraphIds|sentenceIds|adapterVersion|parserVersion/);
});

test('Symbol Dictionaryは6B-6のsemantic-v2 dependencyではない', () => {
  const base = source(); base.chapter.content = '前<<<声>>>後。';
  const withDictionary = source(); withDictionary.chapter.content = base.chapter.content;
  withDictionary.symbolDictionary = {
    definitions: [{ id: 'definition', projectId: 'p1', openSymbol: '<<<', closeSymbol: '>>>', label: '特殊声', active: true, order: 0, defaultUsageRuleId: null }],
    usageRules: [], overrides: [],
  };
  assert.equal(semantic(withDictionary), semantic(base));
  assert.notEqual(buildInspectorContextFingerprint(buildInspectorContext(withDictionary), 'semantic-v3'), buildInspectorContextFingerprint(buildInspectorContext(base), 'semantic-v3'));
});

test('semantic-v3はCreative Rules追加後もfrozen payloadを維持する', () => {
  const base = source();
  const changed = source(); changed.creativeRules = [{ id: 'rule-db-a', kind: 'builtin', techniqueKey: 'show_dont_tell', mode: 'required', priority: 10, overridable: false, authorAdjustment: '場面ごとに確認', notes: '作者メモ', source: 'author', active: true }];
  assert.deepEqual(buildCanonicalInspectorSemanticFingerprintPayloadV3(buildInspectorContext(changed)), buildCanonicalInspectorSemanticFingerprintPayloadV3(buildInspectorContext(base)));
  assert.equal(buildInspectorContextFingerprint(buildInspectorContext(changed), 'semantic-v3'), buildInspectorContextFingerprint(buildInspectorContext(base), 'semantic-v3'));
});

test('semantic-v4は実投入Creative Rulesとoff suppressionだけを追加する', () => {
  const base = source(); const baseline = buildInspectorContextFingerprint(buildInspectorContext(base), 'semantic-v4');
  const required = source(); required.creativeRules = [{ id: 'db-a', kind: 'builtin', techniqueKey: 'show_dont_tell', mode: 'required', priority: 10, overridable: false, authorAdjustment: '場面ごとに確認', notes: '作者メモ', source: 'author', active: true }];
  const reference = source(); reference.creativeRules = [{ ...required.creativeRules[0], id: 'db-b', mode: 'reference' }];
  const off = source(); off.creativeRules = [{ id: 'db-c', kind: 'builtin', techniqueKey: 'sentence_ending_variety', mode: 'off', priority: 10, overridable: false, authorAdjustment: '場面ごとに確認', notes: '作者メモ', source: 'author', active: true }];
  for (const value of [required, reference, off]) assert.notEqual(buildInspectorContextFingerprint(buildInspectorContext(value), 'semantic-v4'), baseline);
  const payload = buildCanonicalInspectorSemanticFingerprintPayloadV4(buildInspectorContext(required));
  assert.equal(payload.creativeRules.rules[0].techniqueKey, 'show_dont_tell');
  assert.doesNotMatch(JSON.stringify(payload.creativeRules), /db-a|source|catalogContractVersion|createdAt|updatedAt/);
});

test('semantic-v4はinactiveを無視しDB id・非semantic priority変更で変化しない', () => {
  const first = source(); first.creativeRules = [{ id: 'db-a', kind: 'custom', title: '独自方針', instruction: '沈黙を残す', category: 'style', mode: 'reference', priority: 1, overridable: true, notes: '', source: 'author', active: true }];
  const metadata = structuredClone(first); metadata.creativeRules![0].id = 'db-b'; metadata.creativeRules![0].priority = 2;
  assert.equal(buildInspectorContextFingerprint(buildInspectorContext(first), 'semantic-v4'), buildInspectorContextFingerprint(buildInspectorContext(metadata), 'semantic-v4'));
  const inactive = source(); inactive.creativeRules = [{ id: 'db-c', kind: 'custom', title: '独自方針', instruction: '変更後', category: 'style', mode: 'reference', priority: 1, overridable: true, notes: '', source: 'author', active: false }];
  assert.equal(buildInspectorContextFingerprint(buildInspectorContext(inactive), 'semantic-v4'), buildInspectorContextFingerprint(buildInspectorContext(source()), 'semantic-v4'));
});

test('semantic-v4はoutdated/unknown persistence rowを現在Catalogの意味でfingerprintしない', () => {
  const row = { id: 'old', techniqueKey: 'show_dont_tell', mode: 'required', priority: 1, overridable: true, authorAdjustment: '', notes: '', source: 'author', active: true, catalogContractVersion: 0 };
  const runtime = buildRuntimeCreativeRuleSet([row, { ...row, id: 'unknown', techniqueKey: 'removed_key', catalogContractVersion: 99 }], []);
  const value = source(); value.creativeRules = runtime.rules;
  assert.deepEqual(runtime.excluded, [{ id: 'old', reason: 'outdated' }, { id: 'unknown', reason: 'unknown' }]);
  assert.equal(buildInspectorContextFingerprint(buildInspectorContext(value), 'semantic-v4'), buildInspectorContextFingerprint(buildInspectorContext(source()), 'semantic-v4'));
});

test('semantic-v4はCustom instruction・authorAdjustment・notesの実変更を検知する', () => {
  const base = source(); base.creativeRules = [{ id: 'c', kind: 'custom', title: '独自方針', instruction: '沈黙を残す', category: 'style', mode: 'required', priority: 1, overridable: true, notes: '補足', source: 'author', active: true }];
  const builtin = source(); builtin.creativeRules = [{ id: 'b', kind: 'builtin', techniqueKey: 'show_dont_tell', mode: 'required', priority: 1, overridable: true, authorAdjustment: '調整A', notes: '補足A', source: 'author', active: true }];
  const fingerprint = (value: InspectorSources) => buildInspectorContextFingerprint(buildInspectorContext(value), 'semantic-v4');
  const customChanged = structuredClone(base); if (customChanged.creativeRules?.[0].kind === 'custom') customChanged.creativeRules[0].instruction = '沈黙を破る';
  const adjustment = structuredClone(builtin); if (adjustment.creativeRules?.[0].kind === 'builtin') adjustment.creativeRules[0].authorAdjustment = '調整B';
  const notes = structuredClone(builtin); if (notes.creativeRules?.[0]) notes.creativeRules[0].notes = '補足B';
  assert.notEqual(fingerprint(customChanged), fingerprint(base)); assert.notEqual(fingerprint(adjustment), fingerprint(builtin)); assert.notEqual(fingerprint(notes), fingerprint(builtin));
});

test('semantic-v3は実際に投入された関連Symbol semanticsだけをdependencyにする', () => {
  const value = source();
  value.chapter.content = '『声』と本文。';
  value.symbolDictionary = {
    definitions: [{ id: 'def', projectId: 'p1', openSymbol: '『', closeSymbol: '』', label: '特殊声', active: true, order: 10, defaultUsageRuleId: 'usage' }],
    usageRules: [{ id: 'usage', projectId: 'p1', definitionId: 'def', label: '神の声', description: '主人公だけに届く', semanticKind: 'special_voice', countsAsDialogue: false, countsAsNarration: true, countsAsInnerVoice: null, readerVisible: true, spokenAloud: false, speakerMode: 'current_pov', fixedSpeakerId: null, priority: 100, active: true, provenance: 'author' }],
    overrides: [],
  };
  const context = buildInspectorContext(value);
  const initial = buildInspectorContextFingerprint(context, 'semantic-v3');
  const changed = structuredClone(value); changed.symbolDictionary!.usageRules[0].description = '変更した意味';
  assert.notEqual(buildInspectorContextFingerprint(buildInspectorContext(changed), 'semantic-v3'), initial);
  const dimension = structuredClone(value); dimension.symbolDictionary!.usageRules[0].spokenAloud = true;
  assert.notEqual(buildInspectorContextFingerprint(buildInspectorContext(dimension), 'semantic-v3'), initial);
  const noDefault = structuredClone(value); noDefault.symbolDictionary!.definitions[0].defaultUsageRuleId = null;
  assert.notEqual(buildInspectorContextFingerprint(buildInspectorContext(noDefault), 'semantic-v3'), initial);
  assert.equal(buildInspectorContextFingerprint(buildInspectorContext(changed), 'semantic-v2'), buildInspectorContextFingerprint(context, 'semantic-v2'));
  const orderOnly = structuredClone(value); orderOnly.symbolDictionary!.definitions[0].order = 999;
  orderOnly.symbolDictionary!.usageRules[0].provenance = 'imported';
  assert.equal(buildInspectorContextFingerprint(buildInspectorContext(orderOnly), 'semantic-v3'), initial);
  assert.doesNotMatch(JSON.stringify(buildCanonicalInspectorSemanticFingerprintPayloadV3(context)), /parserVersion|parentRegionId|provenance|"order"/u);
});

test('semantic-v3は対象Occurrence Overrideの作成・変更を検知する', () => {
  const value = source(); value.chapter.content = '『声』';
  const definition = { id: 'def', projectId: 'p1', openSymbol: '『', closeSymbol: '』', label: '声', active: true, order: 0, defaultUsageRuleId: 'base' };
  const baseRule = { id: 'base', projectId: 'p1', definitionId: 'def', label: '神', description: '', semanticKind: 'special_voice' as const, countsAsDialogue: null, countsAsNarration: null, countsAsInnerVoice: null, readerVisible: null, spokenAloud: false, speakerMode: 'unknown' as const, fixedSpeakerId: null, priority: 10, active: true, provenance: 'author' as const };
  const phoneRule = { ...baseRule, id: 'phone', label: '電話', spokenAloud: true };
  value.symbolDictionary = { definitions: [definition], usageRules: [baseRule, phoneRule], overrides: [] };
  const initial = buildInspectorContextFingerprint(buildInspectorContext(value), 'semantic-v3');
  const withOverride = structuredClone(value);
  withOverride.symbolDictionary!.overrides = [buildSymbolOccurrenceAnchor({ id: 'ov', projectId: 'p1', chapterId: 'ch1', content: value.chapter.content, definition, usageRuleId: 'phone', status: 'confirmed', range: { startOffset: 0, endOffset: 3 } })];
  assert.notEqual(buildInspectorContextFingerprint(buildInspectorContext(withOverride), 'semantic-v3'), initial);
});

test('semantic-v3は本文にない無関係pair変更を無視する', () => {
  const value = source();
  value.symbolDictionary = {
    definitions: [{ id: 'unused', projectId: 'p1', openSymbol: '《', closeSymbol: '》', label: '未使用', active: true, order: 0, defaultUsageRuleId: null }],
    usageRules: [], overrides: [],
  };
  assert.equal(buildInspectorContextFingerprint(buildInspectorContext(value), 'semantic-v3'), buildInspectorContextFingerprint(buildInspectorContext(source()), 'semantic-v3'));
});

test('versionは明示値だけを受け付けhash形状から推測しない', () => {
  assert.throws(() => buildInspectorContextFingerprint(buildInspectorContext(source()), 'a'.repeat(64) as never), /Unsupported Inspector fingerprint version/);
});
