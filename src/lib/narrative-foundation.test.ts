import test from 'node:test';
import assert from 'node:assert/strict';
import { referencesBelongToProject, resolveNarrativeRoles, resolveProjectNarrativeRules, validateNarrativeRuleInput, validateNarratorInput, type NarrativeRuleValue, type NarratorValue } from './narrative-foundation.js';

const taro = { id: 'taro', name: '太郎' };
const hana = { id: 'hana', name: '花子' };
const ghostNarrator: NarratorValue = {
  id: 'ghost', projectId: 'p1', name: '作者用：幽霊の太郎', linkedCharacterId: 'taro',
  identityFactId: 'identity', identityDisclosureMode: 'concealed', linkedCharacter: taro,
};

test('Perspective / Narrator / POV / Castを独立して解決する', () => {
  const cast = [{ characterId: 'hana', participation: 'present' }];
  const result = resolveNarrativeRoles({
    project: { narrativePerspective: 'third_person_limited', defaultPovCharacterId: 'hana', defaultNarratorId: 'ghost' },
    chapter: { povCharacterId: 'taro', narratorId: null }, characters: [taro, hana], narrators: [ghostNarrator], cast,
  });
  assert.equal(result.perspective, 'third_person_limited');
  assert.equal(result.pov?.id, 'taro');
  assert.equal(result.narrator?.id, 'ghost');
  assert.deepEqual(result.cast, cast);
  assert.equal(result.cast.some(entry => entry.characterId === 'taro'), false);
});

test('Chapter NarratorはProject既定Narratorより優先し、POVへ影響しない', () => {
  const chapterNarrator = { ...ghostNarrator, id: 'chapter-narrator', linkedCharacterId: null };
  const result = resolveNarrativeRoles({
    project: { defaultPovCharacterId: 'taro', defaultNarratorId: 'ghost' }, chapter: { narratorId: 'chapter-narrator' },
    characters: [taro], narrators: [ghostNarrator, chapterNarrator], cast: [],
  });
  assert.equal(result.narrator?.id, 'chapter-narrator');
  assert.equal(result.pov?.id, 'taro');
  assert.deepEqual(result.cast, []);
});

test('NarratorまたはPOVの未指定を維持し、自動相互変換しない', () => {
  const noNarrator = resolveNarrativeRoles({ project: { defaultPovCharacterId: 'taro' }, characters: [taro], narrators: [], cast: [] });
  assert.equal(noNarrator.pov?.id, 'taro'); assert.equal(noNarrator.narrator, null);
  const noPov = resolveNarrativeRoles({ project: { defaultNarratorId: 'ghost' }, characters: [taro], narrators: [ghostNarrator], cast: [] });
  assert.equal(noPov.pov, null); assert.equal(noPov.narrator?.id, 'ghost');
});

test('concealed identityはAuthor-sideで、既知集合にあってもreader-visibleにしない', () => {
  const result = resolveNarrativeRoles({ project: { defaultNarratorId: 'ghost', defaultPovCharacterId: 'taro' }, characters: [taro], narrators: [ghostNarrator], cast: [], readerKnownFactIds: new Set(['identity']) });
  assert.deepEqual(result.narratorIdentity, { factId: 'identity', authorSide: true, readerVisible: false, concealed: true });
});

test('Project Ruleはactiveのみを優先度順にし、自由記述・unknown machineKey・provenanceを保持する', () => {
  const base = { projectId: 'p1', source: 'author', active: true, overridable: false };
  const rules: NarrativeRuleValue[] = [
    { ...base, id: 'allow', title: '他者の思考を知覚できる', description: '近距離の人物の表層思考を知覚できる。', category: 'viewpoint', mode: 'allow', priority: 20, machineKey: 'can_read_minds' },
    { ...base, id: 'require', title: '冒頭の気配', description: '各章冒頭に存在を匂わせる。', category: 'structure', mode: 'require', priority: 30 },
    { ...base, id: 'forbid', title: '正体', description: '開示前に名前を出さない。', category: 'disclosure', mode: 'forbid', priority: 10 },
    { ...base, id: 'guidance', title: '語り', description: '静かな語りを参考にする。', category: 'voice', mode: 'guidance', priority: 0, machineKey: 'author-defined-unknown' },
    { ...base, id: 'inactive', title: '無効', description: '除外', category: 'custom', mode: 'guidance', priority: 100, active: false },
  ];
  const resolved = resolveProjectNarrativeRules(rules);
  assert.deepEqual(resolved.map(rule => rule.id), ['require', 'allow', 'forbid', 'guidance']);
  assert.equal(resolved[1].description, '近距離の人物の表層思考を知覚できる。');
  assert.equal(resolved[3].machineKey, 'author-defined-unknown');
  assert.deepEqual(resolved[0].provenance, { level: 'project', source: 'author', ruleId: 'require' });
});

test('NarratorとRule validationがenum・長さ・priorityを拒否する', () => {
  assert.equal(validateNarratorInput({ name: '語り手', identityDisclosureMode: 'normal' }), null);
  assert.ok(validateNarratorInput({ name: '語り手', identityDisclosureMode: 'public' }));
  assert.equal(validateNarrativeRuleInput({ title: '規則', description: '本文', category: 'custom', mode: 'guidance', source: 'author', priority: 0, active: true, overridable: false }), null);
  assert.ok(validateNarrativeRuleInput({ title: '規則', description: '本文', category: 'other', mode: 'guidance', source: 'author', priority: 0 }));
  assert.ok(validateNarrativeRuleInput({ title: '規則', description: '本文', category: 'custom', mode: 'guidance', source: 'author', priority: 1001 }));
});

test('Character・StoryFact・Narrator参照のProject境界を判定する', () => {
  assert.equal(referencesBelongToProject('p1', [{ projectId: 'p1' }, null, { projectId: 'p1' }]), true);
  assert.equal(referencesBelongToProject('p1', [{ projectId: 'p1' }, { projectId: 'p2' }]), false);
});
