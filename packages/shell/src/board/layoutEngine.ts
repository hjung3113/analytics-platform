import { readLocalStorage } from '@ap/ui';

/** Which renderer draws a sheet's panes (ADR-0067 decision 15). The stored board is the same for both. */
export type BoardLayoutEngine = 'dock' | 'grid';

/** The one place the default lives. `dock` since ADR-0067 step 2c (the pane head became one strip); `grid` stays the fallback renderer for a release. */
export const BOARD_LAYOUT_ENGINE_DEFAULT: BoardLayoutEngine = 'dock';
export const BOARD_LAYOUT_ENGINE_KEY = 'platform:board-layout-engine';

/** The renderer this browser asked for: `'dock'` or `'grid'` in storage, anything else (or storage that throws) is the default. */
export function readLayoutEngine(): BoardLayoutEngine {
  return readLocalStorage(BOARD_LAYOUT_ENGINE_KEY, value => value === 'dock' || value === 'grid' ? value : BOARD_LAYOUT_ENGINE_DEFAULT, BOARD_LAYOUT_ENGINE_DEFAULT);
}
