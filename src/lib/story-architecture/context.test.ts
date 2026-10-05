import assert from 'node:assert/strict';
import test from 'node:test';
import { ARCHITECT_CONTEXT_LIMIT, ArchitectContextError, buildArchitectContext, type BuildArchitectContextInput } from './context.js';
import type { StoryArchitecture } from './types.js';

const architecture=(overrides:Partial<StoryArchitecture>={}):StoryArchitecture=>({
  id:'a1',projectId:'p1',title:'設計',frameworkMode:'freeform',customFrameworkNotes:'',canonMode:'respect_current_canon',notes:'',revision:1,
  threads:[{id:'t1',architectureId:'a1',title:'恋愛線',description:'',threadType:'relationship',customTypeLabel:null,status:'approved',provenance:'author',order:0,revision:1}],
  beats:[
    {id:'b1',architectureId:'a1',threadId:'t1',title:'出会い',summary:'',intention:'',storyOrder:1,presentationOrder:2,chapterId:'c1',rhythm:'build',customRhythmLabel:null,status:'approved',provenance:'author',revision:1},
    {id:'b2',architectureId:'a1',threadId:'t1',title:'別離',summary:'',intention:'',storyOrder:2,presentationOrder:1,chapterId:'c2',rhythm:'release',customRhythmLabel:null,status:'draft',provenance:'author',revision:1},
    {id:'b3',architectureId:'a1',threadId:null,title:'退役案',summary:'',intention:'',storyOrder:3,presentationOrder:3,chapterId:null,rhythm:null,customRhythmLabel:null,status:'retired',provenance:'author',revision:1}],
  constraints:[{id:'k1',architectureId:'a1',title:'秘密',statement:'終盤まで隠す',mode:'required',scope:'architecture',threadId:null,beatId:null,status:'approved',provenance:'author',order:0,revision:1}],
  questions:[{id:'q1',architectureId:'a1',question:'再会するか',notes:'',state:'deferred',resolution:null,scope:'thread',threadId:'t1',beatId:null,status:'draft',provenance:'author',order:0,revision:1}],
  relations:[{id:'r1',architectureId:'a1',fromBeatId:'b1',toBeatId:'b2',type:'causes'}],decisions:[],...overrides,
});
const input=(overrides:Partial<BuildArchitectContextInput>={}):BuildArchitectContextInput=>({project:{id:'p1',title:'作品',genre:'ミステリー',description:'',authorIntent:'赦しを描く',genreGuidanceMode:'reference',genreGuidanceNotes:'フェアプレイ'},architecture:architecture(),scope:{type:'architecture'},currentInstruction:'終盤を設計したい',sources:{},...overrides});

test('authority labels keep actual, plan, truth, direction and interpretation separate',()=>{
  const value=buildArchitectContext(input({sources:{actualChapters:[{id:'c1',order:1,title:'第一章',contentExcerpt:'本文',planning:{outlineContent:'予定',summary:'要約',purpose:'導入',endingNotes:''}}],storyFacts:[{id:'f1',content:'犯人はA',readerState:'reader_hidden',importance:'high'}],plots:[{id:'p',name:'追跡',description:'',status:'active'}],navigatorAccepted:[{id:'n',title:'別案',summary:'方向'}],meanings:[{id:'m',chapterId:'c1',contextFingerprint:'fresh',claims:[{id:'mc1',statement:'孤独',layer:'observed',adopted:true},{id:'mc2',statement:'予兆',layer:'interpretive',adopted:false}]}]}}));
  const a=(type:string)=>value.entries.filter(item=>item.sourceType===type).map(item=>item.authority);
  assert.deepEqual(a('chapter_actual'),['actual_written']); assert.deepEqual(a('chapter_plan'),['existing_plan']); assert.deepEqual(a('story_fact'),['author_truth']); assert.deepEqual(a('plot'),['existing_plan']); assert.deepEqual(a('navigator_accepted'),['approved_direction']);
  assert.deepEqual(new Set(a('story_meaning_claim')),new Set(['interpretive_author_adopted','interpretive_ai_analysis']));
  assert.deepEqual(value.invariants,{proposedIsCanon:false,approvedDesignIsCanon:false,applyAllowed:false,ifOnlyExcluded:true});
});

test('canon modes preserve canon as immutable boundary or revision baseline',()=>{
  assert.equal(buildArchitectContext(input()).canonBoundary,'immutable_boundary');
  assert.equal(buildArchitectContext(input({architecture:architecture({canonMode:'revise_canon'}),scope:{type:'architecture',revisionTarget:'終盤'}})).canonBoundary,'revision_baseline');
});

test('approved constraint is required; draft/deferred stays unresolved; retired is excluded',()=>{
  const value=buildArchitectContext(input()); const constraint=value.entries.find(item=>item.sourceId==='k1')!;
  assert.equal(constraint.required,true); assert.equal(constraint.authority,'approved_design'); assert.equal(value.entries.find(item=>item.sourceId==='b2')?.authority,'unresolved_design'); assert.equal(value.entries.some(item=>item.sourceId==='b3'),false);
  assert.equal((value.entries.find(item=>item.sourceId==='q1')?.content as {state:string}).state,'deferred');
});

test('beat scope preserves nonlinear orders and relation semantics',()=>{
  const value=buildArchitectContext(input({scope:{type:'beat',id:'b1'}})); const beat=value.entries.find(item=>item.sourceId==='b1')!.content as {storyOrder:number;presentationOrder:number};
  assert.equal(beat.storyOrder,1); assert.equal(beat.presentationOrder,2); assert.equal(value.entries.find(item=>item.sourceId==='r1')?.title,'Relation: causes');
});

test('explicit thread/question targets work and deleted target fails closed',()=>{
  assert.ok(buildArchitectContext(input({scope:{type:'thread',id:'t1'}})).entries.some(item=>item.sourceId==='t1'));
  assert.ok(buildArchitectContext(input({scope:{type:'question',id:'q1'}})).entries.some(item=>item.sourceId==='q1'));
  assert.throws(()=>buildArchitectContext(input({scope:{type:'beat',id:'missing'}})),/対象Beat/);
});

test('required-first budget omits whole supplemental items deterministically',()=>{
  const plots=Array.from({length:100},(_,i)=>({id:`plot-${String(i).padStart(3,'0')}`,name:'計画',description:'あ'.repeat(500),status:'active'})); const value=buildArchitectContext(input({sources:{plots}}));
  assert.ok(value.serializedLength<=ARCHITECT_CONTEXT_LIMIT); assert.ok(value.omittedEntryIds.length>0); assert.ok(value.diagnostics.some(item=>item.startsWith('omitted_due_to_budget:'))); assert.ok(value.entries.some(item=>item.required));
  assert.throws(()=>buildArchitectContext(input({project:{...input().project,authorIntent:'あ'.repeat(19000)}})),(error:unknown)=>error instanceof ArchitectContextError&&error.code==='required_overflow');
});

test('fingerprint is order-stable, semantic, and raw-Unicode sensitive',()=>{
  const plots=[{id:'2',name:'B',description:'',status:'active'},{id:'1',name:'A',description:'',status:'planned'}]; const first=buildArchitectContext(input({sources:{plots}}));
  assert.equal(first.fingerprint,buildArchitectContext(input({sources:{plots:[...plots].reverse()}})).fingerprint);
  assert.notEqual(first.fingerprint,buildArchitectContext(input({currentInstruction:'別の指示',sources:{plots}})).fingerprint);
  assert.notEqual(first.fingerprint,buildArchitectContext(input({project:{...input().project,authorIntent:'別意図'},sources:{plots}})).fingerprint);
  assert.notEqual(buildArchitectContext(input({currentInstruction:'が'})).fingerprint,buildArchitectContext(input({currentInstruction:'か\u3099'})).fingerprint);
  assert.notEqual(first.fingerprint,buildArchitectContext(input({architecture:architecture({beats:architecture().beats.map(value=>value.id==='b1'?{...value,title:'変更後'}:value)}),sources:{plots}})).fingerprint);
  assert.notEqual(first.fingerprint,buildArchitectContext(input({sources:{plots,storyFacts:[{id:'fact',content:'新しい正史',readerState:'reader_known',importance:'high'}]}})).fingerprint);
  const stale={id:'stale',chapterId:'c1',contextFingerprint:'old',fresh:false,status:'completed',claims:[{id:'claim',statement:'古い分析',layer:'observed',adopted:false}]};
  assert.equal(first.fingerprint,buildArchitectContext(input({sources:{plots,meanings:[stale]}})).fingerprint);
});

test('future CharacterKnowledge and IF-only state never become current/canon',()=>{
  const value=buildArchitectContext(input({sources:{characterKnowledge:[{id:'future',factId:'f',characterId:'c',status:'knows',phase:'future'}]}}));
  assert.equal(value.entries.some(item=>item.sourceId==='future'),false); assert.equal(value.invariants.ifOnlyExcluded,true);
});

test('only fresh completed Meaning enters; observed/adopted still remains interpretive',()=>{
  const claim=(id:string)=>[{id:`claim-${id}`,statement:id,layer:'observed',adopted:true}];
  const value=buildArchitectContext(input({sources:{meanings:[
    {id:'fresh',chapterId:'c1',contextFingerprint:'f1',fresh:true,status:'completed',claims:claim('fresh')},
    {id:'stale',chapterId:'c1',contextFingerprint:'f2',fresh:false,status:'completed',claims:claim('stale')},
    {id:'failed',chapterId:'c1',contextFingerprint:'f3',fresh:true,status:'failed',claims:claim('failed')},
    {id:'pending',chapterId:'c1',contextFingerprint:'f4',fresh:true,status:'pending',claims:claim('pending')},
  ]}}));
  const meanings=value.entries.filter(item=>item.sourceType==='story_meaning_claim'); assert.deepEqual(meanings.map(item=>item.sourceId),['claim-fresh']); assert.equal(meanings[0].authority,'interpretive_author_adopted');
});

test('100/300 chapter inputs remain bounded and deterministic',()=>{
  for(const count of [100,300]){const chapters=Array.from({length:count},(_,i)=>({id:`c${String(i).padStart(3,'0')}`,order:i,title:`章${i}`,contentExcerpt:'短い抜粋',planning:{outlineContent:'',summary:'',purpose:'',endingNotes:''}}));const started=performance.now();const value=buildArchitectContext(input({sources:{actualChapters:chapters}}));assert.ok(value.serializedLength<=ARCHITECT_CONTEXT_LIMIT);assert.ok(value.entries.filter(item=>item.sourceType==='chapter_actual').length<count);assert.ok(performance.now()-started<1000);}
});
