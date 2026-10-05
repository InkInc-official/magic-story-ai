export class StoryArchitecturePersistenceError extends Error {
  constructor(public readonly status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = 'StoryArchitecturePersistenceError';
  }
}

type Input = Record<string, unknown>;

function object(value: unknown): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StoryArchitecturePersistenceError(400, 'JSON objectが必要です。');
  return value as Input;
}

export function assertOnlyKeys(value: unknown, allowed: readonly string[]): Input {
  const input = object(value);
  const extra = Object.keys(input).filter(key => !allowed.includes(key));
  if (extra.length) throw new StoryArchitecturePersistenceError(400, `未対応のフィールドです: ${extra.join(', ')}`);
  return input;
}

export function asStoryArchitectureInput(value: unknown): Input { return object(value); }

export function designStatusForDecision(decision: 'approved' | 'rejected' | 'held') {
  return decision === 'approved' ? 'approved' : decision === 'rejected' ? 'retired' : 'proposed';
}
