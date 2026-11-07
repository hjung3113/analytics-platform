// The stage flow of a development project (design §3, #1444 c). Pure. The service (`projectSetStage`, `projectReopen`)
// and the DB guard trigger `log_lifecycle.project_guard` (migration of #1444 c) use the same table: `LEGAL_STAGE_PAIRS`
// is the union of both actions and its SQL twin sits between the `LEGAL_STAGE_PAIRS begin/end` comments of the
// migration; `stage-transitions.test.ts` pins them together. Only the Gate (node e) may move `beta -> completed`,
// which the trigger cannot know: `canSetStage` refuses it with `gate_required`.

export const STAGES = ['registered', 'kickoff', 'alpha', 'beta', 'completed', 'cancelled'] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES = ['registered', 'kickoff', 'alpha', 'beta'] as const satisfies readonly Stage[];
export type OpenStage = (typeof OPEN_STAGES)[number];

export const isOpenStage = (stage: string): stage is OpenStage => (OPEN_STAGES as readonly string[]).includes(stage);
export const isStage = (value: unknown): value is Stage => typeof value === 'string' && (STAGES as readonly string[]).includes(value);

/** Every move the guard trigger accepts, `from -> allowed tos` (SQL order). */
export const LEGAL_STAGE_PAIRS: Readonly<Record<Stage, readonly Stage[]>> = {
  registered: ['kickoff', 'cancelled'],
  kickoff: ['alpha', 'cancelled'],
  alpha: ['beta', 'cancelled'],
  beta: ['completed', 'cancelled'],
  cancelled: ['registered', 'kickoff', 'alpha', 'beta'],
  completed: ['beta'],
};

const FORWARD: Readonly<Partial<Record<Stage, Stage>>> = { registered: 'kickoff', kickoff: 'alpha', alpha: 'beta' };

export type SetStageVerdict = 'ok' | 'gate_required' | 'illegal_transition';

/** `projectSetStage`: one step forward among `registered -> kickoff -> alpha -> beta`, or `cancelled` from an open stage. `completed` needs the Gate. */
export function canSetStage(from: string, to: string): SetStageVerdict {
  if (to === 'completed') return 'gate_required';
  if (!isStage(from) || !isStage(to)) return 'illegal_transition';
  if (to === 'cancelled') return isOpenStage(from) ? 'ok' : 'illegal_transition';
  return FORWARD[from] === to ? 'ok' : 'illegal_transition';
}

/** `projectReopen`: `cancelled -> the stage before the cancel`, `completed -> beta`; null = not reopenable. */
export function reopenTarget(from: string, stageBeforeCancel: string | null): OpenStage | null {
  if (from === 'completed') return 'beta';
  if (from === 'cancelled' && stageBeforeCancel !== null && isOpenStage(stageBeforeCancel)) return stageBeforeCancel;
  return null;
}
