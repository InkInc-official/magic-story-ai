import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ARCHITECT_SCOPE_TYPES, STORY_ARCHITECT_CONTEXT_VERSION, type ArchitectScope } from './context';
import { loadArchitectContext } from './context-loader';
import { STORY_ARCHITECT_PROMPT_VERSION } from './proposal';

export const STORY_ARCHITECTURE_APPLY_STATUSES=['draft','approved','applying','applied','stale','failed','cancelled'] as const;
export const STORY_ARCHITECTURE_APPLY_SOURCE_TYPES=['thread','beat'] as const;
export type StoryArchitectureApplySourceType=typeof STORY_ARCHITECTURE_APPLY_SOURCE_TYPES[number];
export type StoryArchitectureApplyStatus=typeof STORY_ARCHITECTURE_APPLY_STATUSES[number];
type Database=typeof db;
type Transaction=Prisma.TransactionClient;
type ApplyDependencies={loadContext?:typeof loadArchitectContext};
type PlotPayload={name:string;description:string;plotType:'main';priority:0;status:'planned';tags:[];order:number};
type SourceSnapshot={type:StoryArchitectureApplySourceType;id:string;status:string;provenance:string;revision:number;proposalRunId:string|null;alternative:{id:string;key:string}|null;semantic:Record<string,unknown>};

export class StoryArchitectureApplyError extends Error { constructor(public readonly code:string,message:string,public readonly httpStatus=400){super(message);this.name='StoryArchitectureApplyError';} }
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const serialize=(value:unknown)=>JSON.stringify(value);
export const fingerprintArchitectureApplySnapshot=(snapshot:unknown)=>hash(serialize(snapshot));

export function buildArchitectureApplySourceSnapshot(type:StoryArchitectureApplySourceType,row:Record<string,unknown>):SourceSnapshot {
  const alternative=row.proposalAlternative as {id:string;alternativeKey:string}|null;
  const common={type,id:String(row.id),status:String(row.status),provenance:String(row.provenance),revision:Number(row.revision),proposalRunId:typeof row.proposalRunId==='string'?row.proposalRunId:null,alternative:alternative?{id:alternative.id,key:alternative.alternativeKey}:null};
  if(type==='thread')return {...common,semantic:{title:row.title,description:row.description,threadType:row.threadType,customTypeLabel:row.customTypeLabel}};
  return {...common,semantic:{title:row.title,summary:row.summary,intention:row.intention,threadId:row.threadId,chapterId:row.chapterId,storyOrder:row.storyOrder,presentationOrder:row.presentationOrder,rhythm:row.rhythm,customRhythmLabel:row.customRhythmLabel}};
}

async function readSource(database:Database|Transaction,projectId:string,architectureId:string,type:StoryArchitectureApplySourceType,id:string){
  const where={id,architectureId,architecture:{projectId}};
  const include={proposalAlternative:{select:{id:true,alternativeKey:true}},proposalRun:{select:{id:true,projectId:true,architectureId:true,scopeType:true,scopeId:true,request:true,canonMode:true,contextVersion:true,promptVersion:true,contextFingerprint:true,status:true}}};
  const row=type==='thread'?await database.storyArchitectureThread.findFirst({where,include}):await database.storyArchitectureBeat.findFirst({where,include});
  if(!row)throw new StoryArchitectureApplyError('source_not_found','同じProjectのArchitecture sourceが見つかりません。',404);
  return {row:row as unknown as Record<string,unknown>,snapshot:buildArchitectureApplySourceSnapshot(type,row as unknown as Record<string,unknown>)};
}

async function verifyProposalFreshness(database:Database|Transaction,projectId:string,snapshot:SourceSnapshot,row:Record<string,unknown>,loadContext:typeof loadArchitectContext){
  if(snapshot.provenance==='author')return;
  if(snapshot.provenance!=='ai_proposal')throw new StoryArchitectureApplyError('source_provenance','authorまたは承認済みAI Proposalだけを反映できます。');
  const run=row.proposalRun as Record<string,unknown>|null;
  if(!snapshot.proposalRunId||!run)throw new StoryArchitectureApplyError('proposal_run_missing','AI Proposalの生成元Runがありません。');
  if(run.status!=='completed')throw new StoryArchitectureApplyError('proposal_run_not_completed','completed ProposalRunだけを反映できます。');
  if(run.contextVersion!==STORY_ARCHITECT_CONTEXT_VERSION||run.promptVersion!==STORY_ARCHITECT_PROMPT_VERSION)throw new StoryArchitectureApplyError('proposal_run_stale','ProposalRun contractが現在と一致しません。');
  if(run.projectId!==projectId||run.architectureId===undefined||!ARCHITECT_SCOPE_TYPES.includes(run.scopeType as never)||typeof run.request!=='string'||!run.request.trim()||typeof run.contextFingerprint!=='string')throw new StoryArchitectureApplyError('proposal_freshness_unverifiable','Proposal freshnessを厳密に再構築できません。');
  const scope:ArchitectScope={type:run.scopeType as ArchitectScope['type'],...(typeof run.scopeId==='string'?{id:run.scopeId}:{})};
  try{
    const current=await loadContext({projectId,scope,currentInstruction:run.request,excludeProposalRunId:snapshot.proposalRunId},{database:database as Database});
    if(current.fingerprint!==run.contextFingerprint)throw new StoryArchitectureApplyError('proposal_run_stale','Proposal生成後に設計Contextが変化しています。');
  }catch(error){if(error instanceof StoryArchitectureApplyError)throw error;throw new StoryArchitectureApplyError('proposal_freshness_unverifiable','Proposal freshnessを再構築できません。');}
}

async function verifySource(database:Database|Transaction,input:{projectId:string;architectureId:string;sourceItemType:StoryArchitectureApplySourceType;sourceItemId:string;expectedFingerprint?:string},loadContext:typeof loadArchitectContext){
  const loaded=await readSource(database,input.projectId,input.architectureId,input.sourceItemType,input.sourceItemId);
  if(loaded.snapshot.status!=='approved')throw new StoryArchitectureApplyError('source_not_approved','approved Architecture Itemだけを反映できます。');
  const fingerprint=fingerprintArchitectureApplySnapshot(loaded.snapshot);
  if(input.expectedFingerprint&&fingerprint!==input.expectedFingerprint)throw new StoryArchitectureApplyError('source_stale','Architecture sourceがDraft作成後に変更されています。');
  await verifyProposalFreshness(database,input.projectId,loaded.snapshot,loaded.row,loadContext);
  return {...loaded,fingerprint};
}

export function buildArchitecturePlotPayload(type:StoryArchitectureApplySourceType,snapshot:SourceSnapshot,order:number):PlotPayload {
  const title=String(snapshot.semantic.title??'');
  if(!title.trim())throw new StoryArchitectureApplyError('source_invalid','source titleが空です。');
  const description=type==='thread'?String(snapshot.semantic.description??''):[snapshot.semantic.summary,snapshot.semantic.intention].filter(value=>typeof value==='string'&&value.length>0).join('\n');
  return {name:title,description,plotType:'main',priority:0,status:'planned',tags:[],order};
}
async function targetState(database:Database|Transaction,projectId:string,architectureId:string,sourceItemType:string,sourceItemId:string){
  const plots=await database.plot.findMany({where:{projectId},select:{id:true,order:true},orderBy:[{order:'asc'},{id:'asc'}]});
  const applied=await database.storyArchitectureApplyAction.findFirst({where:{projectId,architectureId,sourceItemType,sourceItemId,targetType:'plot',operation:'create',status:'applied'},select:{id:true,resultTargetId:true}});
  const snapshot={expectation:'new_plot_absent',sourceAlreadyApplied:applied!==null,plots};
  return {snapshot,fingerprint:fingerprintArchitectureApplySnapshot(snapshot),order:(plots.at(-1)?.order??-1)+1,applied};
}
function safeAction(action:Record<string,unknown>){return {id:action.id,projectId:action.projectId,architectureId:action.architectureId,sourceItemType:action.sourceItemType,sourceItemId:action.sourceItemId,targetType:action.targetType,operation:action.operation,status:action.status,resultTargetId:action.resultTargetId,errorCode:action.errorCode,approvedAt:action.approvedAt,appliedAt:action.appliedAt,failedAt:action.failedAt,createdAt:action.createdAt,updatedAt:action.updatedAt};}
function parsePayload(value:string):PlotPayload {const raw=JSON.parse(value) as Record<string,unknown>;const keys=Object.keys(raw);if(keys.length!==7||!['name','description','plotType','priority','status','tags','order'].every(key=>keys.includes(key))||typeof raw.name!=='string'||typeof raw.description!=='string'||raw.plotType!=='main'||raw.priority!==0||raw.status!=='planned'||!Array.isArray(raw.tags)||raw.tags.length!==0||!Number.isSafeInteger(raw.order)||(raw.order as number)<0)throw new StoryArchitectureApplyError('payload_invalid','保存済みPlot payloadが安全契約に一致しません。');return raw as unknown as PlotPayload;}

export async function createStoryArchitectureApplyDraft(input:{projectId:string;architectureId:string;sourceItemType:StoryArchitectureApplySourceType;sourceItemId:string},database:Database=db,dependencies:ApplyDependencies={}){
  if(!STORY_ARCHITECTURE_APPLY_SOURCE_TYPES.includes(input.sourceItemType))throw new StoryArchitectureApplyError('source_type','Apply sourceはThreadまたはBeatだけです。');
  const source=await verifySource(database,input,dependencies.loadContext||loadArchitectContext);const target=await targetState(database,input.projectId,input.architectureId,input.sourceItemType,input.sourceItemId);
  if(target.applied)throw new StoryArchitectureApplyError('duplicate_apply','同じsourceからPlotが既に作成されています。',409);
  const payload=buildArchitecturePlotPayload(input.sourceItemType,source.snapshot,target.order);
  const created=await database.storyArchitectureApplyAction.create({data:{projectId:input.projectId,architectureId:input.architectureId,sourceItemType:input.sourceItemType,sourceItemId:input.sourceItemId,sourceProposalRunId:source.snapshot.proposalRunId,targetType:'plot',operation:'create',proposedPayload:serialize(payload),sourceSnapshot:serialize(source.snapshot),targetSnapshot:serialize(target.snapshot),sourceFingerprint:source.fingerprint,targetFingerprint:target.fingerprint,status:'draft'}});
  return safeAction(created as unknown as Record<string,unknown>);
}

async function loadAction(database:Database|Transaction,projectId:string,actionId:string){const action=await database.storyArchitectureApplyAction.findFirst({where:{id:actionId,projectId}});if(!action)throw new StoryArchitectureApplyError('action_not_found','Apply Actionが見つかりません。',404);if(action.architectureId===undefined)throw new StoryArchitectureApplyError('action_invalid','Apply Actionが不正です。');return action;}
async function validateActionCurrent(database:Database|Transaction,action:Awaited<ReturnType<typeof loadAction>>,loadContext:typeof loadArchitectContext){
  if(action.targetType!=='plot'||action.operation!=='create'||!STORY_ARCHITECTURE_APPLY_SOURCE_TYPES.includes(action.sourceItemType as StoryArchitectureApplySourceType))throw new StoryArchitectureApplyError('target_forbidden','新規planned Plot以外へは反映できません。');
  const type=action.sourceItemType as StoryArchitectureApplySourceType;const source=await verifySource(database,{projectId:action.projectId,architectureId:action.architectureId,sourceItemType:type,sourceItemId:action.sourceItemId,expectedFingerprint:action.sourceFingerprint},loadContext);
  if(serialize(source.snapshot)!==action.sourceSnapshot)throw new StoryArchitectureApplyError('source_stale','source snapshotが変化しています。');
  const target=await targetState(database,action.projectId,action.architectureId,type,action.sourceItemId);if(target.fingerprint!==action.targetFingerprint||serialize(target.snapshot)!==action.targetSnapshot)throw new StoryArchitectureApplyError('target_stale','Plot状態がPreview後に変化しています。');
  if(target.applied&&target.applied.id!==action.id)throw new StoryArchitectureApplyError('duplicate_apply','同じsourceからPlotが既に作成されています。',409);
  const payload=parsePayload(action.proposedPayload);if(payload.order!==target.order)throw new StoryArchitectureApplyError('target_stale','Plot末尾順序が変化しています。');
  return {source,target,payload};
}
export async function previewStoryArchitectureApplyAction(projectId:string,actionId:string,database:Database=db,dependencies:ApplyDependencies={}){const action=await loadAction(database,projectId,actionId);let fresh=true;let warning:string|null=null;try{await validateActionCurrent(database,action,dependencies.loadContext||loadArchitectContext);}catch(error){fresh=false;warning=error instanceof StoryArchitectureApplyError?error.code:'preview_failed';}return {action:safeAction(action as unknown as Record<string,unknown>),source:{type:action.sourceItemType,id:action.sourceItemId,fresh},target:{type:'plot',operation:'create',payload:parsePayload(action.proposedPayload)},impact:{create:1,update:0,delete:0,storyFactMutation:0,knowledgeMutation:0,relationshipMutation:0,chapterMutation:0,foreshadowingMutation:0,storyStateMutation:0,readerRevealMutation:0,canonMutation:0},conflicts:fresh?[]:[warning],warnings:warning?[warning]:[]};}
async function markTerminal(database:Database,actionId:string,status:'stale'|'failed',errorCode:string){await database.storyArchitectureApplyAction.updateMany({where:{id:actionId,status:{in:['draft','approved']}},data:{status,errorCode,...(status==='failed'?{failedAt:new Date()}:{})}});}
export async function approveStoryArchitectureApplyAction(projectId:string,actionId:string,database:Database=db,dependencies:ApplyDependencies={}){const action=await loadAction(database,projectId,actionId);if(action.status==='approved')return safeAction(action as unknown as Record<string,unknown>);if(action.status!=='draft')throw new StoryArchitectureApplyError('invalid_status','draft Actionだけを承認できます。',409);try{await validateActionCurrent(database,action,dependencies.loadContext||loadArchitectContext);}catch(error){const code=error instanceof StoryArchitectureApplyError?error.code:'approval_failed';await markTerminal(database,action.id,'stale',code);throw error;}try{const claimed=await database.storyArchitectureApplyAction.updateMany({where:{id:action.id,projectId,status:'draft'},data:{status:'approved',approvedAt:new Date(),errorCode:null}});if(claimed.count!==1)throw new StoryArchitectureApplyError('status_conflict','Action状態が競合しました。',409);}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002')throw new StoryArchitectureApplyError('duplicate_apply','同じsourceのApply Actionが既に承認されています。',409);throw error;}return safeAction(await database.storyArchitectureApplyAction.findUniqueOrThrow({where:{id:action.id}}) as unknown as Record<string,unknown>);}
export async function cancelStoryArchitectureApplyAction(projectId:string,actionId:string,database:Database=db){const result=await database.storyArchitectureApplyAction.updateMany({where:{id:actionId,projectId,status:{in:['draft','approved']}},data:{status:'cancelled',errorCode:null}});if(result.count!==1){const action=await loadAction(database,projectId,actionId);if(action.status==='cancelled')return safeAction(action as unknown as Record<string,unknown>);throw new StoryArchitectureApplyError('invalid_status','draftまたはapproved Actionだけを取消できます。',409);}return safeAction(await database.storyArchitectureApplyAction.findUniqueOrThrow({where:{id:actionId}}) as unknown as Record<string,unknown>);}

export async function executeStoryArchitectureApplyAction(projectId:string,actionId:string,database:Database=db,dependencies:ApplyDependencies={}){
  try{return await database.$transaction(async transaction=>{await transaction.$queryRaw(Prisma.sql`SELECT id FROM magic_story."Project" WHERE id = ${projectId} FOR UPDATE`);const action=await loadAction(transaction,projectId,actionId);if(action.status==='applied')return safeAction(action as unknown as Record<string,unknown>);if(action.status!=='approved')throw new StoryArchitectureApplyError('invalid_status','approved Apply Actionだけを実行できます。',409);const checked=await validateActionCurrent(transaction,action,dependencies.loadContext||loadArchitectContext);const claimed=await transaction.storyArchitectureApplyAction.updateMany({where:{id:action.id,projectId,status:'approved'},data:{status:'applying',errorCode:null}});if(claimed.count!==1)throw new StoryArchitectureApplyError('status_conflict','Actionは既に処理されています。',409);const plot=await transaction.plot.create({data:{projectId,name:checked.payload.name,description:checked.payload.description,plotType:'main',priority:0,status:'planned',tags:'[]',order:checked.payload.order}});const completed=await transaction.storyArchitectureApplyAction.updateMany({where:{id:action.id,projectId,status:'applying',resultTargetId:null},data:{status:'applied',resultTargetId:plot.id,appliedAt:new Date(),errorCode:null}});if(completed.count!==1)throw new StoryArchitectureApplyError('status_conflict','Apply完了状態が競合しました。',409);return safeAction(await transaction.storyArchitectureApplyAction.findUniqueOrThrow({where:{id:action.id}}) as unknown as Record<string,unknown>);});}
  catch(error){const latest=await database.storyArchitectureApplyAction.findFirst({where:{id:actionId,projectId}});if(latest?.status==='applied')return safeAction(latest as unknown as Record<string,unknown>);const code=error instanceof StoryArchitectureApplyError?error.code:'plot_create_failed';if(code.includes('stale')||code==='source_not_approved'||code==='proposal_run_stale'||code==='proposal_freshness_unverifiable')await markTerminal(database,actionId,'stale',code);else if(code!=='status_conflict'&&code!=='invalid_status'&&code!=='duplicate_apply')await markTerminal(database,actionId,'failed',code);if(error instanceof StoryArchitectureApplyError)throw error;throw new StoryArchitectureApplyError('plot_create_failed','Plotの作成に失敗しました。',500);}
}
