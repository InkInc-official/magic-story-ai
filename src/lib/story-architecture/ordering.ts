import type { StoryArchitectureBeat } from './types';

function orderedFirst<T>(values: readonly T[], readOrder: (value: T) => number | null): T[] {
  return values.map((value, index) => ({ value, index, order: readOrder(value) }))
    .sort((left, right) => {
      if (left.order == null && right.order == null) return left.index - right.index;
      if (left.order == null) return 1;
      if (right.order == null) return -1;
      return left.order - right.order || left.index - right.index;
    })
    .map(value => value.value);
}

export function sortByStoryOrder(beats: readonly StoryArchitectureBeat[]): StoryArchitectureBeat[] {
  return orderedFirst(beats, beat => beat.storyOrder);
}

export function sortByPresentationOrder(beats: readonly StoryArchitectureBeat[]): StoryArchitectureBeat[] {
  return orderedFirst(beats, beat => beat.presentationOrder);
}

export function withStoryOrder(beat: StoryArchitectureBeat, storyOrder: number | null): StoryArchitectureBeat {
  return { ...beat, storyOrder };
}

export function withPresentationOrder(beat: StoryArchitectureBeat, presentationOrder: number | null): StoryArchitectureBeat {
  return { ...beat, presentationOrder };
}

/** Reorders a complete list and assigns dense integer positions 0..n-1. */
export function reorderIntegerPositions<T extends { id: string; order: number }>(values: readonly T[], orderedIds: readonly string[]): T[] {
  if (values.length !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length) throw new Error('並び替えIDは全項目を重複なく含める必要があります。');
  const byId = new Map(values.map(value => [value.id, value]));
  return orderedIds.map((id, order) => {
    const value = byId.get(id);
    if (!value) throw new Error('並び替えIDに未知の項目が含まれています。');
    return { ...value, order };
  });
}
