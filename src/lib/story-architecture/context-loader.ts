import { db } from '@/lib/db';
import { classifyStoryFact, type StoryFactValue } from '@/lib/story-facts';
import { deriveCharacterKnowledgeState, type CharacterKnowledgeEvent } from '@/lib/character-knowledge';
import { loadChapterMeaningContext } from '@/lib/story-meaning/context-loader';
import { getLatestFreshStoryMeaningRun } from '@/lib/story-meaning/service';
import { getStoryArchitecture } from './persistence';
import { buildArchitectContext, selectArchitectDesign, type ArchitectScope, type ArchitectSupplementalSources } from './context';

type ArchitectDatabase = typeof db;
const CHAPTER_LIMIT=12, FACT_LIMIT=30, PLAN_LIMIT=20, NAVIGATOR_LIMIT=12, RULE_LIMIT=20;
const excerpt=(value:string,limit=1600)=>value.length<=limit?value:`${value.slice(0,limit)}…`;

export class ArchitectContextLoadError extends Error {
  constructor(public readonly code:'not_found'|'ownership'|'source_load_failed',message:string){super(message);this.name='ArchitectContextLoadError';}
}

export async function loadArchitectContext(input:{projectId:string;scope:ArchitectScope;currentInstruction:string;excludeProposalRunId?:string},dependencies:{database?:ArchitectDatabase}={}) {
  const database=dependencies.database||db;
  const [project,architecture]=await Promise.all([
    database.project.findUnique({where:{id:input.projectId},select:{id:true,title:true,genre:true,description:true,authorIntent:true,genreGuidanceMode:true,genreGuidanceNotes:true}}),
    getStoryArchitecture(input.projectId,database),
  ]);
  if(!project) throw new ArchitectContextLoadError('not_found','Projectが見つかりません。');
  if(!architecture) throw new ArchitectContextLoadError('not_found','Story Architectureが見つかりません。');
  if(input.excludeProposalRunId){
    const [threads,beats,constraints,questions,relations]=await Promise.all([
      database.storyArchitectureThread.findMany({where:{architectureId:architecture.id,proposalRunId:input.excludeProposalRunId},select:{id:true}}),
      database.storyArchitectureBeat.findMany({where:{architectureId:architecture.id,proposalRunId:input.excludeProposalRunId},select:{id:true}}),
      database.storyArchitectureConstraint.findMany({where:{architectureId:architecture.id,proposalRunId:input.excludeProposalRunId},select:{id:true}}),
      database.storyArchitectureQuestion.findMany({where:{architectureId:architecture.id,proposalRunId:input.excludeProposalRunId},select:{id:true}}),
      database.storyArchitectureBeatRelation.findMany({where:{architectureId:architecture.id,proposalRunId:input.excludeProposalRunId},select:{id:true}}),
    ]);
    const excluded=new Set([...threads,...beats,...constraints,...questions].map(value=>value.id));const relationIds=new Set(relations.map(value=>value.id));
    architecture.threads=architecture.threads.filter(value=>!excluded.has(value.id));architecture.beats=architecture.beats.filter(value=>!excluded.has(value.id));architecture.constraints=architecture.constraints.filter(value=>!excluded.has(value.id));architecture.questions=architecture.questions.filter(value=>!excluded.has(value.id));architecture.relations=architecture.relations.filter(value=>!relationIds.has(value.id));architecture.decisions=architecture.decisions.filter(value=>!excluded.has(value.itemId));
  }
  let selected;
  try{selected=selectArchitectDesign(architecture,input.scope);}catch(error){throw new ArchitectContextLoadError('ownership',error instanceof Error?error.message:'scopeが不正です。');}
  const assignedValues:string[]=[];
  for(const value of selected.beats) if(typeof value.chapterId==='string') assignedValues.push(value.chapterId);
  const allAssignedChapterIds:string[]=[...new Set(assignedValues)];
  const assignedChapterIds:string[]=allAssignedChapterIds.slice(0,9);
  const diagnostics=['creative_rules_no_architect_surface','relationship_history_unavailable','if_only_sources_excluded'];
  try {
    const assigned=await database.chapter.findMany({where:{projectId:input.projectId,id:{in:assignedChapterIds}},select:{id:true,order:true,title:true,content:true,outlineContent:true,summary:true,purpose:true,endingNotes:true,povCharacterId:true,narratorId:true,chapterCharacters:{select:{characterId:true}}},orderBy:[{order:'asc'},{id:'asc'}]});
    const [recent,facts,plots,foreshadowings,navigatorAccepted,narrativeRules]=await Promise.all([
      database.chapter.findMany({where:{projectId:input.projectId},select:{id:true,order:true,title:true,content:true,outlineContent:true,summary:true,purpose:true,endingNotes:true,povCharacterId:true,narratorId:true,chapterCharacters:{select:{characterId:true}}},orderBy:[{order:'desc'},{id:'desc'}],take:3}),
      database.storyFact.findMany({where:{projectId:input.projectId},include:{plannedRevealChapter:{select:{id:true,order:true,title:true}},revealedChapter:{select:{id:true,order:true,title:true}}},orderBy:[{importance:'desc'},{id:'asc'}],take:FACT_LIMIT}),
      database.plot.findMany({where:{projectId:input.projectId,status:{in:['planned','active']}},orderBy:[{priority:'desc'},{order:'asc'},{id:'asc'}],take:PLAN_LIMIT}),
      database.foreshadowing.findMany({where:{projectId:input.projectId,status:{not:'resolved'}},orderBy:[{importance:'desc'},{id:'asc'}],take:PLAN_LIMIT}),
      database.storyNavigatorProposal.findMany({where:{decisionStatus:'accepted',run:{projectId:input.projectId}},select:{id:true,title:true,summary:true},orderBy:[{decidedAt:'desc'},{id:'asc'}],take:NAVIGATOR_LIMIT}),
      database.narrativeRule.findMany({where:{projectId:input.projectId,active:true},select:{id:true,title:true,description:true,mode:true,priority:true},orderBy:[{priority:'desc'},{id:'asc'}],take:RULE_LIMIT}),
    ]);
    const chapters=[...new Map([...assigned,...recent].map(value=>[value.id,value])).values()].slice(0,CHAPTER_LIMIT).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
    const characterIds=[...new Set(chapters.flatMap(value=>[...(value.povCharacterId?[value.povCharacterId]:[]),...value.chapterCharacters.map(member=>member.characterId)]))];
    const [characters,relationships,knowledge]=await Promise.all([
      characterIds.length?database.character.findMany({where:{projectId:input.projectId,id:{in:characterIds}},select:{id:true,name:true,role:true},orderBy:{id:'asc'}}):Promise.resolve([]),
      characterIds.length?database.characterRelationship.findMany({where:{projectId:input.projectId,OR:[{fromCharacterId:{in:characterIds}},{toCharacterId:{in:characterIds}}]},select:{id:true,fromCharacterId:true,toCharacterId:true,type:true,description:true},orderBy:{id:'asc'},take:40}):Promise.resolve([]),
      characterIds.length&&facts.length?database.characterKnowledge.findMany({where:{characterId:{in:characterIds},factId:{in:facts.map(value=>value.id)},OR:[{effectiveChapterId:null},{effectiveChapter:{order:{lte:chapters.at(-1)?.order??0}}}]},include:{effectiveChapter:{select:{id:true,order:true,title:true}}},orderBy:[{characterId:'asc'},{createdAt:'asc'},{id:'asc'}],take:120}):Promise.resolve([]),
    ]);
    const anchor=chapters.at(-1); const factContext=anchor?{chapterId:anchor.id,chapterOrder:anchor.order,chapterText:`${anchor.title}\n${anchor.outlineContent}\n${anchor.summary}\n${anchor.purpose}`} : null;
    const selectedFacts=factContext?facts.filter(value=>classifyStoryFact(value as StoryFactValue,factContext)!=='excluded'):facts.slice(0,12);
    const knowledgeSources:ArchitectSupplementalSources['characterKnowledge']=[];
    if(anchor) for(const fact of selectedFacts) for(const character of characters){
      const events=knowledge.filter(value=>value.factId===fact.id&&value.characterId===character.id) as CharacterKnowledgeEvent[];
      const state=deriveCharacterKnowledgeState(events,anchor.id,anchor.order);
      if(state.startingState) knowledgeSources.push({id:state.startingState.id,factId:fact.id,characterId:character.id,status:state.startingState.status,phase:'current',beliefNotes:state.startingState.beliefNotes,notes:state.startingState.notes});
      if(state.currentChapterChange) knowledgeSources.push({id:state.currentChapterChange.id,factId:fact.id,characterId:character.id,status:state.currentChapterChange.status,phase:'current',beliefNotes:state.currentChapterChange.beliefNotes,notes:state.currentChapterChange.notes});
    }
    const meanings:NonNullable<ArchitectSupplementalSources['meanings']>=[];
    const meaningChapter=assigned[0];
    if(meaningChapter){
      try{const loaded=await loadChapterMeaningContext(input.projectId,meaningChapter.id,{database});const fresh=await getLatestFreshStoryMeaningRun(input.projectId,meaningChapter.id,loaded.context,database);if(fresh){const run=fresh as unknown as Record<string,any>;
        const claims=(run.events||[]).flatMap((event:any)=>(event.claims||[]).map((claim:any)=>({id:claim.id,statement:claim.statement,layer:claim.layer,adopted:claim.latestDecision?.decision==='adopted'&&claim.latestDecision?.fresh===true}))).slice(0,20);
        meanings.push({id:String(run.id),chapterId:meaningChapter.id,contextFingerprint:String(run.contextFingerprint),fresh:true,status:'completed',claims});
      }else diagnostics.push(`fresh_meaning_missing:${meaningChapter.id}`);}catch{diagnostics.push(`fresh_meaning_excluded:${meaningChapter.id}`);}
    }
    if(facts.length===FACT_LIMIT) diagnostics.push('story_facts_bounded'); if(allAssignedChapterIds.length>9) diagnostics.push('assigned_chapters_bounded');
    const sources:ArchitectSupplementalSources={
      actualChapters:chapters.map(value=>({id:value.id,order:value.order,title:value.title,contentExcerpt:excerpt(value.content),planning:{outlineContent:value.outlineContent,summary:value.summary,purpose:value.purpose,endingNotes:value.endingNotes},povCharacterId:value.povCharacterId,narratorId:value.narratorId})),
      storyFacts:selectedFacts.map(value=>({id:value.id,content:value.content,readerState:factContext?(classifyStoryFact(value as StoryFactValue,factContext)==='reader-known'?'reader_known':classifyStoryFact(value as StoryFactValue,factContext)==='reveal-now'?'reveal_now':'reader_hidden'):'reader_hidden',importance:value.importance})),
      characterKnowledge:knowledgeSources,characters,relationships,plots:plots.map(value=>({id:value.id,name:value.name,description:value.description,status:value.status})),
      foreshadowings:foreshadowings.map(value=>({id:value.id,content:value.content,status:value.status})),navigatorAccepted,meanings,narrativeRules,
    };
    return buildArchitectContext({project,architecture,scope:input.scope,currentInstruction:input.currentInstruction,sources,diagnostics});
  } catch(error) {
    if(error instanceof ArchitectContextLoadError) throw error;
    throw new ArchitectContextLoadError('source_load_failed',error instanceof Error?`Architect sourceの読込に失敗しました: ${error.message}`:'Architect sourceの読込に失敗しました。');
  }
}
