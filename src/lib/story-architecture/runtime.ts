import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { createChatCompletion } from '@/lib/ai-client';
import { db } from '@/lib/db';
import { extractJsonObject } from '@/lib/story-navigator/json-extraction';
import { loadArchitectContext } from './context-loader';
import { STORY_ARCHITECT_CONTEXT_VERSION, type ArchitectContext, type ArchitectScope } from './context';
import { buildStoryArchitectPrompt } from './prompt';
import type { StoryArchitectureRelationType } from './types';
import {
  STORY_ARCHITECT_OPERATIONS, STORY_ARCHITECT_PROMPT_VERSION, validateStoryArchitectOutput,
  type PresentedArchitectEntities, type ProposalRef, type StoryArchitectOperation, type StoryArchitectOutput,
} from './proposal';

const PENDING_TIMEOUT_MS=15*60*1000;
type ArchitectDatabase=typeof db;
export class StoryArchitectRuntimeError extends Error { constructor(public readonly code:'invalid_request'|'model_failed'|'invalid_output'|'persistence_failed',message:string){super(message);this.name='StoryArchitectRuntimeError';} }
export interface GenerateStoryArchitectInput { projectId:string; scope:ArchitectScope; operation:StoryArchitectOperation; instruction:string; force?:boolean }

export function buildStoryArchitectIdentity(context:ArchitectContext,operation:StoryArchitectOperation){return createHash('sha256').update(JSON.stringify({projectId:context.projectId,architectureId:context.architectureId,scope:context.scope,operation,instruction:context.currentInstruction,contextVersion:STORY_ARCHITECT_CONTEXT_VERSION,promptVersion:STORY_ARCHITECT_PROMPT_VERSION,contextFingerprint:context.fingerprint})).digest('hex');}
export function presentedArchitectEntities(context:ArchitectContext):PresentedArchitectEntities {
  const ids=(types:string[])=>new Set(context.entries.filter(value=>types.includes(value.sourceType)).map(value=>value.sourceId));
  const relations=context.entries.filter(value=>value.sourceType==='architecture_relation').flatMap(value=>{const item=value.content as Record<string,unknown>;return typeof item.fromBeatId==='string'&&typeof item.toBeatId==='string'&&typeof item.type==='string'?[{fromBeatId:item.fromBeatId,toBeatId:item.toBeatId,type:item.type as StoryArchitectureRelationType}]:[];});
  return {sourcePairs:new Set(context.sourceManifest.map(value=>`${value.sourceType}\0${value.sourceId}`)),threadIds:ids(['architecture_thread']),beatIds:ids(['architecture_beat']),chapterIds:ids(['chapter_actual','chapter_plan']),questionIds:ids(['architecture_question']),relations};
}
const resolve=(reference:ProposalRef|null,locals:Map<string,string>)=>reference===null?null:reference.kind==='existing'?reference.id:locals.get(reference.id)!;
const safeError=(error:unknown)=>error&&typeof error==='object'&&'code'in error?`architect_${String((error as {code:unknown}).code)}`.slice(0,200):error instanceof SyntaxError?'architect_invalid_json':'architect_runtime_failed';

export async function persistStoryArchitectOutput(database:ArchitectDatabase,run:{id:string;projectId:string;architectureId:string},output:StoryArchitectOutput){
  return database.$transaction(async tx=>{
    for(let alternativeIndex=0;alternativeIndex<output.alternatives.length;alternativeIndex+=1){
      const alternative=output.alternatives[alternativeIndex];const alternativeId=randomUUID();
      await tx.storyArchitectureProposalAlternative.create({data:{id:alternativeId,proposalRunId:run.id,alternativeKey:alternative.localId,label:alternative.label,rationale:alternative.rationale,tradeoffs:JSON.stringify(alternative.tradeoffs),order:alternativeIndex}});
      const threadIds=new Map(alternative.threads.map(value=>[value.localId,randomUUID()]));const beatIds=new Map(alternative.beats.map(value=>[value.localId,randomUUID()]));
      const sourceRows:Array<{id:string;proposalRunId:string;proposalAlternativeId:string;itemType:string;itemId:string;sourceType:string;sourceId:string}>=[];
      const sources=(itemType:string,itemId:string,values:Array<{sourceType:string;sourceId:string}>)=>values.forEach(value=>sourceRows.push({id:randomUUID(),proposalRunId:run.id,proposalAlternativeId:alternativeId,itemType,itemId,...value}));
      if(alternative.threads.length)await tx.storyArchitectureThread.createMany({data:alternative.threads.map((value,index)=>{const id=threadIds.get(value.localId)!;sources('thread',id,value.sourceRefs);return {id,architectureId:run.architectureId,proposalRunId:run.id,proposalAlternativeId:alternativeId,title:value.title,description:value.description,threadType:value.threadType,customTypeLabel:value.customTypeLabel,status:'proposed',provenance:'ai_proposal',order:index,revision:1};})});
      if(alternative.beats.length)await tx.storyArchitectureBeat.createMany({data:alternative.beats.map(value=>{const id=beatIds.get(value.localId)!;sources('beat',id,value.sourceRefs);return {id,architectureId:run.architectureId,proposalRunId:run.id,proposalAlternativeId:alternativeId,threadId:resolve(value.threadRef,threadIds),chapterId:value.chapterId,title:value.title,summary:value.summary,intention:value.intention,storyOrder:value.storyOrder,presentationOrder:value.presentationOrder,rhythm:value.rhythm,customRhythmLabel:value.customRhythmLabel,status:'proposed',provenance:'ai_proposal',revision:1};})});
      if(alternative.constraints.length)await tx.storyArchitectureConstraint.createMany({data:alternative.constraints.map((value,index)=>{const id=randomUUID();sources('constraint',id,value.sourceRefs);return {id,architectureId:run.architectureId,proposalRunId:run.id,proposalAlternativeId:alternativeId,title:value.title,statement:value.statement,mode:value.mode,scope:value.scope,threadId:resolve(value.threadRef,threadIds),beatId:resolve(value.beatRef,beatIds),status:'proposed',provenance:'ai_proposal',order:index,revision:1};})});
      if(alternative.questions.length)await tx.storyArchitectureQuestion.createMany({data:alternative.questions.map((value,index)=>{const id=randomUUID();sources('question',id,value.sourceRefs);return {id,architectureId:run.architectureId,proposalRunId:run.id,proposalAlternativeId:alternativeId,question:value.question,notes:value.notes,state:'open',resolution:null,answerToQuestionId:value.answerToQuestionId,resolutionCandidate:value.resolutionCandidate,scope:value.scope,threadId:resolve(value.threadRef,threadIds),beatId:resolve(value.beatRef,beatIds),status:'proposed',provenance:'ai_proposal',order:index,revision:1};})});
      if(alternative.relations.length)await tx.storyArchitectureBeatRelation.createMany({data:alternative.relations.map(value=>{const id=randomUUID();sources('relation',id,value.sourceRefs);return {id,architectureId:run.architectureId,proposalRunId:run.id,proposalAlternativeId:alternativeId,fromBeatId:resolve(value.fromBeatRef,beatIds)!,toBeatId:resolve(value.toBeatRef,beatIds)!,type:value.type};})});
      if(sourceRows.length)await tx.storyArchitectureProposalSource.createMany({data:sourceRows});
    }
    return tx.storyArchitectureProposalRun.update({where:{id:run.id},data:{status:'completed',summary:output.summary,impactNotes:JSON.stringify(output.impactNotes),unresolvedQuestions:JSON.stringify(output.unresolvedQuestions),errorCode:null,completedAt:new Date()},include:{alternatives:{orderBy:{order:'asc'}},threads:true,beats:true,constraints:true,questions:true,relations:true}});
  });
}

export async function generateStoryArchitectProposal(input:GenerateStoryArchitectInput,dependencies:{database?:ArchitectDatabase;loadContext?:typeof loadArchitectContext;complete?:typeof createChatCompletion;parse?:typeof extractJsonObject;persist?:typeof persistStoryArchitectOutput;now?:()=>Date}={}){
  if(!STORY_ARCHITECT_OPERATIONS.includes(input.operation)||!input.instruction.trim())throw new StoryArchitectRuntimeError('invalid_request','operationと空でないinstructionが必要です。');
  const database=dependencies.database||db;const loadContext=dependencies.loadContext||loadArchitectContext;const complete=dependencies.complete||createChatCompletion;const parse=dependencies.parse||extractJsonObject;const persist=dependencies.persist||persistStoryArchitectOutput;const now=dependencies.now?.()||new Date();
  const context=await loadContext({projectId:input.projectId,scope:input.scope,currentInstruction:input.instruction},{database});const identityKey=buildStoryArchitectIdentity(context,input.operation);
  const baseWhere={projectId:input.projectId,architectureId:context.architectureId,identityKey,contextVersion:STORY_ARCHITECT_CONTEXT_VERSION,promptVersion:STORY_ARCHITECT_PROMPT_VERSION};
  if(!input.force){const completed=await database.storyArchitectureProposalRun.findFirst({where:{...baseWhere,status:'completed'},orderBy:{completedAt:'desc'},include:{alternatives:{orderBy:{order:'asc'}},threads:true,beats:true,constraints:true,questions:true,relations:true}});if(completed)return {outcome:'reused' as const,run:completed};}
  await database.storyArchitectureProposalRun.updateMany({where:{...baseWhere,status:'pending',updatedAt:{lt:new Date(now.getTime()-PENDING_TIMEOUT_MS)}},data:{status:'failed',errorCode:'architect_stale_pending',completedAt:now}});
  const pending=await database.storyArchitectureProposalRun.findFirst({where:{...baseWhere,status:'pending'},orderBy:{createdAt:'desc'}});if(pending)return {outcome:'pending' as const,run:pending};
  let run;
  try{run=await database.storyArchitectureProposalRun.create({data:{projectId:input.projectId,architectureId:context.architectureId,scopeType:input.scope.type,scopeId:input.scope.id||null,request:input.instruction,operation:input.operation,canonMode:context.canonMode,contextVersion:STORY_ARCHITECT_CONTEXT_VERSION,promptVersion:STORY_ARCHITECT_PROMPT_VERSION,contextFingerprint:context.fingerprint,sourceManifest:JSON.stringify(context.sourceManifest),identityKey,status:'pending'}});}catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002'){const concurrent=await database.storyArchitectureProposalRun.findFirst({where:{...baseWhere,status:'pending'}});if(concurrent)return {outcome:'pending' as const,run:concurrent};}throw error;}
  let stage:'model'|'validation'|'persistence'='model';
  try{const prompt=buildStoryArchitectPrompt(context,input.operation);const raw=await complete({messages:[{role:'system',content:prompt.systemPrompt},{role:'user',content:prompt.userMessage}],temperature:0.55,max_tokens:7000});stage='validation';let parsed:unknown;try{parsed=parse(raw);}catch{throw new StoryArchitectRuntimeError('invalid_output','AI応答をJSONとして解析できませんでした。');}const output=validateStoryArchitectOutput(parsed,presentedArchitectEntities(context));stage='persistence';const persisted=await persist(database,run,output);return {outcome:'completed' as const,run:persisted};}
  catch(error){try{await database.storyArchitectureProposalRun.updateMany({where:{id:run.id,status:'pending'},data:{status:'failed',errorCode:safeError(error),completedAt:new Date()}});}catch{/* original error wins */}if(error instanceof StoryArchitectRuntimeError)throw error;throw new StoryArchitectRuntimeError(stage==='model'?'model_failed':stage==='persistence'?'persistence_failed':'invalid_output','Story Architect Proposal生成に失敗しました。');}
}
