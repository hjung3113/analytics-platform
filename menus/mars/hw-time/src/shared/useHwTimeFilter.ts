import { useMemo } from 'react';
import { invalidValueSentence, useI18n, usePlatform } from '@ap/kernel';
import { HW_TIME_MODULE_TYPES, type HwTimeModuleType } from '../endpoints';
import { HW_TIME_MESSAGES } from '../messages';

/**
 * Filter-panel page keys, shared by all linked HW Time panels (#2328, #2329).
 * Names, repetition and hiding follow the page condition layer grammar (#2336 §2.3, advisor decision 8), so the move to the layer
 * declaration (S5, #2341) keeps URLs and saved views unchanged: `module` / `motion` hold the **selected** values, one pair per value;
 * an absent key means every value; `~none` alone means an explicit empty selection.
 */
export const HW_TIME_FILTER_KEYS = { moduleType: 'moduleType', module: 'module', motion: 'motion', split: 'split' } as const;
export const HW_TIME_FILTER_REPEATED_KEYS = [HW_TIME_FILTER_KEYS.module, HW_TIME_FILTER_KEYS.motion] as const;
/** Long check lists stay out of the address bar from the start (#2336 decision 5); share links and saved views still carry them. */
export const HW_TIME_FILTER_HIDDEN_KEYS = HW_TIME_FILTER_REPEATED_KEYS;
/** The reserved empty-selection token of the layer grammar (#2336 §2.3). A real value never starts with `~`. */
export const HW_TIME_FILTER_NONE = '~none';
/** The Recipe/PPID split is reserved (owner 2026-11-16): only `none` exists until the server serves per-Recipe/PPID statistics. */
export const HW_TIME_SPLITS = ['none'] as const;
export type HwTimeSplit = typeof HW_TIME_SPLITS[number];

/** `<typeId>/<motion>`: a Motion name repeats across types (`PM/Pump`, `LK/Pump`), so the value is unique in the category (#2336 §2.2). */
export const motionKey = (typeId: string, motion: string) => `${typeId}/${motion}`;
const MODULE_IDS: readonly string[] = HW_TIME_MODULE_TYPES.flatMap(type => [...type.modules]);
const MOTION_KEYS: readonly string[] = HW_TIME_MODULE_TYPES.flatMap(type => type.motions.map(motion => motionKey(type.id, motion)));
const TYPE_IDS: readonly string[] = HW_TIME_MODULE_TYPES.map(type => type.id);

export type HwTimeFilterList = 'module' | 'motion';
export type HwTimeFilter = {
  /** Legacy single-type table projection; charts use selectionFor so step 1 includes every type. */
  moduleType: HwTimeModuleType;
  selectionFor: (typeId: string) => { modules: readonly string[]; motions: readonly string[] };
  /** One atomic write for a hierarchy branch; keeps other types and unusable values. */
  setTypeChecked: (typeId: string, checks: { modules?: readonly string[]; motions?: readonly string[] }) => void;
  /** Checked Modules and Motions of the active type, in catalog order. */
  modules: readonly string[];
  motions: readonly string[];
  /** Nothing to show for the active type (no Module or no Motion checked): the panels show `선택한 항목 없음`, never a widened result. */
  empty: boolean;
  split: HwTimeSplit;
  /** Well-formed values that are in no catalog list: kept in the URL (the server judges them) and listed as `이 화면에서 쓸 수 없는 값`. */
  unusable: readonly string[];
  /** One sentence per malformed filter key (06 §6: rejected, never repaired); `null` when all are well-formed. While set, send no query. */
  invalid: string[] | null;
  /** Clears exactly the malformed keys in one `setPage`. */
  recover: () => void;
  /** Switching the first drill level clears deeper drill keys and the picked row/trend. */
  setModuleType: (typeId: string) => void;
  toggleModule: (moduleId: string) => void;
  toggleMotion: (motion: string) => void;
  /** Sets the checked values of one list for the active type (Motions by name), keeping the other types' selection; for group check-all/none. */
  setChecked: (list: HwTimeFilterList, values: readonly string[]) => void;
};

type Parsed = { all: boolean; selected: readonly string[]; malformed: string | null };
/** Layer grammar (#2336 §2.3): absent = all; `~none` alone = empty; `~none` mixed with values, another `~` token or an empty value is malformed. */
function parseSelection(raw: readonly string[]): Parsed {
  if (raw.length === 0) return { all: true, selected: [], malformed: null };
  if (raw.length === 1 && raw[0] === HW_TIME_FILTER_NONE) return { all: false, selected: [], malformed: null };
  const malformed = raw.find(value => value === '' || value.startsWith('~')) ?? (new Set(raw).size !== raw.length ? raw.find((v, i) => raw.indexOf(v) !== i)! : null);
  return { all: false, selected: raw, malformed: malformed ?? null };
}

/** Writes a selection back: every catalog value and nothing else = absent key; nothing = `~none`; otherwise catalog order, then kept unusable values. */
function encodeSelection(catalog: readonly string[], selected: ReadonlySet<string>): string[] | null {
  const known = catalog.filter(value => selected.has(value));
  const kept = [...selected].filter(value => !catalog.includes(value));
  if (kept.length === 0 && known.length === catalog.length) return null;
  if (known.length === 0 && kept.length === 0) return [HW_TIME_FILTER_NONE];
  return [...known, ...kept];
}

/**
 * The filter state of the HW Time screen, read from page keys. Checks apply at once as a view projection over the data already
 * received (no refetch, #2336 decision 6), each written with `replace`. The SDK's `usePageKeyRules` reads only the first value of a key,
 * so the repeated keys are checked here.
 */
export function useHwTimeFilter(): HwTimeFilter {
  const { pageParam, pageParams, setPage } = usePlatform();
  const { lang } = useI18n();
  const rawType = pageParam(HW_TIME_FILTER_KEYS.moduleType);
  const rawSplit = pageParam(HW_TIME_FILTER_KEYS.split);
  const rawModule = pageParams(HW_TIME_FILTER_KEYS.module);
  const rawMotion = pageParams(HW_TIME_FILTER_KEYS.motion);

  const parsed = useMemo(() => ({ module: parseSelection(rawModule), motion: parseSelection(rawMotion) }), [rawModule, rawMotion]);
  const bad = useMemo(() => {
    const out: { key: string; raw: string; label: { ko: string; en: string } }[] = [];
    if (rawType !== null && !TYPE_IDS.includes(rawType)) out.push({ key: HW_TIME_FILTER_KEYS.moduleType, raw: rawType, label: HW_TIME_MESSAGES.filterModuleType });
    if (rawSplit !== null && !(HW_TIME_SPLITS as readonly string[]).includes(rawSplit)) out.push({ key: HW_TIME_FILTER_KEYS.split, raw: rawSplit, label: HW_TIME_MESSAGES.filterSplit });
    if (parsed.module.malformed !== null) out.push({ key: HW_TIME_FILTER_KEYS.module, raw: parsed.module.malformed, label: HW_TIME_MESSAGES.filterModule });
    if (parsed.motion.malformed !== null) out.push({ key: HW_TIME_FILTER_KEYS.motion, raw: parsed.motion.malformed, label: HW_TIME_MESSAGES.filterMotion });
    return out;
  }, [rawType, rawSplit, parsed]);

  const typeOk = !bad.some(b => b.key === HW_TIME_FILTER_KEYS.moduleType);
  const moduleType = HW_TIME_MODULE_TYPES.find(type => typeOk && type.id === rawType) ?? HW_TIME_MODULE_TYPES[0];
  const moduleSet = new Set(parsed.module.all ? MODULE_IDS : parsed.module.selected);
  const motionSet = new Set(parsed.motion.all ? MOTION_KEYS : parsed.motion.selected);
  const selectionFor = (typeId: string) => {
    const type = HW_TIME_MODULE_TYPES.find(type => type.id === typeId)!;
    return { modules: type.modules.filter(id => moduleSet.has(id)), motions: type.motions.filter(motion => motionSet.has(motionKey(type.id, motion))) };
  };
  const { modules, motions } = selectionFor(moduleType.id);
  const unusable = [...parsed.module.selected.filter(v => !MODULE_IDS.includes(v)), ...parsed.motion.selected.filter(v => !MOTION_KEYS.includes(v))];

  const write = (list: HwTimeFilterList, next: Set<string>) => {
    const key = HW_TIME_FILTER_KEYS[list];
    setPage({ [key]: encodeSelection(list === 'module' ? MODULE_IDS : MOTION_KEYS, next) }, { replace: true });
  };
  const toggle = (list: HwTimeFilterList, current: ReadonlySet<string>, value: string) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value); else next.add(value);
    write(list, next);
  };

  return {
    moduleType, modules, motions, selectionFor,
    empty: (rawType ? [moduleType] : HW_TIME_MODULE_TYPES).every(type => {
      const checks = selectionFor(type.id);
      return checks.modules.length === 0 || checks.motions.length === 0;
    }), split: 'none', unusable,
    invalid: bad.length > 0 ? bad.map(b => invalidValueSentence(lang, 'value', b.label, b.raw)) : null,
    recover: () => setPage(Object.fromEntries(bad.map(b => [b.key, null]))),
    setModuleType: typeId => {
      if (!TYPE_IDS.includes(typeId) || typeId === rawType) return;
      setPage({ [HW_TIME_FILTER_KEYS.moduleType]: typeId, row: null, focus: null, trend: null, drillModule: null, drillMotion: null });
    },
    setTypeChecked: (typeId, checks) => {
      const type = HW_TIME_MODULE_TYPES.find(type => type.id === typeId);
      if (!type) return;
      const change: Record<string, string[] | null> = {};
      if (checks.modules) {
        const next = new Set([...moduleSet].filter(id => !(type.modules as readonly string[]).includes(id)));
        for (const id of checks.modules) if ((type.modules as readonly string[]).includes(id)) next.add(id);
        change.module = encodeSelection(MODULE_IDS, next);
      }
      if (checks.motions) {
        const next = new Set([...motionSet].filter(id => !type.motions.some(motion => motionKey(typeId, motion) === id)));
        for (const motion of checks.motions) if ((type.motions as readonly string[]).includes(motion)) next.add(motionKey(typeId, motion));
        change.motion = encodeSelection(MOTION_KEYS, next);
      }
      setPage(change, { replace: true });
    },
    toggleModule: id => toggle('module', moduleSet, id),
    toggleMotion: motion => toggle('motion', motionSet, motionKey(moduleType.id, motion)),
    setChecked: (list, values) => {
      const current = list === 'module' ? moduleSet : motionSet;
      const own: readonly string[] = list === 'module' ? moduleType.modules : moduleType.motions.map(motion => motionKey(moduleType.id, motion));
      const wanted = new Set(list === 'module' ? values : values.map(motion => motionKey(moduleType.id, motion)));
      const next = new Set([...current].filter(value => !own.includes(value)));
      for (const value of own) if (wanted.has(value)) next.add(value);
      write(list, next);
    },
  };
}
