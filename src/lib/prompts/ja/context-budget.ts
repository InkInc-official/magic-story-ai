export const GENERATION_CONTEXT_HARD_CAP = 18_000;

export type ContextTier = 0 | 1 | 2 | 3 | 4;

export interface ContextEntry {
  id: string;
  tier: ContextTier;
  full: string;
  compact?: string;
  minimum?: string;
  required?: boolean;
  relevance?: number;
}

export interface ContextBudgetResult {
  text: string;
  included: Array<{ id: string; representation: 'full' | 'compact' | 'minimum' | 'truncated' }>;
  omitted: string[];
}

const SEPARATOR = '\n\n';

function normalizedRepresentations(entry: ContextEntry) {
  const variants = [
    ['full', entry.full],
    ['compact', entry.compact],
    ['minimum', entry.minimum],
  ] as const;
  const seen = new Set<string>();
  return variants.filter((variant): variant is [typeof variant[0], string] => {
    const value = variant[1]?.trim();
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  }).map(([representation, value]) => ({ representation, value: value.trim() }));
}

function safeBoundary(text: string, limit: number): string {
  if (text.length <= limit) return text;
  if (limit <= 1) return text.slice(0, Math.max(0, limit));
  const candidate = text.slice(0, limit - 1);
  const floor = Math.floor(candidate.length * 0.55);
  const boundaries = [
    candidate.lastIndexOf('\n\n'),
    candidate.lastIndexOf('\n'),
    Math.max(candidate.lastIndexOf('。'), candidate.lastIndexOf('！'), candidate.lastIndexOf('？')) + 1,
  ].filter(position => position >= floor);
  const boundary = boundaries.length > 0 ? Math.max(...boundaries) : candidate.length;
  return `${candidate.slice(0, boundary).trimEnd()}…`;
}

function append(parts: string[], value: string) {
  parts.push(value);
}

function priorityScore(entry: ContextEntry): number {
  // Relevance can promote a strongly chapter-linked entry, but cannot erase the tier model entirely.
  const relevance = Math.max(-50, Math.min(150, entry.relevance || 0));
  return entry.tier * 100 - relevance;
}

export function buildContextWithinBudget(
  entries: ContextEntry[],
  maxCharacters = GENERATION_CONTEXT_HARD_CAP,
): ContextBudgetResult {
  if (maxCharacters <= 0) return { text: '', included: [], omitted: entries.map(entry => entry.id) };

  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => Number(Boolean(b.entry.required)) - Number(Boolean(a.entry.required))
      || priorityScore(a.entry) - priorityScore(b.entry)
      || a.entry.tier - b.entry.tier
      || (b.entry.relevance || 0) - (a.entry.relevance || 0)
      || a.index - b.index);
  const required = ordered.filter(item => item.entry.required);
  const optional = ordered.filter(item => !item.entry.required);
  const parts: string[] = [];
  const included: ContextBudgetResult['included'] = [];
  const omitted: string[] = [];
  let used = 0;

  // Required entries reserve their smallest representation before optional context is considered.
  for (let index = 0; index < required.length; index += 1) {
    const { entry } = required[index];
    const variants = normalizedRepresentations(entry);
    if (variants.length === 0) continue;
    const laterMinimumLength = required.slice(index + 1).reduce((total, item) => {
      const later = normalizedRepresentations(item.entry);
      return total + (later.at(-1)?.value.length || 0) + SEPARATOR.length;
    }, 0);
    const separatorLength = parts.length > 0 ? SEPARATOR.length : 0;
    const available = Math.max(0, maxCharacters - used - separatorLength - laterMinimumLength);
    const fitting = variants.find(variant => variant.value.length <= available);
    if (fitting) {
      append(parts, fitting.value);
      used += separatorLength + fitting.value.length;
      included.push({ id: entry.id, representation: fitting.representation });
      continue;
    }
    const minimum = variants.at(-1)?.value || '';
    const truncated = safeBoundary(minimum, available);
    if (truncated) {
      append(parts, truncated);
      used += separatorLength + truncated.length;
      included.push({ id: entry.id, representation: 'truncated' });
    } else {
      omitted.push(entry.id);
    }
  }

  for (const { entry } of optional) {
    const separatorLength = parts.length > 0 ? SEPARATOR.length : 0;
    const available = maxCharacters - used - separatorLength;
    const fitting = normalizedRepresentations(entry).find(variant => variant.value.length <= available);
    if (!fitting) {
      omitted.push(entry.id);
      continue;
    }
    append(parts, fitting.value);
    used += separatorLength + fitting.value.length;
    included.push({ id: entry.id, representation: fitting.representation });
  }

  return { text: parts.join(SEPARATOR), included, omitted };
}

export function safeContextExcerpt(text: string, limit: number, fromEnd = false): string {
  const normalized = text.trim();
  if (normalized.length <= limit) return normalized;
  if (!fromEnd) return safeBoundary(normalized, limit);
  const tail = normalized.slice(-limit);
  const firstParagraph = tail.indexOf('\n\n');
  const firstLine = tail.indexOf('\n');
  const boundary = firstParagraph >= 0 ? firstParagraph + 2 : firstLine >= 0 ? firstLine + 1 : 0;
  return `…${tail.slice(boundary).trimStart()}`.slice(-limit);
}
