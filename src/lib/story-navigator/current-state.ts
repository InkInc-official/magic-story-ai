import { db } from '@/lib/db';
import type {
  NavigatorCurrentState, NavigatorFactState, NavigatorKnowledgeState, NavigatorSource,
} from './types';

const chapterOrder = (event: NavigatorSource['characterKnowledge'][number]) => event.effectiveChapter?.order;

export function classifyNavigatorFact(fact: NavigatorSource['storyFacts'][number], anchorOrder: number): NavigatorFactState {
  const revealedOrder = fact.revealedChapter?.order;
  const readerKnown = fact.readerInitiallyKnows || (typeof revealedOrder === 'number' && revealedOrder <= anchorOrder);
  const plannedOrder = fact.plannedRevealChapter?.order;
  return { fact, readerState: readerKnown ? 'reader-known' : 'reader-hidden', plannedRevealInFuture: typeof plannedOrder === 'number' && plannedOrder > anchorOrder };
}

export function resolveNavigatorKnowledge(
  events: NavigatorSource['characterKnowledge'],
  facts: NavigatorSource['storyFacts'],
  characters: NavigatorSource['characters'],
  anchorOrder: number,
): { current: NavigatorKnowledgeState[]; future: NavigatorKnowledgeState[] } {
  const factsById = new Map(facts.map(fact => [fact.id, fact]));
  const charactersById = new Map(characters.map(character => [character.id, character]));
  const groups = new Map<string, typeof events>();
  for (const event of events) {
    const key = `${event.factId}:${event.characterId}`;
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  const current: NavigatorKnowledgeState[] = [];
  const future: NavigatorKnowledgeState[] = [];
  for (const values of groups.values()) {
    const fact = factsById.get(values[0].factId);
    const character = charactersById.get(values[0].characterId);
    if (!fact || !character) continue;
    const eligible = values.filter(event => event.effectiveChapterId == null || (typeof chapterOrder(event) === 'number' && chapterOrder(event)! <= anchorOrder));
    const chapterEvents = eligible.filter(event => event.effectiveChapterId != null)
      .sort((a, b) => (chapterOrder(b) || 0) - (chapterOrder(a) || 0));
    const baseline = eligible.find(event => event.effectiveChapterId == null);
    const selected = chapterEvents[0] || baseline;
    if (selected) current.push({ event: selected, character, fact });
    values.filter(event => typeof chapterOrder(event) === 'number' && chapterOrder(event)! > anchorOrder)
      .forEach(event => future.push({ event, character, fact }));
  }
  return { current, future };
}

export function deriveNavigatorCurrentState(source: NavigatorSource): NavigatorCurrentState {
  const anchorOrder = source.anchor.order;
  const actualChapters = source.chapters.filter(chapter => chapter.order <= anchorOrder).sort((a, b) => a.order - b.order);
  const knowledge = resolveNavigatorKnowledge(source.characterKnowledge, source.storyFacts, source.characters, anchorOrder);
  // StoryState.data has no stable entity key, so records of the same broad type
  // cannot safely overwrite each other. Preserve all established records and
  // order newest first instead of guessing which character/location they describe.
  const establishedStoryStates = source.storyStates
    .filter(state => state.chapter.order <= anchorOrder)
    .sort((a, b) => b.chapter.order - a.chapter.order);
  return {
    project: source.project,
    actual: { anchor: source.anchor, chapters: actualChapters },
    canonical: {
      facts: source.storyFacts.map(fact => classifyNavigatorFact(fact, anchorOrder)),
      characterKnowledge: knowledge.current,
      storyStates: establishedStoryStates,
      relationships: source.relationships,
      worldSettings: source.worldSettings,
      scenes: source.scenes,
    },
    planned: {
      outlines: source.outlines,
      plots: source.plots.filter(plot => plot.status === 'planned' || plot.status === 'active'),
      foreshadowings: source.foreshadowings.filter(item => item.status !== 'resolved'),
      futureKnowledge: knowledge.future,
      storyNodes: source.storyNodes,
      storyEdges: source.storyEdges,
    },
    proposed: [],
  };
}

export async function loadNavigatorSource(projectId: string, anchorChapterId: string): Promise<NavigatorSource> {
  const anchor = await db.chapter.findFirst({ where: { id: anchorChapterId, projectId }, include: { chapterCharacters: { include: { character: true }, orderBy: { order: 'asc' } } } });
  if (!anchor) throw new Error('Navigator anchor chapter was not found in the project');
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      chapters: { where: { order: { lte: anchor.order } }, orderBy: { order: 'asc' } },
      characters: true,
      characterRelations: { include: { fromCharacter: { select: { name: true } }, toCharacter: { select: { name: true } } } },
      storyFacts: { include: { plannedRevealChapter: { select: { id: true, order: true, title: true } }, revealedChapter: { select: { id: true, order: true, title: true } }, characterKnowledge: { include: { effectiveChapter: { select: { id: true, order: true, title: true } }, character: { select: { id: true, name: true } } } } } },
      storyStates: { include: { chapter: { select: { id: true, order: true, title: true } } } },
      outlines: { orderBy: { version: 'desc' } }, plots: true, foreshadowings: true, worldSettings: true, scenes: true,
      storyNodes: true, storyEdges: { include: { sourceNode: { select: { title: true } }, targetNode: { select: { title: true } } } },
    },
  });
  if (!project) throw new Error('Navigator project was not found');
  return {
    project, anchor, chapters: project.chapters, characters: project.characters, relationships: project.characterRelations,
    storyFacts: project.storyFacts, characterKnowledge: project.storyFacts.flatMap(fact => fact.characterKnowledge),
    storyStates: project.storyStates, outlines: project.outlines, plots: project.plots, foreshadowings: project.foreshadowings,
    worldSettings: project.worldSettings, scenes: project.scenes, storyNodes: project.storyNodes, storyEdges: project.storyEdges,
  };
}
