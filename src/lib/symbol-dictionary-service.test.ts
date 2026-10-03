import assert from 'node:assert/strict';
import { test } from 'node:test';
import { db } from '@/lib/db';
import { setDefaultSymbolUsage, updateSymbolUsageRule } from './symbol-dictionary-service.js';

function replaceMethod(target: object, key: string, implementation: (...args: never[]) => unknown) {
  const mutable = target as Record<string, unknown>; const original = mutable[key];
  mutable[key] = implementation; return () => { mutable[key] = original; };
}

const usage = {
  id: 'usage', projectId: 'project', definitionId: 'definition', label: '用途', description: '', semanticKind: 'custom',
  countsAsDialogue: null, countsAsNarration: null, countsAsInnerVoice: null, readerVisible: null, spokenAloud: null,
  speakerMode: 'unknown', fixedSpeakerId: null, priority: 0, active: true, provenance: 'author',
};

const sqlName = (value: unknown) => ((value as { strings?: readonly string[] }).strings || []).join(' ');

test('default assignment locks Definition then Usage and rechecks active state', async t => {
  const locks: string[] = [];
  const transaction = {
    $queryRaw: async (query: unknown) => { locks.push(sqlName(query)); return []; },
    projectSymbolDefinition: { findFirst: async () => ({ id: 'definition' }), update: async () => ({ id: 'definition', defaultUsageRuleId: 'usage' }) },
    symbolUsageRule: { findFirst: async () => usage },
  };
  const restore = replaceMethod(db, '$transaction', async (callback: (value: object) => unknown) => callback(transaction));
  t.after(restore);
  await setDefaultSymbolUsage('project', 'definition', 'usage');
  assert.match(locks[0], /ProjectSymbolDefinition/);
  assert.match(locks[1], /SymbolUsageRule/);
});

test('deactivation locks in the same order and rejects the current default', async t => {
  const locks: string[] = [];
  const transaction = {
    $queryRaw: async (query: unknown) => { locks.push(sqlName(query)); return []; },
    projectSymbolDefinition: { findFirst: async () => ({ id: 'definition', defaultUsageRuleId: 'usage' }) },
    symbolUsageRule: { findFirst: async () => usage, update: async () => { throw new Error('更新してはならない'); } },
    character: { findFirst: async () => null },
  };
  const restoreFind = replaceMethod(db.symbolUsageRule, 'findFirst', async () => ({ definitionId: 'definition' }));
  const restoreTransaction = replaceMethod(db, '$transaction', async (callback: (value: object) => unknown) => callback(transaction));
  t.after(() => { restoreTransaction(); restoreFind(); });

  await assert.rejects(updateSymbolUsageRule({ id: 'usage', projectId: 'project', active: false }), /defaultを解除/);
  assert.match(locks[0], /ProjectSymbolDefinition/);
  assert.match(locks[1], /SymbolUsageRule/);
});

test('concurrent default assignment and deactivation cannot leave an inactive default', async t => {
  const state = { active: true, defaultUsageRuleId: null as string | null };
  let tail = Promise.resolve();
  const restoreFind = replaceMethod(db.symbolUsageRule, 'findFirst', async () => ({ definitionId: 'definition' }));
  const restoreTransaction = replaceMethod(db, '$transaction', async (callback: (value: object) => Promise<unknown>) => {
    let release = () => {};
    const previous = tail;
    tail = new Promise<void>(resolve => { release = resolve; });
    let definitionLocked = false;
    const transaction = {
      $queryRaw: async (query: unknown) => {
        if (sqlName(query).includes('ProjectSymbolDefinition')) {
          await previous;
          definitionLocked = true;
        }
        return [];
      },
      projectSymbolDefinition: {
        findFirst: async (args: { where: { defaultUsageRuleId?: string } }) => {
          if (args.where.defaultUsageRuleId && state.defaultUsageRuleId !== args.where.defaultUsageRuleId) return null;
          return { id: 'definition', defaultUsageRuleId: state.defaultUsageRuleId };
        },
        update: async (args: { data: { defaultUsageRuleId: string | null } }) => {
          state.defaultUsageRuleId = args.data.defaultUsageRuleId; return { id: 'definition', ...state };
        },
      },
      symbolUsageRule: {
        findFirst: async (args: { where?: { active?: boolean } }) => args.where?.active === true && !state.active ? null : { ...usage, active: state.active },
        update: async (args: { data: { active: boolean } }) => { state.active = args.data.active; return { ...usage, active: state.active }; },
      },
      character: { findFirst: async () => null },
    };
    try { return await callback(transaction); } finally { if (definitionLocked) release(); }
  });
  t.after(() => { restoreTransaction(); restoreFind(); });

  const results = await Promise.allSettled([
    setDefaultSymbolUsage('project', 'definition', 'usage'),
    updateSymbolUsageRule({ id: 'usage', projectId: 'project', active: false }),
  ]);
  assert.ok(results.some(result => result.status === 'rejected'));
  assert.ok(state.defaultUsageRuleId === null || state.active, 'default Usageは必ずactiveである');
});
