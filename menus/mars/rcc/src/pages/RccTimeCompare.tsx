import { CUSTOM_GROUP_AXIS } from '@ap/contracts';
import {
  DrillLayout, FacetedSetDialog, PageKeyWarning, PlatformPage, SegmentedRadio, usePageKeyRules,
  type FacetedSetValue,
} from '@ap/components';
import { useDrill, useEquipmentFacts, useI18n, useMessages, usePlatform, useQueryContext } from '@ap/kernel';
import { Button, EmptyState, SkeletonRows } from '@ap/ui';
import { useMemo, useRef, useState } from 'react';
import { RCC_MESSAGES as M } from '../messages';
import { RCC_DRILL, RCC_FACET_KEYS } from '../pageKeys';
import {
  FACET_OPTIONS, FACET_RESULTS, MODES, MODE_FACETS, comparisonUnits, type ComparisonMode,
} from '../prototype/comparisonUnits';
import {
  DAYS, STRUCTURES, STRUCTURE_TYPES, daysInPeriod, equipmentForTarget,
} from '../prototype/timeCompareFixture';
import { RccDrillPanels } from './RccDrillPanels';

const MODE_LABELS = { ppid: M.ppidMode, recipe: M.recipeMode, combined: M.combinedMode };
const RESET_DRILL = Object.fromEntries([...RCC_DRILL.levels.map(level => level.key), ...RCC_DRILL.resetKeys].map(key => [key, null]));

export default function RccTimeCompare() {
  const m = useMessages(M);
  const { revision } = usePlatform();
  const context = useQueryContext();
  return <PlatformPage title={m('title')} layout="fill">
    <RccComparison key={JSON.stringify([revision, context.scopeId])} />
  </PlatformPage>;
}

function RccComparison() {
  const m = useMessages(M);
  const { tx } = useI18n();
  const { pageParam, pageParams, setPage, scope } = usePlatform();
  const context = useQueryContext();
  const { from, to, scopeId, condition, membershipBasis } = context;
  const facts = useEquipmentFacts(scopeId ?? '');
  const drill = useDrill();
  const [filterOpen, setFilterOpen] = useState(false);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const { equipment: targets, targetCount } = useMemo(() => equipmentForTarget(facts.data?.items ?? [], context), [facts.data, context]);
  const days = useMemo(() => daysInPeriod(from, to), [from, to]);

  const mode = MODES.find(value => value === pageParam('mode')) ?? 'combined';
  const facets = MODE_FACETS[mode].map(id => ({ id, label: m(id), values: FACET_OPTIONS[id] }));
  const rule: FacetedSetValue['rule'] = Object.fromEntries(facets.flatMap(({ id }) => {
    const picks = pageParams(RCC_FACET_KEYS[id]);
    return picks.length ? [[id, picks]] : [];
  }));
  const units = comparisonUnits(mode, rule);
  const unit = drill.depth === 0 ? units[0] : units.find(item => item.id === pageParam('unit'));
  const usage = unit?.usages.find(item => item.id === pageParam('layer'));

  const counts = { A: targets.filter(item => item.structure === 'A').length, B: targets.filter(item => item.structure === 'B').length };
  const defaultStructure = counts.A >= counts.B ? 'A' : 'B';
  const structure = STRUCTURE_TYPES.find(value => value === pageParam('structure')) ?? defaultStructure;
  const eligible = targets.filter(item => item.structure === structure);
  const baseline = pageParam('baseline');
  const equipment = pageParam('equipment');
  const step = STRUCTURES[structure].find(item => item.id === pageParam('step'));
  const keys = usePageKeyRules([
    { key: 'mode', label: M.mode, valid: raw => MODES.some(value => value === raw) },
    ...MODE_FACETS.combined.map(id => ({ key: RCC_FACET_KEYS[id], label: M[id], repeated: true, valid: (raw: string) => FACET_OPTIONS[id]?.includes(raw) === true })),
    { key: 'unit', label: M.cohort, valid: raw => units.some(item => item.id === raw) },
    { key: 'layer', label: M.layer, valid: raw => drill.invalid !== null || unit?.usages.some(item => item.id === raw) === true },
    { key: 'step', label: M.step, valid: raw => drill.invalid !== null || step?.id === raw },
    { key: 'structure', label: M.structure, valid: raw => STRUCTURE_TYPES.some(value => value === raw && counts[value] > 0) },
    { key: 'baseline', label: M.baseline, valid: raw => eligible.some(item => item.id === raw) },
    { key: 'equipment', label: M.equipment, valid: raw => (drill.depth ? eligible : targets).some(item => item.id === raw) },
  ]);
  const changeMode = (value: ComparisonMode) => {
    setFilterOpen(false);
    setPage({ ...RESET_DRILL, mode: value });
  };
  const changeFacets = (value: FacetedSetValue) => {
    const patch = Object.fromEntries(facets.map(({ id }) => [RCC_FACET_KEYS[id], value.rule[id] ?? null]));
    setPage({ ...RESET_DRILL, ...patch });
  };

  if (scope.status === 'validating' || facts.status === 'loading') {
    return <div role="status" aria-label={m('targetLoading')}><SkeletonRows count={5} size="regular" /></div>;
  }
  if (facts.status === 'error') {
    return <EmptyState title={m('targetError')} action={<Button variant="secondary" size="toolbar" onClick={facts.retry}>{m('retry')}</Button>} />;
  }
  if (keys.invalid) return <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} />;

  const facetCount = Object.keys(rule).length;
  const controls = <div className="flex flex-wrap items-center gap-2">
    <SegmentedRadio label={m('mode')} value={mode} onChange={changeMode}
      options={MODES.map(value => ({ value, label: tx(MODE_LABELS[value]) }))} />
    <Button ref={filterTrigger} variant="secondary" size="toolbar" onClick={() => setFilterOpen(true)} aria-haspopup="dialog" aria-expanded={filterOpen}>
      {facetCount ? m('filterCount', { count: facetCount }) : m('filters')}
    </Button>
    {filterOpen && <FacetedSetDialog key={JSON.stringify([mode, rule])} title={m('filters')} facets={facets} {...FACET_RESULTS[mode]}
      open onOpenChange={open => {
        setFilterOpen(open);
        if (!open) requestAnimationFrame(() => filterTrigger.current?.focus());
      }} value={{ rule, fixed: null }} onApply={changeFacets} allowFixed={false}
      applyMode="direct" itemKindLabel={m(mode === 'ppid' ? 'ppid' : 'cohort')}
      formatCount={count => m(mode === 'ppid' ? 'ppidCount' : 'usageCount', { count })} />}
  </div>;

  let body;
  const unsupported = membershipBasis === 'asOf' || Boolean(condition?.[CUSTOM_GROUP_AXIS]?.length);
  if (unsupported) body = <EmptyState title={m('targetEmpty')} body={m('targetUnsupported')} />;
  else if (!targets.length) body = <EmptyState title={m('targetEmpty')} body={m('targetCoverage')} />;
  else if (!days.length) body = <EmptyState title={m('periodEmpty')} body={m('periodCoverage', { start: DAYS[0]!, end: DAYS.at(-1)! })} />;
  else if (!unit) body = <EmptyState title={m('cohortEmpty')} />;
  else body = <RccDrillPanels {...{ units, unit, usage, step, targets, days, structure, counts, baseline, equipment }}
    depth={drill.depth} resetDrill={RESET_DRILL} targetCount={targetCount} />;

  return <div className="flex min-w-0 flex-1 flex-col gap-2 break-keep">
    {controls}
    <DrillLayout fill>{body}</DrillLayout>
  </div>;
}
