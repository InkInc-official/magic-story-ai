import { createHash } from 'node:crypto';
import type { MeaningSemanticPayload } from './types';

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item)]));
  }
  return value;
}

export function canonicalizeMeaningSemanticPayload(payload: MeaningSemanticPayload): string {
  return JSON.stringify(canonicalValue(payload));
}

export function computeMeaningContextFingerprint(payload: MeaningSemanticPayload): string {
  return createHash('sha256').update(canonicalizeMeaningSemanticPayload(payload)).digest('hex');
}

export function computeMeaningContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
