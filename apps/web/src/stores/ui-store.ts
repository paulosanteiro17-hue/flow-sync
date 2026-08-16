'use client';

import { create } from 'zustand';
import type { TaskPriority } from '@flowsync/shared';

export interface BoardFilters {
  search: string;
  assigneeIds: string[];
  labelIds: string[];
  priorities: TaskPriority[];
  due: 'any' | 'overdue' | 'today' | 'week' | 'none';
}

export const EMPTY_FILTERS: BoardFilters = {
  search: '',
  assigneeIds: [],
  labelIds: [],
  priorities: [],
  due: 'any',
};

interface UiState {
  commandPaletteOpen: boolean;
  mobileNavOpen: boolean;
  boardFilters: BoardFilters;

  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  setMobileNavOpen: (open: boolean) => void;
  setBoardFilters: (update: Partial<BoardFilters>) => void;
  resetBoardFilters: () => void;
}

/**
 * Ephemeral UI state only.
 *
 * Server data lives in TanStack Query — duplicating it here would create two
 * sources of truth and a second thing for realtime events to keep in sync.
 */
export const useUiStore = create<UiState>((set) => ({
  commandPaletteOpen: false,
  mobileNavOpen: false,
  boardFilters: EMPTY_FILTERS,

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  setBoardFilters: (update) =>
    set((state) => ({ boardFilters: { ...state.boardFilters, ...update } })),
  resetBoardFilters: () => set({ boardFilters: EMPTY_FILTERS }),
}));

export function countActiveFilters(filters: BoardFilters): number {
  return (
    (filters.search ? 1 : 0) +
    filters.assigneeIds.length +
    filters.labelIds.length +
    filters.priorities.length +
    (filters.due !== 'any' ? 1 : 0)
  );
}
