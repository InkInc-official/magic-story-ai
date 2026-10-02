import 'server-only';
import { db } from '@/lib/db';
import { buildInspectorContext, InspectorContextInputError, type InspectorContextOptions, type InspectorSources } from '@/lib/inspector-context';

const chapterRefSelect = { id: true, projectId: true, order: true, title: true } as const;

export async function loadInspectorSources(projectId: string, chapterId: string): Promise<InspectorSources> {
  const chapter = await db.chapter.findFirst({
    where: { id: chapterId, projectId },
    select: { id: true, projectId: true, order: true, title: true, content: true, povCharacterId: true, narratorId: true },
  });
  if (!chapter) throw new InspectorContextInputError('同じProjectのChapterが見つかりません');

  const [project, characters, narrators, cast, narrativeRules, storyFacts, characterKnowledge, relationships] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true, narrativePerspective: true, defaultPovCharacterId: true, defaultNarratorId: true } }),
    db.character.findMany({ where: { projectId }, select: { id: true, projectId: true, name: true, firstPerson: true, defaultSecondPerson: true, speechRegister: true, speechStyleNotes: true, narrationVoiceNotes: true, updatedAt: true } }),
    db.narratorProfile.findMany({ where: { projectId }, include: { linkedCharacter: { select: { id: true, name: true } }, identityFact: { select: { id: true, content: true, readerInitiallyKnows: true } } } }),
    db.chapterCharacter.findMany({ where: { chapterId }, select: { chapterId: true, characterId: true, participation: true, notes: true, order: true } }),
    db.narrativeRule.findMany({ where: { projectId }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] }),
    db.storyFact.findMany({ where: { projectId }, include: { plannedRevealChapter: { select: chapterRefSelect }, revealedChapter: { select: chapterRefSelect } } }),
    db.characterKnowledge.findMany({
      where: { fact: { projectId } },
      include: { effectiveChapter: { select: chapterRefSelect } },
      orderBy: [{ characterId: 'asc' }, { createdAt: 'asc' }],
    }),
    db.characterRelationship.findMany({ where: { projectId } }),
  ]);
  if (!project) throw new InspectorContextInputError('Projectが見つかりません');

  return {
    project,
    chapter: { ...chapter, updatedAt: null },
    characters,
    narrators,
    cast,
    narrativeRules,
    storyFacts,
    characterKnowledge,
    relationships,
  };
}

export async function loadAndBuildInspectorContext(projectId: string, chapterId: string, options: InspectorContextOptions = {}) {
  return buildInspectorContext(await loadInspectorSources(projectId, chapterId), options);
}
