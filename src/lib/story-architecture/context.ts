import { computeArchitectContextFingerprint } from './fingerprint';
import type { StoryArchitecture, StoryArchitectureBeat, StoryArchitectureConstraint, StoryArchitectureQuestion, StoryArchitectureThread } from './types';

export const STORY_ARCHITECT_CONTEXT_VERSION = 'architect-v1' as const;
export const ARCHITECT_CONTEXT_LIMIT = 18_000;
export const ARCHITECT_SCOPE_TYPES = ['architecture', 'thread', 'beat', 'question'] as const;
export const ARCHITECT_AUTHORITIES = [
  'actual_written', 'author_truth', 'current_state', 'existing_plan', 'approved_design', 'unresolved_design',
  'approved_direction', 'interpretive_author_adopted', 'interpretive_ai_analysis', 'author_intent',
  'current_instruction', 'narrative_boundary', 'design_lens',
] as const;

export type ArchitectScopeType = typeof ARCHITECT_SCOPE_TYPES[number];
export type ArchitectAuthority = typeof ARCHITECT_AUTHORITIES[number];
export interface ArchitectScope { type: ArchitectScopeType; id?: string; revisionTarget?: string }
export interface ArchitectSourceManifestEntry { sourceType: string; sourceId: string; fingerprint: string; authority: ArchitectAuthority }
export interface ArchitectContextEntry {
  id: string; sourceType: string; sourceId: string; authority: ArchitectAuthority; tier: 0|1|2|3|4;
  required: boolean; title: string; content: unknown;
}
export interface ArchitectSupplementalSources {
  actualChapters?: Array<{ id:string; order:number; title:string; contentExcerpt:string; planning:{ outlineContent:string; summary:string; purpose:string; endingNotes:string }; povCharacterId?:string|null; narratorId?:string|null }>;
  storyFacts?: Array<{ id:string; content:string; readerState:'reader_known'|'reveal_now'|'reader_hidden'; importance:string }>;
  characterKnowledge?: Array<{ id:string; factId:string; characterId:string; status:string; phase:'current'|'future'; beliefNotes?:string; notes?:string }>;
  relationships?: Array<{ id:string; fromCharacterId:string; toCharacterId:string; type:string; description:string }>;
  characters?: Array<{ id:string; name:string; role:string }>;
  plots?: Array<{ id:string; name:string; description:string; status:string }>;
  foreshadowings?: Array<{ id:string; content:string; status:string }>;
  navigatorAccepted?: Array<{ id:string; title:string; summary:string }>;
  meanings?: Array<{ id:string; chapterId:string; contextFingerprint:string; fresh?:boolean; status?:string; claims:Array<{ id:string; statement:string; layer:string; adopted:boolean }> }>;
  narrativeRules?: Array<{ id:string; title:string; description:string; mode:string; priority:number }>;
}
export interface BuildArchitectContextInput {
  project: { id:string; title:string; genre:string; description:string; authorIntent:string; genreGuidanceMode:string; genreGuidanceNotes:string };
  architecture: StoryArchitecture; scope: ArchitectScope; currentInstruction:string; sources?:ArchitectSupplementalSources;
  diagnostics?:string[]; limit?:number;
}
export interface ArchitectContext {
  version: typeof STORY_ARCHITECT_CONTEXT_VERSION; projectId:string; architectureId:string; scope:ArchitectScope;
  currentInstruction:string; canonMode:StoryArchitecture['canonMode']; canonBoundary:'immutable_boundary'|'revision_baseline';
  invariants:{ proposedIsCanon:false; approvedDesignIsCanon:false; applyAllowed:false; ifOnlyExcluded:true };
  entries:ArchitectContextEntry[]; diagnostics:string[]; omittedEntryIds:string[]; sourceManifest:ArchitectSourceManifestEntry[];
  fingerprint:string; serializedLength:number;
}

export class ArchitectContextError extends Error {
  constructor(public readonly code:'invalid_scope'|'required_overflow', message:string) { super(message); this.name='ArchitectContextError'; }
}

const stable = <T extends {id:string}>(values:readonly T[]) => [...values].sort((a,b)=>a.id.localeCompare(b.id));
const hash = (value:unknown) => computeArchitectContextFingerprint(value);
const entry = (value:Omit<ArchitectContextEntry,'id'>):ArchitectContextEntry => ({...value,id:`${value.sourceType}:${value.sourceId}:${value.authority}`});
const itemContent=(item:any)=>Object.fromEntries(Object.entries(item).filter(([key])=>!['architectureId','provenance','revision'].includes(key)));

export function selectArchitectDesign(architecture:StoryArchitecture, scope:ArchitectScope) {
  if (!ARCHITECT_SCOPE_TYPES.includes(scope.type)) throw new ArchitectContextError('invalid_scope','scope typeが不正です。');
  const threads=new Map(architecture.threads.map(value=>[value.id,value])); const beats=new Map(architecture.beats.map(value=>[value.id,value]));
  const questions=new Map(architecture.questions.map(value=>[value.id,value]));
  if (scope.type!=='architecture' && !scope.id) throw new ArchitectContextError('invalid_scope','部分scopeにはidが必要です。');
  if (scope.type==='thread' && (!threads.has(scope.id!)||threads.get(scope.id!)?.status==='retired')) throw new ArchitectContextError('invalid_scope','対象Threadがありません。');
  if (scope.type==='beat' && (!beats.has(scope.id!)||beats.get(scope.id!)?.status==='retired')) throw new ArchitectContextError('invalid_scope','対象Beatがありません。');
  if (scope.type==='question' && (!questions.has(scope.id!)||questions.get(scope.id!)?.status==='retired')) throw new ArchitectContextError('invalid_scope','対象Questionがありません。');
  let selectedThreads:StoryArchitectureThread[]=[]; let selectedBeats:StoryArchitectureBeat[]=[]; let selectedQuestions:StoryArchitectureQuestion[]=[]; let selectedConstraints:StoryArchitectureConstraint[]=[];
  if (scope.type==='architecture') {
    selectedThreads=architecture.threads.slice(0,24); selectedBeats=architecture.beats.slice(0,48); selectedQuestions=architecture.questions.slice(0,24);
    const approved=architecture.constraints.filter(value=>value.status==='approved');const supplemental=architecture.constraints.filter(value=>value.status!=='approved'&&value.status!=='retired').slice(0,Math.max(0,32-approved.length));selectedConstraints=[...approved,...supplemental];
  } else if (scope.type==='thread') {
    selectedThreads=[threads.get(scope.id!)!]; selectedBeats=architecture.beats.filter(value=>value.threadId===scope.id).slice(0,48);
    selectedQuestions=architecture.questions.filter(value=>value.threadId===scope.id || (value.beatId && selectedBeats.some(beat=>beat.id===value.beatId)));
    selectedConstraints=architecture.constraints.filter(value=>value.threadId===scope.id || (value.beatId && selectedBeats.some(beat=>beat.id===value.beatId)) || value.scope==='architecture');
  } else if (scope.type==='question') {
    const target=questions.get(scope.id!)!; selectedQuestions=[target];
    selectedThreads=target.threadId && threads.has(target.threadId)?[threads.get(target.threadId)!]:[];
    selectedBeats=target.beatId && beats.has(target.beatId)?[beats.get(target.beatId)!]:[];
    selectedConstraints=architecture.constraints.filter(value=>value.scope==='architecture'||value.threadId===target.threadId||value.beatId===target.beatId);
  } else {
    const target=beats.get(scope.id!)!; const ordered=[...architecture.beats].sort((a,b)=>(a.presentationOrder??Number.MAX_SAFE_INTEGER)-(b.presentationOrder??Number.MAX_SAFE_INTEGER)||a.id.localeCompare(b.id));
    const index=ordered.findIndex(value=>value.id===target.id); const neighborIds=new Set(ordered.slice(Math.max(0,index-2),index+3).map(value=>value.id));
    architecture.relations.filter(value=>value.fromBeatId===target.id||value.toBeatId===target.id).forEach(value=>{neighborIds.add(value.fromBeatId);neighborIds.add(value.toBeatId);});
    architecture.beats.filter(value=>target.threadId && value.threadId===target.threadId).slice(0,8).forEach(value=>neighborIds.add(value.id));
    selectedBeats=architecture.beats.filter(value=>neighborIds.has(value.id)); selectedThreads=target.threadId&&threads.has(target.threadId)?[threads.get(target.threadId)!]:[];
    selectedQuestions=architecture.questions.filter(value=>value.beatId===target.id||value.threadId===target.threadId).slice(0,12);
    selectedConstraints=architecture.constraints.filter(value=>value.scope==='architecture'||value.beatId===target.id||value.threadId===target.threadId);
  }
  const beatIds=new Set(selectedBeats.map(value=>value.id));
  return {threads:stable(selectedThreads),beats:stable(selectedBeats),questions:stable(selectedQuestions),constraints:stable(selectedConstraints),relations:stable(architecture.relations.filter(value=>beatIds.has(value.fromBeatId)&&beatIds.has(value.toBeatId)))};
}

function designEntries(architecture:StoryArchitecture,scope:ArchitectScope):ArchitectContextEntry[] {
  const selected=selectArchitectDesign(architecture,scope); const result:ArchitectContextEntry[]=[];
  const add=(kind:string,item:any)=>{
    if(item.status==='retired') return;
    const approved=item.status==='approved'; const required=kind==='constraint'&&approved;
    result.push(entry({sourceType:`architecture_${kind}`,sourceId:item.id,authority:approved?'approved_design':'unresolved_design',tier:required?0:1,required,title:`${approved?'Approved Design':'Unresolved Design'}: ${kind}`,content:itemContent(item)}));
  };
  selected.threads.forEach(value=>add('thread',value)); selected.beats.forEach(value=>add('beat',value)); selected.constraints.forEach(value=>add('constraint',value)); selected.questions.forEach(value=>add('question',value));
  selected.relations.forEach(value=>result.push(entry({sourceType:'architecture_relation',sourceId:value.id,authority:'existing_plan',tier:1,required:false,title:`Relation: ${value.type}`,content:value})));
  return result;
}

function supplementalEntries(sources:ArchitectSupplementalSources={}):ArchitectContextEntry[] {
  const values:ArchitectContextEntry[]=[]; const add=(sourceType:string,authority:ArchitectAuthority,tier:2|3|4,items:any[],title:string)=>stable(items||[]).forEach(item=>values.push(entry({sourceType,sourceId:item.id,authority,tier,required:false,title,content:item})));
  add('chapter_actual','actual_written',2,sources.actualChapters?.map(({planning,...value})=>value)||[],'Actual Written');
  add('chapter_plan','existing_plan',3,sources.actualChapters?.map(value=>({id:value.id,...value.planning}))||[],'Chapter Planning');
  add('story_fact','author_truth',2,sources.storyFacts||[],'Author Truth'); add('character_knowledge','current_state',2,(sources.characterKnowledge||[]).filter(value=>value.phase==='current'),'Character Perception');
  add('relationship','current_state',2,sources.relationships||[],'Current Relationship Snapshot'); add('character','current_state',2,sources.characters||[],'Current Character');
  add('plot','existing_plan',3,sources.plots||[],'Existing Plan'); add('foreshadowing','existing_plan',3,sources.foreshadowings||[],'Registered Foreshadowing');
  add('navigator_accepted','approved_direction',3,sources.navigatorAccepted||[],'Approved Direction');
  for(const meaning of stable(sources.meanings||[]).filter(value=>value.fresh!==false&&(value.status===undefined||value.status==='completed'))) for(const claim of stable(meaning.claims)) values.push(entry({sourceType:'story_meaning_claim',sourceId:claim.id,authority:claim.adopted?'interpretive_author_adopted':'interpretive_ai_analysis',tier:4,required:false,title:'Interpretive Reference',content:{...claim,runId:meaning.id,chapterId:meaning.chapterId,contextFingerprint:meaning.contextFingerprint}}));
  add('narrative_rule','narrative_boundary',3,sources.narrativeRules||[],'Narrative Boundary / Expression Constraint');
  return values;
}

export function buildArchitectContext(input:BuildArchitectContextInput):ArchitectContext {
  if(!input.currentInstruction.trim()) throw new ArchitectContextError('invalid_scope','currentInstructionが必要です。');
  const required:ArchitectContextEntry[]=[
    entry({sourceType:'contract',sourceId:STORY_ARCHITECT_CONTEXT_VERSION,authority:'current_instruction',tier:0,required:true,title:'Authority Boundary',content:{proposedIsCanon:false,approvedDesignIsCanon:false,applyAllowed:false,ifOnlyExcluded:true}}),
    entry({sourceType:'instruction',sourceId:'current',authority:'current_instruction',tier:0,required:true,title:'Current Instruction',content:input.currentInstruction}),
    entry({sourceType:'author_intent',sourceId:input.project.id,authority:'author_intent',tier:0,required:true,title:'Author Intent',content:input.project.authorIntent}),
    entry({sourceType:'canon_mode',sourceId:input.architecture.id,authority:'author_truth',tier:0,required:true,title:'Canon Boundary',content:{mode:input.architecture.canonMode,semantics:input.architecture.canonMode==='respect_current_canon'?'immutable_boundary':'revision_baseline',revisionTarget:input.scope.revisionTarget||null}}),
    entry({sourceType:'knowledge_boundary',sourceId:input.project.id,authority:'author_truth',tier:0,required:true,title:'Knowledge Boundary',content:{authorTruthIsNotCharacterKnowledge:true,plannedKnowledgeIsNotActualKnowledge:true,readerHiddenIsNotReaderKnown:true}}),
  ];
  const entries=[...required,...designEntries(input.architecture,input.scope),entry({sourceType:'project_overview',sourceId:input.project.id,authority:'existing_plan',tier:2,required:false,title:'Project Overview',content:{title:input.project.title,description:input.project.description}}),...supplementalEntries(input.sources),entry({sourceType:'genre_guidance',sourceId:input.project.id,authority:'design_lens',tier:4,required:false,title:'Genre Guidance',content:{genre:input.project.genre,mode:input.project.genreGuidanceMode,notes:input.project.genreGuidanceNotes,requirement:false}})]
    .sort((a,b)=>a.tier-b.tier||Number(b.required)-Number(a.required)||a.id.localeCompare(b.id));
  const limit=input.limit??ARCHITECT_CONTEXT_LIMIT; const entryLimit=Math.max(0,limit-3500); const included:ArchitectContextEntry[]=[]; const omitted:string[]=[];
  for(const value of entries){const candidate=[...included,value]; const length=JSON.stringify(candidate).length;if(length<=entryLimit) included.push(value);else if(value.required) throw new ArchitectContextError('required_overflow',`required entryが${limit}文字の上限を超えました。`);else omitted.push(value.id);}
  const assemble=():ArchitectContext=>{
    const semantic={version:STORY_ARCHITECT_CONTEXT_VERSION,projectId:input.project.id,architectureId:input.architecture.id,scope:input.scope,currentInstruction:input.currentInstruction,canonMode:input.architecture.canonMode,authorIntent:input.project.authorIntent,entries:included.map(({id,sourceType,sourceId,authority,tier,required,title,content})=>({id,sourceType,sourceId,authority,tier,required,title,content}))};
    const sourceManifest=included.map(value=>({sourceType:value.sourceType,sourceId:value.sourceId,fingerprint:hash(value.content),authority:value.authority}));
    const omissionDiagnostics=[...omitted].sort().slice(0,50).map(id=>`omitted_due_to_budget:${id}`);if(omitted.length>50)omissionDiagnostics.push(`omitted_due_to_budget:additional:${omitted.length-50}`);
    const result:ArchitectContext={version:STORY_ARCHITECT_CONTEXT_VERSION,projectId:input.project.id,architectureId:input.architecture.id,scope:input.scope,currentInstruction:input.currentInstruction,canonMode:input.architecture.canonMode,canonBoundary:input.architecture.canonMode==='respect_current_canon'?'immutable_boundary':'revision_baseline',invariants:{proposedIsCanon:false,approvedDesignIsCanon:false,applyAllowed:false,ifOnlyExcluded:true},entries:[...included],diagnostics:[...(input.diagnostics||[]),...omissionDiagnostics],omittedEntryIds:[...omitted].sort().slice(0,50),sourceManifest,fingerprint:computeArchitectContextFingerprint(semantic),serializedLength:0};
    result.serializedLength=JSON.stringify(result).length; return result;
  };
  let result=assemble();
  while(result.serializedLength>limit){let index=-1;for(let i=included.length-1;i>=0;i-=1)if(!included[i].required){index=i;break;}if(index<0) throw new ArchitectContextError('required_overflow','Context metadataを含めるとrequired上限を超えます。');omitted.push(included[index].id);included.splice(index,1);result=assemble();}
  return result;
}
