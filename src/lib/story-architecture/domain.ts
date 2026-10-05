import type { StoryArchitectureDesignStatus, StoryArchitectureItemBase } from './types';

/** Changes only design workflow state. It never changes provenance or external data. */
export function withDesignStatus<T extends StoryArchitectureItemBase>(item: T, status: StoryArchitectureDesignStatus): T {
  return { ...item, status };
}
