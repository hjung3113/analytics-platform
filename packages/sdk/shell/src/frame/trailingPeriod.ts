import { periodHours, type GlobalContext } from '@ap/contracts';

/** A preset reads as pressed when the period ends at the default range end and spans exactly `hours`. */
export function isTrailingPeriod(g: Pick<GlobalContext, 'from' | 'to'>, defaultRangeTo: string, hours: number): boolean {
  return g.to === defaultRangeTo && periodHours(g) === hours;
}
