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

  const [project, characters, narrators, cast, narrativeRules, storyFacts, characterKnowledge, relationships, symbolDefinitions] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true, narrativePerspective: true, defaultPovCharacterId: true, defaultNarratorId: true } }),
    db.character.findMany({ where: { projectId }, select: { id: true, projectId: true, name: true, firstPerson: true, defaultSecondPerson: true, speechRegister: true, speechStyleNotes: true, narrationVoiceNotes: true, updatedAt: true }, orderBy: { id: 'asc' } }),
    db.narratorProfile.findMany({ where: { projectId }, include: { linkedCharacter: { select: { id: true, name: true } }, identityFact: { select: { id: true, content: true, readerInitiallyKnows: true } } }, orderBy: { id: 'asc' } }),
    db.chapterCharacter.findMany({ where: { chapterId }, select: { chapterId: true, characterId: true, participation: true, notes: true, order: true }, orderBy: [{ order: 'asc' }, { characterId: 'asc' }] }),
    db.narrativeRule.findMany({ where: { projectId }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] }),
    db.storyFact.findMany({ where: { projectId }, include: { plannedRevealChapter: { select: chapterRefSelect }, revealedChapter: { select: chapterRefSelect } }, orderBy: { id: 'asc' } }),
    db.characterKnowledge.findMany({
      where: { fact: { projectId } },
      include: { effectiveChapter: { select: chapterRefSelect } },
      orderBy: [{ characterId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
    db.characterRelationship.findMany({ where: { projectId }, orderBy: { id: 'asc' } }),
    db.projectSymbolDefinition.findMany({
      where: { projectId },
      include: {
        usageRules: { orderBy: [{ priority: 'desc' }, { id: 'asc' }] },
        overrides: { where: { chapterId }, orderBy: [{ startOffset: 'asc' }, { endOffset: 'asc' }, { id: 'asc' }] },
      },
      orderBy: [{ openSymbol: 'asc' }, { closeSymbol: 'asc' }, { id: 'asc' }],
    }),
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
    symbolDictionary: {
      definitions: symbolDefinitions.map(value => ({
        id: value.id, projectId: value.projectId, openSymbol: value.openSymbol, closeSymbol: value.closeSymbol,
        label: value.label, active: value.active, order: value.order, defaultUsageRuleId: value.defaultUsageRuleId,
      })),
      usageRules: symbolDefinitions.flatMap(value => value.usageRules.map(rule => ({
        id: rule.id, projectId: rule.projectId, definitionId: rule.definitionId, label: rule.label,
        description: rule.description, semanticKind: rule.semanticKind as 'dialogue' | 'inner_voice' | 'quotation' | 'narrative_span' | 'displayed_text' | 'special_voice' | 'custom',
        countsAsDialogue: rule.countsAsDialogue, countsAsNarration: rule.countsAsNarration,
        countsAsInnerVoice: rule.countsAsInnerVoice, readerVisible: rule.readerVisible, spokenAloud: rule.spokenAloud,
        speakerMode: rule.speakerMode as 'none' | 'fixed_character' | 'current_pov' | 'contextual' | 'unknown',
        fixedSpeakerId: rule.fixedSpeakerId, priority: rule.priority, active: rule.active,
        provenance: rule.provenance as 'author' | 'imported' | 'ai_suggested_then_confirmed',
      }))),
      overrides: symbolDefinitions.flatMap(value => value.overrides.map(override => ({
        id: override.id, projectId: override.projectId, chapterId: override.chapterId,
        definitionId: override.definitionId, usageRuleId: override.usageRuleId,
        status: override.status as 'confirmed' | 'unresolved', startOffset: override.startOffset,
        endOffset: override.endOffset, exactExcerpt: override.exactExcerpt, anchorBefore: override.anchorBefore,
        anchorAfter: override.anchorAfter, contentHash: override.contentHash, anchorFingerprint: override.anchorFingerprint,
      }))),
    },
  };
}

export async function loadAndBuildInspectorContext(projectId: string, chapterId: string, options: InspectorContextOptions = {}) {
  return buildInspectorContext(await loadInspectorSources(projectId, chapterId), options);
}
