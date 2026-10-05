import { relationHasCycle, STORY_ARCHITECTURE_ACYCLIC_RELATIONS } from './relations';
import {
  STORY_ARCHITECTURE_CANON_MODES, STORY_ARCHITECTURE_CONSTRAINT_MODES, STORY_ARCHITECTURE_DECISIONS,
  STORY_ARCHITECTURE_DESIGN_STATUSES, STORY_ARCHITECTURE_FRAMEWORK_MODES, STORY_ARCHITECTURE_ITEM_TYPES,
  STORY_ARCHITECTURE_PROVENANCES, STORY_ARCHITECTURE_QUESTION_STATES, STORY_ARCHITECTURE_RELATION_TYPES,
  STORY_ARCHITECTURE_RHYTHMS, STORY_ARCHITECTURE_SCOPES, STORY_ARCHITECTURE_THREAD_TYPES,
  type StoryArchitecture, type StoryArchitectureItemType, type StoryArchitectureScope,
} from './types';

export const STORY_ARCHITECTURE_LENGTH_LIMITS = {
  id: 200, title: 200, customLabel: 120, description: 4000, summary: 4000,
  intention: 4000, notes: 4000, statement: 4000, question: 2000, resolution: 4000,
} as const;

export class StoryArchitectureValidationError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'StoryArchitectureValidationError';
  }
}

const includes = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && values.includes(value as T);
function text(value: unknown, path: string, max: number, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new StoryArchitectureValidationError(path, '文字列が不正です。');
}
function id(value: unknown, path: string) { text(value, path, STORY_ARCHITECTURE_LENGTH_LIMITS.id, true); }
function integer(value: unknown, path: string, nullable = false) {
  if (nullable && value === null) return;
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new StoryArchitectureValidationError(path, '0以上の有限整数が必要です。');
}
function nullableId(value: unknown, path: string) { if (value !== null) id(value, path); }
function revision(value: unknown, path: string) { integer(value, path); if (value === 0) throw new StoryArchitectureValidationError(path, 'revisionは1以上です。'); }
function uniqueIds(values: readonly { id: string }[], path: string) {
  const seen = new Set<string>();
  values.forEach((value, index) => { id(value.id, `${path}[${index}].id`); if (seen.has(value.id)) throw new StoryArchitectureValidationError(`${path}[${index}].id`, 'IDが重複しています。'); seen.add(value.id); });
}
function itemBase(value: { id: string; architectureId: string; status: unknown; provenance: unknown; revision: number }, path: string, architectureId: string) {
  id(value.id, `${path}.id`); id(value.architectureId, `${path}.architectureId`);
  if (value.architectureId !== architectureId) throw new StoryArchitectureValidationError(`${path}.architectureId`, '別Architectureの項目です。');
  if (!includes(STORY_ARCHITECTURE_DESIGN_STATUSES, value.status)) throw new StoryArchitectureValidationError(`${path}.status`, 'Design statusが不正です。');
  if (!includes(STORY_ARCHITECTURE_PROVENANCES, value.provenance)) throw new StoryArchitectureValidationError(`${path}.provenance`, 'provenanceが不正です。');
  revision(value.revision, `${path}.revision`);
}
function scoped(scope: StoryArchitectureScope, threadId: string | null, beatId: string | null, path: string) {
  if (!includes(STORY_ARCHITECTURE_SCOPES, scope)) throw new StoryArchitectureValidationError(`${path}.scope`, 'scopeが不正です。');
  if (scope === 'architecture' && (threadId !== null || beatId !== null)) throw new StoryArchitectureValidationError(path, 'architecture scopeに対象IDは指定できません。');
  if (scope === 'thread' && (threadId === null || beatId !== null)) throw new StoryArchitectureValidationError(path, 'thread scopeにはthreadIdだけが必要です。');
  if (scope === 'beat' && (beatId === null || threadId !== null)) throw new StoryArchitectureValidationError(path, 'beat scopeにはbeatIdだけが必要です。');
}

export function validateStoryArchitecture(value: StoryArchitecture): StoryArchitecture {
  if (!value || typeof value !== 'object') throw new StoryArchitectureValidationError('architecture', 'objectが必要です。');
  id(value.id, 'architecture.id'); id(value.projectId, 'architecture.projectId');
  text(value.title, 'architecture.title', STORY_ARCHITECTURE_LENGTH_LIMITS.title, true);
  if (!includes(STORY_ARCHITECTURE_FRAMEWORK_MODES, value.frameworkMode)) throw new StoryArchitectureValidationError('architecture.frameworkMode', 'framework modeが不正です。');
  text(value.customFrameworkNotes, 'architecture.customFrameworkNotes', STORY_ARCHITECTURE_LENGTH_LIMITS.notes);
  if (value.frameworkMode === 'custom' && !value.customFrameworkNotes.trim()) throw new StoryArchitectureValidationError('architecture.customFrameworkNotes', 'customでは説明が必要です。');
  if (value.frameworkMode !== 'custom' && value.customFrameworkNotes !== '') throw new StoryArchitectureValidationError('architecture.customFrameworkNotes', 'freeformでは空文字にしてください。');
  if (!includes(STORY_ARCHITECTURE_CANON_MODES, value.canonMode)) throw new StoryArchitectureValidationError('architecture.canonMode', 'canon modeが不正です。');
  text(value.notes, 'architecture.notes', STORY_ARCHITECTURE_LENGTH_LIMITS.notes); revision(value.revision, 'architecture.revision');
  for (const [key, collection] of Object.entries({ threads: value.threads, beats: value.beats, constraints: value.constraints, questions: value.questions, relations: value.relations, decisions: value.decisions })) {
    if (!Array.isArray(collection)) throw new StoryArchitectureValidationError(`architecture.${key}`, '配列が必要です。');
    uniqueIds(collection, `architecture.${key}`);
  }
  const allItemIds = new Set<string>();
  [...value.threads, ...value.beats, ...value.constraints, ...value.questions].forEach(item => {
    if (allItemIds.has(item.id)) throw new StoryArchitectureValidationError('architecture.items', 'Item IDが種別を越えて重複しています。');
    allItemIds.add(item.id);
  });
  const threads = new Map(value.threads.map(item => [item.id, item]));
  const beats = new Map(value.beats.map(item => [item.id, item]));
  value.threads.forEach((item, index) => {
    const path = `architecture.threads[${index}]`; itemBase(item, path, value.id);
    text(item.title, `${path}.title`, STORY_ARCHITECTURE_LENGTH_LIMITS.title, true); text(item.description, `${path}.description`, STORY_ARCHITECTURE_LENGTH_LIMITS.description);
    if (!includes(STORY_ARCHITECTURE_THREAD_TYPES, item.threadType)) throw new StoryArchitectureValidationError(`${path}.threadType`, 'thread typeが不正です。');
    if (item.threadType === 'custom') { if (item.customTypeLabel === null) throw new StoryArchitectureValidationError(`${path}.customTypeLabel`, 'custom labelが必要です。'); text(item.customTypeLabel, `${path}.customTypeLabel`, STORY_ARCHITECTURE_LENGTH_LIMITS.customLabel, true); }
    else if (item.customTypeLabel !== null) throw new StoryArchitectureValidationError(`${path}.customTypeLabel`, 'custom以外ではnullが必要です。');
    integer(item.order, `${path}.order`);
  });
  value.beats.forEach((item, index) => {
    const path = `architecture.beats[${index}]`; itemBase(item, path, value.id); nullableId(item.threadId, `${path}.threadId`); nullableId(item.chapterId, `${path}.chapterId`);
    if (item.threadId !== null && !threads.has(item.threadId)) throw new StoryArchitectureValidationError(`${path}.threadId`, 'Threadが同じArchitectureにありません。');
    text(item.title, `${path}.title`, STORY_ARCHITECTURE_LENGTH_LIMITS.title, true); text(item.summary, `${path}.summary`, STORY_ARCHITECTURE_LENGTH_LIMITS.summary); text(item.intention, `${path}.intention`, STORY_ARCHITECTURE_LENGTH_LIMITS.intention);
    integer(item.storyOrder, `${path}.storyOrder`, true); integer(item.presentationOrder, `${path}.presentationOrder`, true);
    if (item.rhythm !== null && !includes(STORY_ARCHITECTURE_RHYTHMS, item.rhythm)) throw new StoryArchitectureValidationError(`${path}.rhythm`, 'rhythmが不正です。');
    if (item.rhythm === 'custom') { if (item.customRhythmLabel === null) throw new StoryArchitectureValidationError(`${path}.customRhythmLabel`, 'custom rhythm labelが必要です。'); text(item.customRhythmLabel, `${path}.customRhythmLabel`, STORY_ARCHITECTURE_LENGTH_LIMITS.customLabel, true); }
    else if (item.customRhythmLabel !== null) throw new StoryArchitectureValidationError(`${path}.customRhythmLabel`, 'custom以外ではnullが必要です。');
  });
  value.constraints.forEach((item, index) => {
    const path = `architecture.constraints[${index}]`; itemBase(item, path, value.id);
    text(item.title, `${path}.title`, STORY_ARCHITECTURE_LENGTH_LIMITS.title, true); text(item.statement, `${path}.statement`, STORY_ARCHITECTURE_LENGTH_LIMITS.statement, true);
    if (!includes(STORY_ARCHITECTURE_CONSTRAINT_MODES, item.mode)) throw new StoryArchitectureValidationError(`${path}.mode`, 'constraint modeが不正です。');
    scoped(item.scope, item.threadId, item.beatId, path); integer(item.order, `${path}.order`);
    if (item.threadId !== null && !threads.has(item.threadId)) throw new StoryArchitectureValidationError(`${path}.threadId`, 'Threadが同じArchitectureにありません。');
    if (item.beatId !== null && !beats.has(item.beatId)) throw new StoryArchitectureValidationError(`${path}.beatId`, 'Beatが同じArchitectureにありません。');
  });
  value.questions.forEach((item, index) => {
    const path = `architecture.questions[${index}]`; itemBase(item, path, value.id);
    text(item.question, `${path}.question`, STORY_ARCHITECTURE_LENGTH_LIMITS.question, true); text(item.notes, `${path}.notes`, STORY_ARCHITECTURE_LENGTH_LIMITS.notes);
    if (!includes(STORY_ARCHITECTURE_QUESTION_STATES, item.state)) throw new StoryArchitectureValidationError(`${path}.state`, 'question stateが不正です。');
    if (item.state === 'resolved') { if (item.resolution === null) throw new StoryArchitectureValidationError(`${path}.resolution`, 'resolvedには回答が必要です。'); text(item.resolution, `${path}.resolution`, STORY_ARCHITECTURE_LENGTH_LIMITS.resolution, true); }
    else if (item.resolution !== null) throw new StoryArchitectureValidationError(`${path}.resolution`, '未解決Questionのresolutionはnullです。');
    scoped(item.scope, item.threadId, item.beatId, path); integer(item.order, `${path}.order`);
    if (item.threadId !== null && !threads.has(item.threadId)) throw new StoryArchitectureValidationError(`${path}.threadId`, 'Threadが同じArchitectureにありません。');
    if (item.beatId !== null && !beats.has(item.beatId)) throw new StoryArchitectureValidationError(`${path}.beatId`, 'Beatが同じArchitectureにありません。');
  });
  const relationKeys = new Set<string>();
  value.relations.forEach((item, index) => {
    const path = `architecture.relations[${index}]`; id(item.architectureId, `${path}.architectureId`);
    if (item.architectureId !== value.id) throw new StoryArchitectureValidationError(`${path}.architectureId`, '別ArchitectureのRelationです。');
    id(item.fromBeatId, `${path}.fromBeatId`); id(item.toBeatId, `${path}.toBeatId`);
    if (!beats.has(item.fromBeatId) || !beats.has(item.toBeatId)) throw new StoryArchitectureValidationError(path, 'RelationのBeatが同じArchitectureにありません。');
    if (item.fromBeatId === item.toBeatId) throw new StoryArchitectureValidationError(path, 'self relationは禁止です。');
    if (!includes(STORY_ARCHITECTURE_RELATION_TYPES, item.type)) throw new StoryArchitectureValidationError(`${path}.type`, 'relation typeが不正です。');
    const key = `${item.fromBeatId}\u0000${item.toBeatId}\u0000${item.type}`;
    if (relationKeys.has(key)) throw new StoryArchitectureValidationError(path, 'Relationが重複しています。'); relationKeys.add(key);
  });
  for (const type of STORY_ARCHITECTURE_ACYCLIC_RELATIONS) if (relationHasCycle(value.relations, type)) throw new StoryArchitectureValidationError('architecture.relations', `${type}にcycleがあります。`);
  const itemByType: Record<StoryArchitectureItemType, Set<string>> = {
    thread: new Set(value.threads.map(item => item.id)), beat: new Set(value.beats.map(item => item.id)),
    constraint: new Set(value.constraints.map(item => item.id)), question: new Set(value.questions.map(item => item.id)),
  };
  value.decisions.forEach((item, index) => {
    const path = `architecture.decisions[${index}]`; id(item.architectureId, `${path}.architectureId`);
    if (item.architectureId !== value.id) throw new StoryArchitectureValidationError(`${path}.architectureId`, '別ArchitectureのDecisionです。');
    if (!includes(STORY_ARCHITECTURE_ITEM_TYPES, item.itemType)) throw new StoryArchitectureValidationError(`${path}.itemType`, 'item typeが不正です。');
    id(item.itemId, `${path}.itemId`); if (!itemByType[item.itemType].has(item.itemId)) throw new StoryArchitectureValidationError(`${path}.itemId`, 'Decision対象が同じArchitectureにありません。');
    if (!includes(STORY_ARCHITECTURE_DECISIONS, item.decision)) throw new StoryArchitectureValidationError(`${path}.decision`, 'Decisionが不正です。');
    text(item.note, `${path}.note`, STORY_ARCHITECTURE_LENGTH_LIMITS.notes);
  });
  return value;
}
