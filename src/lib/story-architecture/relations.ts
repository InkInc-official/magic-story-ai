import type { StoryArchitectureBeatRelation, StoryArchitectureRelationType } from './types';

export const STORY_ARCHITECTURE_ACYCLIC_RELATIONS: readonly StoryArchitectureRelationType[] = ['precedes', 'depends_on'];

export function relationHasCycle(relations: readonly StoryArchitectureBeatRelation[], type: StoryArchitectureRelationType): boolean {
  if (!STORY_ARCHITECTURE_ACYCLIC_RELATIONS.includes(type)) return false;
  const adjacency = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.type !== type) continue;
    const targets = adjacency.get(relation.fromBeatId);
    if (targets) targets.push(relation.toBeatId);
    else adjacency.set(relation.fromBeatId, [relation.toBeatId]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const target of adjacency.get(id) || []) if (visit(target)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...adjacency.keys()].some(visit);
}
