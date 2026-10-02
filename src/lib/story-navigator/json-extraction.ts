export function extractJsonObject(raw: string): unknown {
  const text = raw.trim();
  if (!text) throw new Error('AI response is empty');
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match => match[1].trim());
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  const candidates = [text, ...fenced, ...(start >= 0 && end > start ? [text.slice(start, end + 1)] : [])];
  for (const candidate of [...new Set(candidates)]) { try { return JSON.parse(candidate); } catch { /* next */ } }
  throw new Error('AI response is not valid JSON');
}
