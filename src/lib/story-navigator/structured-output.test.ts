import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { extractStoryNavigatorOutput, isStoryNavigatorDecisionStatus, selectDefaultNavigatorAnchor, validateStoryNavigatorOutput } from './structured-output.js';

const route = (index: number) => ({
  routeKey: String.fromCharCode(65 + index), title: `案${index}`, summary: '概要', whyPossible: '成立理由', authorIntentRelation: '作者意図に沿う',
  preparation: [], affectedEntities: ['人物'], benefits: ['利点'], risks: ['リスク'], immediateOptions: ['準備'],
});
const output = (count: number) => ({ schemaVersion: 1, currentPosition: { summary: '現在地', planDeviation: [] }, routes: Array.from({ length: count }, (_, index) => route(index)) });

describe('Story Navigator structured output', () => {
  for (const count of [2, 3, 5]) test(`accepts ${count} routes`, () => assert.equal(validateStoryNavigatorOutput(output(count)).routes.length, count));
  for (const count of [0, 1, 6]) test(`rejects ${count} routes`, () => assert.throws(() => validateStoryNavigatorOutput(output(count))));
  test('rejects malformed routes', () => assert.throws(() => validateStoryNavigatorOutput({ ...output(2), routes: [{ ...route(0), risks: 'none' }, route(1)] })));
  test('extracts fenced JSON', () => assert.equal(extractStoryNavigatorOutput(`\`\`\`json\n${JSON.stringify(output(2))}\n\`\`\``).routes.length, 2));
  test('extracts JSON surrounded by prose', () => assert.equal(extractStoryNavigatorOutput(`前置き\n${JSON.stringify(output(3))}\n以上`).routes.length, 3));
  test('rejects invalid JSON', () => assert.throws(() => extractStoryNavigatorOutput('{broken')));
  test('validates decision statuses', () => {
    for (const value of ['undecided', 'held', 'accepted', 'rejected']) assert.equal(isStoryNavigatorDecisionStatus(value), true);
    assert.equal(isStoryNavigatorDecisionStatus('canon'), false);
  });
  test('selects the latest chapter with written content by default', () => {
    assert.equal(selectDefaultNavigatorAnchor([{ id: 'c1', order: 1, content: '本文' }, { id: 'c2', order: 2, content: '' }, { id: 'c3', order: 3, content: '最新本文' }]), 'c3');
    assert.equal(selectDefaultNavigatorAnchor([{ id: 'c1', order: 1, content: '' }, { id: 'c2', order: 2, content: '' }]), 'c2');
  });
});
