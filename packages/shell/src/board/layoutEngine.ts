/** Which renderer draws a sheet's panes (ADR-0067 decision 15). The stored board is the same for both. */
export type BoardLayoutEngine = 'dock' | 'grid';

/** The one place the default lives. It flips to `dock` only after the owner confirms the dock board from before/after captures. */
export const BOARD_LAYOUT_ENGINE_DEFAULT: BoardLayoutEngine = 'grid';
export const BOARD_LAYOUT_ENGINE_KEY = 'platform:board-layout-engine';

/** The renderer this browser asked for: `'dock'` or `'grid'` in storage, anything else (or storage that throws) is the default. */
export function readLayoutEngine(): BoardLayoutEngine {
  try {
    const value = localStorage.getItem(BOARD_LAYOUT_ENGINE_KEY);
    return value === 'dock' || value === 'grid' ? value : BOARD_LAYOUT_ENGINE_DEFAULT;
  } catch { return BOARD_LAYOUT_ENGINE_DEFAULT; }
}
