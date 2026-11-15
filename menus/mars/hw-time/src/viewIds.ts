/** The four View ids and labels, apart from `views.ts` so the start-up manifest (`index.ts`) does not pull the table code and the
 * `@ap/components` barrel into the app's first chunk (`check:lazy-chunks`). */
import { HW_TIME_MESSAGES } from './messages';

export const HW_TIME_VIEWS = [
  { id: 'overview', label: HW_TIME_MESSAGES.viewOverview },
  { id: 'steps', label: HW_TIME_MESSAGES.viewSteps },
  { id: 'compare', label: HW_TIME_MESSAGES.viewCompare },
  { id: 'table', label: HW_TIME_MESSAGES.viewTable },
] as const;
export type HwTimeView = typeof HW_TIME_VIEWS[number]['id'];
export const isHwTimeView = (raw: string): raw is HwTimeView => HW_TIME_VIEWS.some(view => view.id === raw);
