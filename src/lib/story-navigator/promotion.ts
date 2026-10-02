import { createChatCompletion } from '../ai-client';
import { db } from '../db';
import { createHash } from 'node:crypto';
export { PROMOTION_REVIEW_STATUSES, PROMOTION_SOURCE_TYPES, PromotionError } from './promotion-structured';
import { extractPromotionDraft, PROMOTION_SOURCE_TYPES, PromotionError, validatePromotionDraft, type PromotionSourceType } from './promotion-structured';

const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function proposalSnapshot(source: Record<string, unknown>) {
  return JSON.stringify({ type: 'navigator_proposal', id: source.id, runId: source.runId, routeKey: source.routeKey, title: source.title, summary: source.summary, decisionStatus: source.decisionStatus, updatedAt: source.updatedAt, contextFingerprint: fingerprint(source.run) });
}
export function observationSnapshot(source: Record<string, unknown>) {
  return JSON.stringify({ type: 'navigator_observation', id: source.id, runId: source.runId, sourceChapterId: source.sourceChapterId, sourceExcerpt: source.sourceExcerpt, elementSummary: source.elementSummary, decisionStatus: source.decisionStatus, updatedAt: source.updatedAt, contextFingerprint: fingerprint({ run: source.run, sourceChapter: source.sourceChapter }) });
}

async function readTargetSnapshot(database: Pick<typeof db, 'project' | 'plot' | 'foreshadowing'>, projectId: string) {
  const [project, plots, foreshadowings] = await Promise.all([
    database.project.findUniqueOrThrow({ where: { id: projectId }, select: { updatedAt: true } }),
    database.plot.findMany({ where: { projectId }, select: { id: true, updatedAt: true }, orderBy: { id: 'asc' } }),
    database.foreshadowing.findMany({ where: { projectId }, select: { id: true, chapterId: true, content: true, expectedResolveChapter: true, status: true, importance: true }, orderBy: { id: 'asc' } }),
  ]);
  return JSON.stringify({ project, plots, foreshadowings });
}

async function targetSnapshotIsCurrent(database: Pick<typeof db, 'project' | 'plot' | 'foreshadowing'>, projectId: string, snapshot: string) {
  const prior = JSON.parse(snapshot) as { project: { updatedAt: string }; plots: Array<{ id: string; updatedAt: string }>; foreshadowings: Array<Record<string, unknown> & { id: string }> };
  const [project, plots, foreshadowings] = await Promise.all([
    database.project.findUnique({ where: { id: projectId }, select: { updatedAt: true } }),
    database.plot.findMany({ where: { projectId, id: { in: prior.plots.map(item => item.id) } }, select: { id: true, updatedAt: true }, orderBy: { id: 'asc' } }),
    database.foreshadowing.findMany({ where: { projectId, id: { in: prior.foreshadowings.map(item => item.id) } }, select: { id: true, chapterId: true, content: true, expectedResolveChapter: true, status: true, importance: true }, orderBy: { id: 'asc' } }),
  ]);
  return JSON.stringify({ project, plots, foreshadowings }) === snapshot;
}

export async function createPromotionDraft(input: { projectId: string; sourceType: PromotionSourceType; sourceId: string }, dependencies: { database?: typeof db; complete?: typeof createChatCompletion } = {}) {
  const database = dependencies.database || db; const complete = dependencies.complete || createChatCompletion;
  if (!PROMOTION_SOURCE_TYPES.includes(input.sourceType)) throw new PromotionError('sourceTypeが不正です');
  const chapters = await database.chapter.findMany({ where: { projectId: input.projectId }, select: { id: true, order: true, title: true }, orderBy: { order: 'asc' } });
  let source: Record<string, unknown>; let snapshot: string; let sourceText: string;
  if (input.sourceType === 'navigator_proposal') {
    const value = await database.storyNavigatorProposal.findFirst({ where: { id: input.sourceId, run: { projectId: input.projectId } }, include: { run: { select: { projectId: true, sourceManifest: true, anchorChapter: { select: { id: true, order: true, title: true, outlineContent: true, summary: true, content: true } } } } } });
    if (!value) throw new PromotionError('Proposalが見つかりません', 404);
    if (value.decisionStatus !== 'accepted') throw new PromotionError('採用済みProposalからのみ昇格案を作成できます');
    source = value as unknown as Record<string, unknown>; snapshot = proposalSnapshot(source);
    sourceText = `Proposal: ${value.title}\n${value.summary}\n成立理由: ${value.whyPossible}\n準備: ${value.preparation}\n影響: ${value.affectedEntities}`;
  } else {
    const value = await database.storyNavigatorObservation.findFirst({ where: { id: input.sourceId, projectId: input.projectId, run: { projectId: input.projectId } }, include: { run: { select: { projectId: true, sourceManifest: true } }, sourceChapter: { select: { id: true, order: true, title: true, outlineContent: true, summary: true, content: true } } } });
    if (!value) throw new PromotionError('Observationが見つかりません', 404);
    if (value.decisionStatus !== 'accepted') throw new PromotionError('採用済みObservationからのみ昇格案を作成できます');
    source = value as unknown as Record<string, unknown>; snapshot = observationSnapshot(source);
    sourceText = `Observation: ${value.elementSummary}\n実在する過去描写: ${value.sourceExcerpt}\n活用理由: ${value.reasonInteresting}\n可能性: ${value.possibleUses}\n過去から意図された伏線だったとは扱わないこと。`;
  }
  const raw = await complete({ messages: [
    { role: 'system', content: 'あなたは物語計画の安全な昇格案を作る。DBは変更しない。PlotまたはForeshadowingのcreate案だけをJSONで返す。具体化できない場合actionsは空配列にする。' },
    { role: 'user', content: `${sourceText}\n\n利用可能な章:\n${chapters.map(c => `${c.id}: 第${c.order + 1}章 ${c.title}`).join('\n')}\n\nJSONのみ: {"schemaVersion":1,"actions":[{"targetType":"plot|foreshadowing","operation":"create","reason":"...","payload":{...}}]}\nPlot payload: name,description,plotType(main|sub|task|dungeon|scene|event),priority,status(planned),tags(string[]),order\nForeshadowing payload: chapterId,content,expectedResolveChapter,status(planted),importance(low|medium|high)` },
  ], temperature: 0.3, max_tokens: 2500 });
  const actions = extractPromotionDraft(raw, new Set(chapters.map(chapter => chapter.id)));
  const targetSnapshot = await readTargetSnapshot(database, input.projectId);
  return database.$transaction(actions.map(action => database.storyNavigatorPromotionAction.create({ data: {
    projectId: input.projectId, sourceType: input.sourceType,
    sourceProposalId: input.sourceType === 'navigator_proposal' ? input.sourceId : null,
    sourceObservationId: input.sourceType === 'navigator_observation' ? input.sourceId : null,
    targetType: action.targetType, operation: 'create', proposedPayload: JSON.stringify(action.payload), reason: action.reason,
    sourceSnapshot: snapshot, sourceUpdatedAt: new Date(source.updatedAt as string | Date), targetSnapshot, status: 'draft',
  } })));
}

export async function applyPromotionAction(projectId: string, actionId: string, database: typeof db = db) {
  return database.$transaction(async transaction => {
    const action = await transaction.storyNavigatorPromotionAction.findFirst({ where: { id: actionId, projectId }, include: {
      sourceProposal: { include: { run: { select: { projectId: true, sourceManifest: true, anchorChapter: { select: { id: true, order: true, title: true, outlineContent: true, summary: true, content: true } } } } } },
      sourceObservation: { include: { run: { select: { projectId: true, sourceManifest: true } }, sourceChapter: { select: { id: true, order: true, title: true, outlineContent: true, summary: true, content: true } } } },
    } });
    if (!action) throw new PromotionError('昇格Actionが見つかりません', 404);
    if (action.status === 'applied') return action;
    if (action.status !== 'approved') throw new PromotionError('承認済みActionのみ反映できます');
    const source = action.sourceType === 'navigator_proposal' ? action.sourceProposal : action.sourceObservation;
    const currentSnapshot = action.sourceType === 'navigator_proposal' && source ? proposalSnapshot(source as unknown as Record<string, unknown>) : source ? observationSnapshot(source as unknown as Record<string, unknown>) : '';
    const targetsCurrent = action.targetSnapshot ? await targetSnapshotIsCurrent(transaction, projectId, action.targetSnapshot) : false;
    if (!source || source.decisionStatus !== 'accepted' || source.updatedAt.getTime() !== action.sourceUpdatedAt.getTime() || currentSnapshot !== action.sourceSnapshot || !targetsCurrent) {
      return transaction.storyNavigatorPromotionAction.update({ where: { id: action.id }, data: { status: 'stale', error: '元の提案または発見結果が変更されています。昇格案を作り直してください。' } });
    }
    const claimed = await transaction.storyNavigatorPromotionAction.updateMany({ where: { id: action.id, projectId, status: 'approved' }, data: { status: 'applying', error: '' } });
    if (claimed.count !== 1) throw new PromotionError('Actionは既に処理されています', 409);
    const chapterIds = new Set((await transaction.chapter.findMany({ where: { projectId }, select: { id: true } })).map(chapter => chapter.id));
    const [validated] = validatePromotionDraft({ actions: [{ targetType: action.targetType, operation: action.operation, reason: action.reason, payload: JSON.parse(action.proposedPayload) }] }, chapterIds);
    let createdEntityId: string;
    if (validated.targetType === 'plot') {
      const payload = validated.payload;
      const created = await transaction.plot.create({ data: { projectId, ...payload, tags: JSON.stringify(payload.tags) } }); createdEntityId = created.id;
    } else {
      const created = await transaction.foreshadowing.create({ data: { projectId, ...validated.payload } }); createdEntityId = created.id;
    }
    return transaction.storyNavigatorPromotionAction.update({ where: { id: action.id }, data: { status: 'applied', createdEntityId, appliedAt: new Date(), error: '' } });
  });
}
