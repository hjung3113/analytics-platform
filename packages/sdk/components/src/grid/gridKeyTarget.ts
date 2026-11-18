/** A cell position in a keyboard grid, as indices into the grid's rows and columns. */
export type GridPosition = { row: number; column: number };

/** The modifier-carrying key event fields the grid reads. */
export type GridKey = { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean };

/**
 * The one cell-to-cell keyboard map of the SDK's data grids (PlatformDataTable cell selection and TreeMatrix, #2549), after the
 * WAI-ARIA grid pattern: arrows move one cell, Home/End go to the row's first/last cell, Ctrl+Home/End to the grid's first/last
 * cell, PageUp/PageDown move `pageRows` rows. Targets clamp to the grid. Returns `null` for a key the grid does not move on
 * (callers handle Enter, expansion and the rest themselves) and `'stay'` when the key is a grid key whose target is the current
 * cell (callers still prevent the default scroll).
 */
export function gridKeyTarget(event: GridKey, at: GridPosition, bounds: { rows: number; columns: number }, pageRows: number): GridPosition | 'stay' | null {
  if (event.altKey || event.shiftKey || event.metaKey) return null;
  const lastRow = bounds.rows - 1;
  const lastColumn = bounds.columns - 1;
  if (lastRow < 0 || lastColumn < 0) return null;
  const ctrl = event.ctrlKey === true;
  let target: GridPosition;
  switch (event.key) {
    case 'Home': target = { row: ctrl ? 0 : at.row, column: 0 }; break;
    case 'End': target = { row: ctrl ? lastRow : at.row, column: lastColumn }; break;
    default:
      if (ctrl) return null;
      switch (event.key) {
        case 'ArrowLeft': target = { row: at.row, column: at.column - 1 }; break;
        case 'ArrowRight': target = { row: at.row, column: at.column + 1 }; break;
        case 'ArrowUp': target = { row: at.row - 1, column: at.column }; break;
        case 'ArrowDown': target = { row: at.row + 1, column: at.column }; break;
        case 'PageUp': target = { row: at.row - Math.max(1, pageRows), column: at.column }; break;
        case 'PageDown': target = { row: at.row + Math.max(1, pageRows), column: at.column }; break;
        default: return null;
      }
  }
  const clamped = { row: Math.max(0, Math.min(lastRow, target.row)), column: Math.max(0, Math.min(lastColumn, target.column)) };
  return clamped.row === at.row && clamped.column === at.column ? 'stay' : clamped;
}
