import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStoryArchitecture, type StoryArchitecture, type StoryArchitectureBeat } from './index.js';

function fixture(size: number): StoryArchitecture {
  const beats: StoryArchitectureBeat[] = Array.from({ length: size }, (_, index) => ({
    id: `beat-${index}`, architectureId: 'architecture-1', threadId: null, title: `Beat ${index}`, summary: '静かな変化', intention: '',
    storyOrder: index, presentationOrder: size - index - 1, chapterId: null, rhythm: 'quiet', customRhythmLabel: null,
    status: 'draft', provenance: 'author', revision: 1,
  }));
  return {
    id: 'architecture-1', projectId: 'project-1', title: '長編', frameworkMode: 'freeform', customFrameworkNotes: '',
    canonMode: 'respect_current_canon', notes: '', revision: 1, threads: [], beats, constraints: [], questions: [],
    relations: beats.slice(1).map((value, index) => ({ id: `relation-${index}`, architectureId: 'architecture-1', fromBeatId: beats[index].id, toBeatId: value.id, type: 'precedes' })), decisions: [],
  };
}

test('validation and cycle detection handle 0, 10, 100, 500 and 1000 Beats without cubic growth', () => {
  const durations: Array<[number, number]> = [];
  for (const size of [0, 10, 100, 500, 1000]) {
    const started = performance.now(); validateStoryArchitecture(fixture(size)); durations.push([size, performance.now() - started]);
  }
  assert.ok(durations.every(([, duration]) => duration < 2_000), JSON.stringify(durations));
  const hundred = durations.find(([size]) => size === 100)![1]; const thousand = durations.find(([size]) => size === 1000)![1];
  assert.ok(thousand < Math.max(1_000, hundred * 40), JSON.stringify(durations));
});
