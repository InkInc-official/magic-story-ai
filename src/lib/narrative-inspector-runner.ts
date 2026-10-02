import type { BuiltInspectorContext } from './narrative-inspector';
import { extractNarrativeInspectorOutput, NarrativeInspectorError, sanitizeInspectorResult } from './narrative-inspector';
import { buildNarrativeInspectorUserPrompt, NARRATIVE_INSPECTOR_SYSTEM_PROMPT } from './prompts/ja/narrative-inspector';

export type InspectorCompletion = (messages: Array<{ role: 'system' | 'user'; content: string }>) => Promise<string>;

export async function inspectBuiltContext(context: BuiltInspectorContext, complete: InspectorCompletion) {
  let raw: string;
  try {
    raw = await complete([{ role: 'system', content: NARRATIVE_INSPECTOR_SYSTEM_PROMPT }, { role: 'user', content: buildNarrativeInspectorUserPrompt(context) }]);
  } catch (error) {
    if (error instanceof NarrativeInspectorError) throw error;
    throw new NarrativeInspectorError('ai_failure', error instanceof Error ? error.message : 'Inspector AIの実行に失敗しました');
  }
  return sanitizeInspectorResult(extractNarrativeInspectorOutput(raw, context), context);
}
