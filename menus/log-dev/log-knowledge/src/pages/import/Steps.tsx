/** PROTOTYPE (#1195): the body of one step, shared by the three variants. */
import { useState } from 'react';
import { type PlanState, type ResultState, type StepNo } from './fixture';
import { FileStep, MapStep, ResolveStep, ResultStep, ValidateStep, useResolutions } from './shared';

export type Forced = { state: string | null };

export function useStepState(forced: string | null) {
  const { resolutions, set } = useResolutions();
  const [filter, setFilter] = useState<PlanState | 'all'>(forced === 'errors' ? 'error' : 'all');
  const [selected, setSelected] = useState(14);
  const scenario: ResultState = forced === 'partial' ? 'partial_failure' : forced === 'applying' ? 'applying' : 'completed';
  return { resolutions, set, filter, setFilter, selected, setSelected, scenario, duplicate: forced === 'dup' };
}
export type StepState = ReturnType<typeof useStepState>;

export function StepBody({ step, s, onNext, max }: { step: StepNo; s: StepState; onNext?: () => void; max?: number }) {
  if (step === 1) return <FileStep onNext={onNext} />;
  if (step === 2) return <MapStep duplicate={s.duplicate} />;
  if (step === 3) return <ValidateStep filter={s.filter} onFilter={s.setFilter} max={max} />;
  if (step === 4) return <ResolveStep resolutions={s.resolutions} set={s.set} selected={s.selected} onSelect={s.setSelected} />;
  return <ResultStep resolutions={s.resolutions} scenario={s.scenario} max={max} />;
}

export function statusForStep(step: StepNo, scenario: ResultState) {
  return step === 1 ? 'uploaded' as const : step === 2 ? 'mapped' as const : step < 5 ? 'review_required' as const : scenario === 'partial_failure' ? 'partial_failure' as const : scenario === 'applying' ? 'applying' as const : 'completed' as const;
}
