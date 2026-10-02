import { createChatCompletion } from '@/lib/ai-client';
import { loadAndBuildInspectorContext } from '@/lib/inspector-context-loader';
import { NarrativeInspectorError } from '@/lib/narrative-inspector';
import { inspectBuiltContext, type InspectorCompletion } from '@/lib/narrative-inspector-runner';

export interface NarrativeInspectorRequest { projectId: string; chapterId: string; startOffset?: number; endOffset?: number }
export async function runNarrativeInspector(request: NarrativeInspectorRequest, complete: InspectorCompletion = async messages => createChatCompletion({ messages, temperature: 0.1, max_tokens: 5000 })) {
  const hasRange = request.startOffset !== undefined || request.endOffset !== undefined;
  if (hasRange && (!Number.isInteger(request.startOffset) || !Number.isInteger(request.endOffset))) throw new NarrativeInspectorError('invalid_schema', 'startOffsetとendOffsetは両方整数で指定してください');
  const context = await loadAndBuildInspectorContext(request.projectId, request.chapterId, hasRange ? { range: { start: request.startOffset!, end: request.endOffset! } } : {});
  const result = await inspectBuiltContext(context, complete);
  return { ...result, inspectedRange: { start: context.inspectedText.startOffset, end: context.inspectedText.endOffset }, contentHash: context.inspectedText.contentHash, truncated: context.inspectedText.truncated };
}
