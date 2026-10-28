import { periodHours, type GlobalContext } from '@ap/contracts';

/** With no server anchor (`null`) nothing is trailing. A preset reads as pressed when the period ends at the default range end and spans exactly `hours`. */
export function isTrailingPeriod(g: Pick<GlobalContext, 'from' | 'to'>, defaultRangeTo: string | null, hours: number): boolean {
  return defaultRangeTo !== null && g.to === defaultRangeTo && periodHours(g) === hours;
}
