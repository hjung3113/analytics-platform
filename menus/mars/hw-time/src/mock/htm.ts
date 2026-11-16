/** Synthetic HTM judging of the mock server (#1794, #2328, #2329). The screen never judges; this file plays the server's part. */
import { HW_TIME_MODULE_TYPES, type HtmJudgement, type HtmStatus } from '../endpoints';

/** The one Module type the mock judges, as a demo of the future Recipe-split state (advisor decision). Every other type is not judgeable yet. */
export const HTM_JUDGED_TYPE = 'LK';

const motionIndex = (typeId: string, motion: string) => {
  const type = HW_TIME_MODULE_TYPES.find(t => t.id === typeId);
  return type ? (type.motions as readonly string[]).indexOf(motion) : -1;
};

/** Synthetic bounds (seconds) of a judged type's Motion: a window around 2.4–4.0 s that varies by Motion; `null` for an unjudged type. */
export function htmBounds(typeId: string, motion: string): { lower: number; upper: number } | null {
  const index = motionIndex(typeId, motion);
  if (typeId !== HTM_JUDGED_TYPE || index < 0) return null;
  const lower = 2.4 + index * 0.35;
  return { lower, upper: lower + 1.6 };
}

/** The server judgement of one Motion average. */
export function judge(typeId: string, motion: string, value: number | null): HtmJudgement {
  const bounds = htmBounds(typeId, motion);
  if (!bounds) return { value, lower: null, upper: null, status: 'unjudgeable', reason: 'recipe-unsplit' };
  const status: HtmStatus = value === null ? 'unjudgeable' : value > bounds.upper ? 'over' : value < bounds.lower ? 'under' : 'normal';
  return { value, ...bounds, status, ...(status === 'unjudgeable' ? { reason: 'no-criteria' as const } : {}) };
}

const RANK: Record<HtmStatus, number> = { over: 3, under: 2, normal: 1, unjudgeable: 0 };

/** A Module's status: the worst of its Motions (over > under > normal); unjudgeable only when no Motion was judged. */
export function rollUp(value: number | null, motions: readonly HtmJudgement[]): HtmJudgement {
  const worst = motions.reduce<HtmJudgement | null>((w, j) => (w === null || RANK[j.status] > RANK[w.status] ? j : w), null);
  if (!worst || worst.status === 'unjudgeable') return { value, lower: null, upper: null, status: 'unjudgeable', reason: worst?.reason ?? 'recipe-unsplit' };
  return { value, lower: null, upper: null, status: worst.status };
}
