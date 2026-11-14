/**
 * Shared Job-axis predicate for the applied Global Context (#2072). The mock-server engine filters equipment
 * (Scope/room/Condition/Selection); the Job axis (lot/ppid/recipe) is each handler's duty. `lot` applies only
 * where the menu declares it (cycle-time), never on productivity (`lot: 'unsupported'`).
 */
import type { GlobalContext } from '@ap/contracts';
import { jobsInPeriod, type Equipment, type Job } from '@ap/mock-server';

/** Context fields that can narrow the Job population. */
export type JobContext = Pick<GlobalContext, 'lotIds' | 'recipeIds' | 'ppid'>;
/** `true` when the job passes the applied filters; `lot` is only checked where the menu applies it. */
function jobMatches(global: JobContext, job: Job, lot: boolean): boolean {
  if (lot && global.lotIds !== null && !global.lotIds.includes(job.lotId)) return false;
  if (global.recipeIds !== null && !global.recipeIds.includes(job.recipe)) return false;
  if (global.ppid !== null && job.ppid !== global.ppid) return false;
  return true;
}

/** Completed jobs in `[from, to)` narrowed by the applied Context (`lot` only where the menu applies it). */
export function jobsFor(equipment: Equipment[], from: string, to: string, global: JobContext, lot: boolean): Job[] {
  return jobsInPeriod(equipment, from, to).filter(job => jobMatches(global, job, lot));
}
