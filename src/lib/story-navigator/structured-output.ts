export const STORY_NAVIGATOR_OUTPUT_SCHEMA_VERSION = 1 as const;
export const STORY_NAVIGATOR_DECISION_STATUSES = ['undecided', 'held', 'accepted', 'rejected'] as const;
export type StoryNavigatorDecisionStatus = typeof STORY_NAVIGATOR_DECISION_STATUSES[number];

export interface StoryNavigatorRouteOutput {
  routeKey: string;
  title: string;
  summary: string;
  whyPossible: string;
  authorIntentRelation: string;
  preparation: string[];
  affectedEntities: string[];
  benefits: string[];
  risks: string[];
  immediateOptions: string[];
}

export interface StoryNavigatorStructuredOutput {
  schemaVersion: 1;
  currentPosition: { summary: string; planDeviation: string[] };
  routes: StoryNavigatorRouteOutput[];
}

const isString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);

export function isStoryNavigatorDecisionStatus(value: unknown): value is StoryNavigatorDecisionStatus {
  return typeof value === 'string' && STORY_NAVIGATOR_DECISION_STATUSES.includes(value as StoryNavigatorDecisionStatus);
}

export function selectDefaultNavigatorAnchor<T extends { id: string; order: number; content?: string }>(chapters: T[]): string {
  const sorted = [...chapters].sort((a, b) => b.order - a.order);
  return sorted.find(chapter => chapter.content?.trim())?.id || sorted[0]?.id || '';
}

export function validateStoryNavigatorOutput(value: unknown): StoryNavigatorStructuredOutput {
  if (!value || typeof value !== 'object') throw new Error('Navigator output must be an object');
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== STORY_NAVIGATOR_OUTPUT_SCHEMA_VERSION) throw new Error('Unsupported Navigator schemaVersion');
  const position = candidate.currentPosition as Record<string, unknown> | undefined;
  if (!position || !isString(position.summary) || !isStringArray(position.planDeviation)) throw new Error('Malformed currentPosition');
  if (!Array.isArray(candidate.routes) || candidate.routes.length < 2 || candidate.routes.length > 5) throw new Error('Navigator routes must contain 2 to 5 items');
  const keys = new Set<string>();
  const routes = candidate.routes.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Malformed route at index ${index}`);
    const route = raw as Record<string, unknown>;
    for (const key of ['routeKey', 'title', 'summary', 'whyPossible', 'authorIntentRelation'] as const) {
      if (!isString(route[key])) throw new Error(`Malformed ${key} at route ${index}`);
    }
    if (keys.has(route.routeKey as string)) throw new Error('Duplicate routeKey');
    keys.add(route.routeKey as string);
    for (const key of ['preparation', 'affectedEntities', 'benefits', 'risks', 'immediateOptions'] as const) {
      if (!isStringArray(route[key])) throw new Error(`Malformed ${key} at route ${index}`);
    }
    return route as unknown as StoryNavigatorRouteOutput;
  });
  return { schemaVersion: 1, currentPosition: { summary: position.summary.trim(), planDeviation: position.planDeviation }, routes };
}

export function extractStoryNavigatorOutput(raw: string): StoryNavigatorStructuredOutput {
  const text = raw.trim();
  if (!text) throw new Error('Navigator returned an empty response');
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1].trim());
  const candidates = [text, ...fenced];
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1));
  for (const candidate of [...new Set(candidates)]) {
    try { return validateStoryNavigatorOutput(JSON.parse(candidate)); } catch { /* try next exact candidate */ }
  }
  throw new Error('Navigator response is not valid structured JSON');
}
