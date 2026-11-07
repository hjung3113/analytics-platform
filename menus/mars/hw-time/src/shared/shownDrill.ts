import type { HwTimeDrill } from '../endpoints';

/**
 * The Module/Motion the displayed level result was loaded with (#1365): while a kept result is shown, titles, summaries and drill actions
 * must follow this, not the current drill, or the old rows get the new path's meaning. `previous` is true while the two differ.
 */
export function shownDrill(query: { resultParams?: HwTimeDrill; showingPrevious?: boolean }, current: HwTimeDrill): { module: string | null; motion: string | null; previous: boolean } {
  const shown = query.resultParams ?? current;
  return { module: shown.drillModule ?? null, motion: shown.drillMotion ?? null, previous: query.showingPrevious === true };
}
