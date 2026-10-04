import type { CharacterKnowledgeEvent, KnowledgeCharacter } from '@/lib/character-knowledge';
import type { StoryFactValue } from '@/lib/story-facts';
import type { ProjectCreativeRule } from '@/lib/creative-rules';

export const STORY_NAVIGATOR_CONTEXT_VERSION = '3b2-v2';
export const STORY_NAVIGATOR_CONTEXT_HARD_CAP = 18_000;

export interface NavigatorChapter {
  id: string;
  order: number;
  title: string;
  outlineContent: string;
  content: string;
  summary: string;
  status: string;
  povCharacterId?: string | null;
  purpose?: string;
  endingNotes?: string;
  updatedAt?: Date | string;
  chapterCharacters?: Array<{ characterId: string; participation: string; notes: string; order: number; character: NavigatorCharacter }>;
}

export interface NavigatorCharacter extends KnowledgeCharacter {
  role: string;
  personality?: string;
  background?: string;
  arc?: string;
  firstPerson?: string;
  defaultSecondPerson?: string;
  speechRegister?: string;
  speechStyleNotes?: string;
  narrationVoiceNotes?: string;
}

export interface NavigatorRelationship {
  id: string;
  fromCharacterId: string;
  toCharacterId: string;
  type: string;
  description: string;
  addressTerm?: string;
  speechRegister?: string;
  speechStyleNotes?: string;
  fromCharacter?: { name: string };
  toCharacter?: { name: string };
}

export interface NavigatorStoryState { id: string; chapterId: string; type: string; data: string; chapter: { id: string; order: number; title?: string } }
export interface NavigatorPlot { id: string; name: string; description: string; status: string; priority: number; order: number }
export interface NavigatorForeshadowing { id: string; chapterId: string; content: string; expectedResolveChapter: number; status: string; importance: string }
export interface NavigatorWorldSetting { id: string; name: string; description: string; rules: string; type: string; order: number }
export interface NavigatorScene { id: string; name: string; description: string; location: string; atmosphere: string; timeOfDay: string; order: number }
export interface NavigatorStoryNode { id: string; title: string; description: string; order: number }
export interface NavigatorStoryEdge { id: string; sourceId: string; targetId: string; label: string; edgeType: string; sourceNode?: { title: string }; targetNode?: { title: string } }

export interface NavigatorSource {
  project: {
    id: string; title: string; genre: string; description: string; authorIntent: string;
    genreGuidanceMode: string; genreGuidanceNotes: string; narrativePerspective?: string | null;
    defaultPovCharacterId?: string | null; povNotes?: string; writingStyleNotes?: string;
    formattingNotes?: string; defaultChapterTarget?: number | null; chapterLengthPolicy?: string;
  };
  anchor: NavigatorChapter;
  chapters: NavigatorChapter[];
  characters: NavigatorCharacter[];
  relationships: NavigatorRelationship[];
  storyFacts: StoryFactValue[];
  characterKnowledge: CharacterKnowledgeEvent[];
  storyStates: NavigatorStoryState[];
  outlines: Array<{ id: string; content: string; version: number; updatedAt?: Date | string }>;
  plots: NavigatorPlot[];
  foreshadowings: NavigatorForeshadowing[];
  worldSettings: NavigatorWorldSetting[];
  scenes: NavigatorScene[];
  storyNodes: NavigatorStoryNode[];
  storyEdges: NavigatorStoryEdge[];
  creativeRules?: ProjectCreativeRule[];
}

export type NavigatorReaderState = 'reader-known' | 'reader-hidden';
export interface NavigatorFactState { fact: StoryFactValue; readerState: NavigatorReaderState; plannedRevealInFuture: boolean }
export interface NavigatorKnowledgeState { event: CharacterKnowledgeEvent; character: KnowledgeCharacter; fact: StoryFactValue }

export interface NavigatorCurrentState {
  project: NavigatorSource['project'];
  actual: { anchor: NavigatorChapter; chapters: NavigatorChapter[] };
  canonical: {
    facts: NavigatorFactState[];
    characterKnowledge: NavigatorKnowledgeState[];
    storyStates: NavigatorStoryState[];
    relationships: NavigatorRelationship[];
    worldSettings: NavigatorWorldSetting[];
    scenes: NavigatorScene[];
  };
  planned: {
    outlines: NavigatorSource['outlines']; plots: NavigatorPlot[]; foreshadowings: NavigatorForeshadowing[];
    futureKnowledge: NavigatorKnowledgeState[];
    storyNodes: NavigatorStoryNode[]; storyEdges: NavigatorStoryEdge[];
  };
  proposed: never[];
}

export interface NavigatorContextInput { projectId: string; anchorChapterId: string; authorInstruction?: string }
export interface NavigatorSourceManifest {
  version: string;
  anchor: { id: string; order: number };
  chapters: Array<{ id: string; order: number; updatedAt?: string }>;
  characterIds: string[];
  storyFactIds: string[];
  characterKnowledgeIds: string[];
  outlineIds: string[];
  plotIds: string[];
  relationshipIds: string[];
  foreshadowingIds: string[];
  storyStateIds: string[];
  worldSettingIds: string[];
  sceneIds: string[];
  storyNodeIds: string[];
  storyEdgeIds: string[];
  omittedSections: string[];
  finalContextLength: number;
}

export interface NavigatorContextResult { context: string; manifest: NavigatorSourceManifest; currentState: NavigatorCurrentState }
