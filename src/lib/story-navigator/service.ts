import { db } from '@/lib/db';
import { createChatCompletion } from '@/lib/ai-client';
import { buildStoryNavigatorContext } from './context';
import { STORY_NAVIGATOR_PROMPT_VERSION, STORY_NAVIGATOR_SYSTEM_PROMPT, buildStoryNavigatorUserPrompt } from '@/lib/prompts/ja/story-navigator';
import { extractStoryNavigatorOutput } from './structured-output';

export interface GenerateStoryNavigatorInput { projectId: string; anchorChapterId: string; request?: string }

export async function generateStoryNavigatorRun(
  input: GenerateStoryNavigatorInput,
  dependencies: {
    database?: typeof db;
    buildContext?: typeof buildStoryNavigatorContext;
    complete?: typeof createChatCompletion;
  } = {},
) {
  const database = dependencies.database || db;
  const buildContext = dependencies.buildContext || buildStoryNavigatorContext;
  const complete = dependencies.complete || createChatCompletion;
  const contextResult = await buildContext({ projectId: input.projectId, anchorChapterId: input.anchorChapterId, authorInstruction: input.request || '' });
  const project = contextResult.currentState.project;
  const run = await database.storyNavigatorRun.create({ data: {
    projectId: input.projectId,
    anchorChapterId: input.anchorChapterId,
    request: input.request?.trim() || '',
    promptVersion: STORY_NAVIGATOR_PROMPT_VERSION,
    contextBuilderVersion: contextResult.manifest.version,
    sourceManifest: JSON.stringify(contextResult.manifest),
    authorIntentSnapshot: project.authorIntent || '',
    genreGuidanceModeSnapshot: project.genreGuidanceMode || 'reference',
    genreGuidanceNotesSnapshot: project.genreGuidanceNotes || '',
    status: 'pending',
  } });

  let rawResponse = '';
  try {
    rawResponse = await complete({
      messages: [
        { role: 'system', content: STORY_NAVIGATOR_SYSTEM_PROMPT },
        { role: 'user', content: buildStoryNavigatorUserPrompt(contextResult.context) },
      ],
      temperature: 0.75,
      max_tokens: 5000,
    });
    const result = extractStoryNavigatorOutput(rawResponse);
    return await database.$transaction(async transaction => {
      await transaction.storyNavigatorRun.update({ where: { id: run.id }, data: {
        rawResponse,
        currentPositionSummary: result.currentPosition.summary,
        planDeviation: JSON.stringify(result.currentPosition.planDeviation),
        status: 'completed', error: '', completedAt: new Date(),
      } });
      await transaction.storyNavigatorProposal.createMany({ data: result.routes.map(route => ({
        runId: run.id,
        routeKey: route.routeKey,
        title: route.title,
        summary: route.summary,
        whyPossible: route.whyPossible,
        authorIntentRelation: route.authorIntentRelation,
        preparation: JSON.stringify(route.preparation),
        affectedEntities: JSON.stringify(route.affectedEntities),
        benefits: JSON.stringify(route.benefits),
        risks: JSON.stringify(route.risks),
        immediateOptions: JSON.stringify(route.immediateOptions),
        decisionStatus: 'undecided',
      })) });
      return transaction.storyNavigatorRun.findUniqueOrThrow({ where: { id: run.id }, include: { anchorChapter: { select: { id: true, order: true, title: true } }, proposals: { orderBy: { routeKey: 'asc' } } } });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Navigator generation failed';
    await database.storyNavigatorRun.update({ where: { id: run.id }, data: { rawResponse, status: 'failed', error: message, completedAt: new Date() } });
    throw error;
  }
}
