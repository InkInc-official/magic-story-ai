import type { InspectorBuiltContext } from './inspector-context';
import { buildContextFingerprint } from './narrative-inspector-persistence';

export const INSPECTOR_FINGERPRINT_VERSIONS = ['legacy-v1', 'semantic-v2'] as const;
export type InspectorFingerprintVersion = typeof INSPECTOR_FINGERPRINT_VERSIONS[number];
export const LEGACY_INSPECTOR_FINGERPRINT_VERSION: InspectorFingerprintVersion = 'legacy-v1';
export const CURRENT_INSPECTOR_FINGERPRINT_VERSION: InspectorFingerprintVersion = 'semantic-v2';

const byId = <T extends { id: string }>(values: T[]) => [...values].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const eventValue = (event: InspectorBuiltContext['knowledge']['characters'][number]['beforeChapter']) => event ? {
  id: event.id,
  factId: event.factId,
  characterId: event.characterId,
  status: event.status,
  effectiveChapterId: event.effectiveChapterId || null,
  effectiveChapterOrder: event.effectiveChapter?.order ?? null,
  beliefNotes: event.beliefNotes || '',
  notes: event.notes || '',
} : null;

/**
 * semantic-v2 contains only author-relevant inputs used by the current
 * Inspector. Structural parser provenance and future semantic dependencies
 * (including the Project Symbol Dictionary) are deliberately excluded.
 */
export function buildCanonicalInspectorSemanticFingerprintPayloadV2(context: InspectorBuiltContext) {
  const included = new Set(context.budget.included.map(item => item.id));
  const readerByFact = new Map(context.knowledge.reader.map(value => [value.factId, value]));

  return {
    target: {
      projectId: context.manifest.projectId,
      chapterId: context.manifest.chapterId,
      requestedRange: context.inspectedText.requestedRange,
      inspectedRange: { start: context.inspectedText.startOffset, end: context.inspectedText.endOffset },
      excerpt: context.inspectedText.excerpt,
      surroundingBefore: included.has('surrounding-text') ? context.inspectedText.surroundingBefore : '',
      surroundingAfter: included.has('surrounding-text') ? context.inspectedText.surroundingAfter : '',
    },
    authorConfiguration: {
      perspective: context.roles.perspective || null,
      narratorId: context.roles.narrator?.id || null,
      povId: context.roles.pov?.id || null,
      narratorKnowledgeSource: context.knowledge.narratorKnowledgeSource,
      narratorIdentity: context.roles.narratorIdentity ? {
        factId: context.roles.narratorIdentity.factId,
        disclosureMode: context.roles.narratorIdentity.disclosureMode,
        readerState: context.roles.narratorIdentity.readerState,
      } : null,
    },
    cast: [...context.roles.cast].map(value => ({
      characterId: value.characterId,
      participation: value.participation,
      notes: value.notes || '',
    })).sort((a, b) => a.characterId < b.characterId ? -1 : a.characterId > b.characterId ? 1 : a.participation.localeCompare(b.participation)),
    rules: [...context.rules].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(rule => ({
      id: rule.id, title: rule.title, description: rule.description, category: rule.category,
      mode: rule.mode, priority: rule.priority, source: rule.source, machineKey: rule.machineKey || null,
      overridable: rule.overridable,
    })),
    narrator: context.roles.narrator ? {
      id: context.roles.narrator.id,
      name: context.roles.narrator.name,
      description: context.roles.narrator.description || '',
      voiceNotes: context.roles.narrator.voiceNotes || '',
      linkedCharacterId: context.roles.narrator.linkedCharacterId || null,
      identityFactId: context.roles.narrator.identityFactId || null,
      identityDisclosureMode: context.roles.narrator.identityDisclosureMode,
      notes: context.roles.narrator.notes || '',
    } : null,
    pov: context.roles.pov ? {
      id: context.roles.pov.id,
      name: context.roles.pov.name,
      narrationVoiceNotes: context.roles.pov.narrationVoiceNotes || '',
    } : null,
    facts: byId(context.knowledge.authorTruth).map(fact => ({
      id: fact.id, content: fact.content, importance: fact.importance,
      readerInitiallyKnows: fact.readerInitiallyKnows,
      plannedRevealChapterId: fact.plannedRevealChapterId || null,
      plannedRevealChapterOrder: fact.plannedRevealChapter?.order ?? null,
      revealedChapterId: fact.revealedChapterId || null,
      revealedChapterOrder: fact.revealedChapter?.order ?? null,
      notes: fact.notes || '',
      readerState: readerByFact.get(fact.id) || null,
    })),
    characterKnowledge: [...context.knowledge.characters]
      .sort((a, b) => a.characterId < b.characterId ? -1 : a.characterId > b.characterId ? 1 : a.factId < b.factId ? -1 : a.factId > b.factId ? 1 : 0)
      .map(item => ({
        characterId: item.characterId,
        factId: item.factId,
        beforeChapter: eventValue(item.beforeChapter),
        changesDuringChapter: byId(item.changesDuringChapter).map(eventValue),
        future: byId(item.future).map(eventValue),
      })),
    voices: byId(context.voices.characters).map(character => ({
      id: character.id, name: character.name, firstPerson: character.firstPerson || '',
      defaultSecondPerson: character.defaultSecondPerson || '', speechRegister: character.speechRegister || '',
      speechStyleNotes: character.speechStyleNotes || '', narrationVoiceNotes: character.narrationVoiceNotes || '',
    })),
    relationships: byId(context.voices.relationships).map(relation => ({
      id: relation.id, fromCharacterId: relation.fromCharacterId, toCharacterId: relation.toCharacterId,
      type: relation.type, addressTerm: relation.addressTerm || '', speechRegister: relation.speechRegister || '',
      speechStyleNotes: relation.speechStyleNotes || '',
    })),
  };
}

export function buildInspectorContextFingerprint(context: InspectorBuiltContext, version: InspectorFingerprintVersion): string {
  if (version === 'legacy-v1') return buildContextFingerprint(context.legacyFreshnessPayload);
  if (version === 'semantic-v2') return buildContextFingerprint(buildCanonicalInspectorSemanticFingerprintPayloadV2(context));
  const exhaustive: never = version;
  throw new Error(`Unsupported Inspector fingerprint version: ${exhaustive}`);
}

export function isInspectorFingerprintVersion(value: string): value is InspectorFingerprintVersion {
  return INSPECTOR_FINGERPRINT_VERSIONS.includes(value as InspectorFingerprintVersion);
}
