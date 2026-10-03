import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInspectorContext, type InspectorSources } from './inspector-context.js';
import {
  buildCanonicalInspectorSemanticFingerprintPayloadV2,
  buildInspectorContextFingerprint,
  CURRENT_INSPECTOR_FINGERPRINT_VERSION,
} from './inspector-fingerprint.js';

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

test('CURRENT Inspector fingerprint versionはsemantic-v2', () => {
  assert.equal(CURRENT_INSPECTOR_FINGERPRINT_VERSION, 'semantic-v2');
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
  const base = source();
  const withDictionary = { ...source(), symbolDictionary: [{ id: 'definition', usage: 'telepathy' }] } as InspectorSources & { symbolDictionary: unknown[] };
  assert.equal(semantic(withDictionary), semantic(base));
});

test('versionは明示値だけを受け付けhash形状から推測しない', () => {
  assert.throws(() => buildInspectorContextFingerprint(buildInspectorContext(source()), 'a'.repeat(64) as never), /Unsupported Inspector fingerprint version/);
});
