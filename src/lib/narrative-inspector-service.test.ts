import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInspectorContext, type InspectorSources } from './inspector-context.js';
import { runNarrativeInspector } from './narrative-inspector-service.js';

function source(): InspectorSources {
  return {
    project: { id: 'project', narrativePerspective: 'first_person', defaultPovCharacterId: 'character' },
    chapter: { id: 'chapter', projectId: 'project', order: 1, title: '章', content: '私は進んだ。', povCharacterId: 'character' },
    characters: [{ id: 'character', projectId: 'project', name: '私', firstPerson: '私' }],
    narrators: [], cast: [], narrativeRules: [], storyFacts: [], characterKnowledge: [], relationships: [],
  };
}

test('新規Runとupsert Issueへsemantic-v4を同一versionで伝播する', async () => {
  const captured: Record<string, unknown>[] = [];
  const transaction = {
    narrativeIssue: {
      findMany: async (args: Record<string, unknown>) => 'include' in args ? [] : [],
      upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => { captured.push({ kind: 'issue-create', ...create }); captured.push({ kind: 'issue-update', ...update }); },
      updateMany: async () => undefined,
    },
    narrativeLearningSession: { findMany: async () => [], update: async () => undefined },
    narrativeInspectionRun: { update: async ({ data }: { data: Record<string, unknown> }) => { captured.push({ kind: 'run-complete', ...data }); } },
  };
  const database = {
    chapter: { findFirst: async () => ({ id: 'chapter', content: '私は進んだ。' }) },
    narrativeInspectionRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => { captured.push({ kind: 'run-create', ...data }); return { id: 'run' }; },
      update: async () => undefined,
    },
    $transaction: async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction),
  };
  const raw = JSON.stringify({ schemaVersion: 1, issues: [{
    category: 'viewpoint', issueType: 'perspective_mismatch', locationKind: 'excerpt', excerpt: '私', startOffset: 0, endOffset: 1,
    explanation: '確認', suggestedDirection: '視点を確認', severity: 'check', evidenceRefs: ['perspective:project'],
  }] });
  await runNarrativeInspector(
    { projectId: 'project', chapterId: 'chapter' },
    async () => raw,
    { database: database as never, buildContext: async () => buildInspectorContext(source()) },
  );
  for (const kind of ['run-create', 'issue-create', 'issue-update', 'run-complete']) {
    assert.equal(captured.find(value => value.kind === kind)?.fingerprintVersion, 'semantic-v4');
  }
});
