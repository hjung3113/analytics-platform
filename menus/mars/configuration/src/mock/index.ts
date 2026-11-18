/** Deterministic synthetic CFG fixture, promoted from the approved A′ prototype. */
import { defineMockEndpoint, MockRequestError, type AnyMockEndpoint } from '@ap/mock-server';
import { filterRows, validateFilters, type ColumnFilter } from '@ap/contracts';
import { configurationTreeEndpoint, configurationTreeNavigationEndpoint, configurationDetailEndpoint, configurationExportEndpoint, DEFAULT_EQUIPMENT, EQUIPMENT, ROW_COUNT, TREE_WINDOW, EXPORT_LIMIT, STATUS, isRowId, validEquipment, validLevels, filterSpecs, type CompareParams, type ConfigRow, type ConfigValue, type StatusCounts, type TreeParams, type TreePage, type TreeRow, type TreeNavigationParams, type TreeNavigation } from '../endpoints';
const SEED = 2434;
const ITEMS_PER_CATEGORY = 1000;
const CATEGORIES_PER_MODULE = 15;
const ANOMALY_PERIOD = 1000;
const MODULES = ['PM1', 'PM2', 'PM3', 'TM', 'LL-A', 'LL-B'];
const CATEGORIES = ['Gas Line', 'Heater', 'Vacuum', 'Cooling', 'Transfer', 'Purge', 'Sensor', 'Pressure', 'Valve', 'Flow', 'Interlock', 'Timing', 'Power', 'Chamber', 'Utility'];
const idOf = (index: number) => `cfg-${String(index).padStart(6, '0')}`;
const seeded = (index: number) => {
  const mixed = Math.imul(index + SEED, 1664525) + 1013904223;
  return (mixed ^ (mixed >>> 16)) >>> 0;
};
const ANOMALY_WINDOW = 32;
const EQUAL_SLOTS = new Set([1, 4]);
const MISSING_SLOTS = new Set([5, 10, 20, 24, 25, 29]);
const VIOLATION_SLOTS = new Set([2, 8, 15, 18, 26]);
const RARE_GLOBAL_VIOLATION_PERIOD = 20;
const PARAMETERS = [
  { name: 'Pressure Setpoint', file: 'config.cfg', base: 120, delta: 5, min: 100, max: 130 },
  { name: 'Valve Mode', file: 'control.cfg', base: 'AUTO', alternate: 'MANUAL' },
  { name: 'Temp Limit', file: 'thermal.cfg', base: 85, delta: 5, min: 70, max: 88 },
  { name: 'Flow Rate', file: 'config.cfg', base: 250, delta: -3, min: 240, max: 260 },
  { name: 'RF State', file: 'recipe.cfg', base: 'ON', alternate: 'OFF' },
  { name: 'Vacuum Threshold', file: 'chamber.cfg', base: 3.1, delta: 0.2, min: 2, max: 4 },
  { name: 'PM Pressure Limit', file: 'limit.cfg', base: 5, delta: 0.2, min: 4, max: 6 },
  { name: 'Valve Position', file: 'chamber.cfg', base: 'OPEN', alternate: 'HOLD' },
  { name: 'Rotation Speed', file: 'motor.cfg', base: 200, delta: 40, min: 180, max: 220 },
  { name: 'Temperature Offset', file: 'temp.cfg', base: 0, delta: 0.5, min: -1, max: 1 },
  { name: 'Valve Response', file: 'timer.cfg', base: 7, delta: 1, min: 5, max: 10 },
  { name: 'Throttle Control', file: 'control.cfg', base: 'AUTO', alternate: 'MANUAL' },
];
// Keep the missing-reference example numeric; the Valve Mode cohort has stable reference/peer equipment.
const parameterFor = (index: number) => PARAMETERS[index % ANOMALY_PERIOD === 25 ? 0 : (index % ITEMS_PER_CATEGORY) % PARAMETERS.length];
const isAnomaly = (index: number) => index % ANOMALY_PERIOD < ANOMALY_WINDOW && !EQUAL_SLOTS.has(index % ANOMALY_PERIOD);
const rounded = (value: number) => Number(value.toFixed(1));
function numericSetup(index: number) {
  const parameter = parameterFor(index);
  if (typeof parameter.base !== 'number') return null;
  const shift = (Math.floor(index / PARAMETERS.length) % 3) * Math.abs(parameter.delta!);
  const base = index % ANOMALY_PERIOD === 24 ? 0 : rounded(parameter.base + shift);
  return { base, delta: parameter.delta!, spec: { min: index % ANOMALY_PERIOD === 24 ? 0 : rounded(parameter.min! + shift), max: rounded(parameter.max! + shift) } };
}

function changedEquipment(index: number, count: number) {
  const first = index === 0 ? 2 : seeded(index) % DEFAULT_EQUIPMENT.length;
  const stride = 7; // Coprime with 20: selected equipment never repeat within an item.
  const candidates = Array.from({ length: count }, (_, offset) => EQUIPMENT[(first + offset * stride) % EQUIPMENT.length]);
  // A deterministic unchanged cohort makes the full-result hide-column control observable.
  return new Set(candidates.filter(eq => typeof parameterFor(index).base === 'number' || (eq !== 'EQ01' && eq !== 'EQ12')));
}

function identity(index: number) {
  const groupIndex = Math.floor(index / ITEMS_PER_CATEGORY);
  const module = MODULES[Math.floor(groupIndex / CATEGORIES_PER_MODULE)];
  const categoryIndex = groupIndex % CATEGORIES_PER_MODULE;
  const category = `${CATEGORIES[categoryIndex]} ${String(categoryIndex + 1).padStart(2, '0')}`;
  const ordinal = index % ITEMS_PER_CATEGORY;
  const parameter = parameterFor(index);
  const item = ordinal === 29 ? 'Pressure Setpoint / Auxiliary Chamber Stabilization Sequence / Extended Hold Threshold' : parameter.name;
  const filename = parameter.file;
  return { id: idOf(index), module, category, item, filename, group: `${module} › ${category}`, key: `${module} / ${category} / ${item} / ${filename}` };
}

function valuesFor(index: number, params: CompareParams): Record<string, ConfigValue> {
  const slot = index % ANOMALY_PERIOD;
  const parameter = parameterFor(index);
  const numeric = numericSetup(index);
  const anomaly = isAnomaly(index);
  const violation = anomaly && VIOLATION_SLOTS.has(slot) && numeric !== null;
  const globalViolation = slot === 15 && Math.floor(index / ITEMS_PER_CATEGORY) % RARE_GLOBAL_VIOLATION_PERIOD === 0;
  const crossesSpec = numeric !== null && (numeric.base + numeric.delta < numeric.spec.min || numeric.base + numeric.delta > numeric.spec.max);
  const changedCount = violation || crossesSpec ? 1 + seeded(index) % 2 : 1 + seeded(index) % 3;
  const changed = changedEquipment(index, changedCount);
  const missingEquipment = slot >= 25 ? 'EQ01' : [...changedEquipment(index, 1)][0];
  const values = Object.fromEntries(params.eq.map(eq => {
    const deviates = anomaly && changed.has(eq);
    const missing = anomaly && MISSING_SLOTS.has(slot) && eq === missingEquipment;
    let value: number | string | null = numeric?.base ?? parameter.base;
    if (globalViolation && numeric) value = rounded(numeric.spec.max + Math.abs(numeric.delta));
    else if (deviates && !MISSING_SLOTS.has(slot)) {
      if (!numeric) value = parameter.alternate!;
      else if (violation) value = rounded(numeric.spec.max + Math.abs(numeric.delta));
      else value = rounded(numeric.base + numeric.delta);
    }
    if (missing) value = null;
    return [eq, { value, state: 'equal' as ConfigValue['state'] }];
  }));
  const reference = values[params.ref]?.value;
  // All-vs-all marks every participating nonmissing value in a split, with no value called correct.
  const distinct = new Set(Object.values(values).flatMap(cell => cell.value === null ? [] : [cell.value]));
  for (const cell of Object.values(values)) {
    if (cell.value === null) cell.state = 'missing';
    else if (numeric && typeof cell.value === 'number' && (cell.value < numeric.spec.min || cell.value > numeric.spec.max)) cell.state = 'violation';
    else if (params.mode === 'reference' && reference == null) cell.state = 'not-comparable';
    else if (params.mode === 'reference' ? cell.value !== reference : distinct.size > 1) cell.state = 'diff';
  }
  return values;
}

function flags(index: number, params: CompareParams) {
  // 97% take this path: no per-equipment object is allocated while scanning the result set.
  if (!isAnomaly(index)) return { diff: false, violation: false, missing: false, notComparable: false };
  const cells = valuesFor(index, params);
  const values = Object.values(cells);
  const present = values.flatMap(cell => cell.value === null ? [] : [cell.value]);
  const reference = cells[params.ref]?.value;
  const differs = params.mode === 'reference' ? reference != null && present.some(value => value !== reference) : new Set(present).size > 1;
  return {
    diff: differs,
    violation: values.some(cell => cell.state === 'violation'),
    missing: values.some(cell => cell.state === 'missing'),
    notComparable: values.some(cell => cell.state === 'not-comparable'),
  };
}

export function makeRow(index: number, params: CompareParams): ConfigRow {
  const spec = numericSetup(index)?.spec;
  return { ...identity(index), ...flags(index, params), coreKnown: index % 10 >= 4, values: valuesFor(index, params), source: 'CFG', collectedAt: '2026-11-17T00:00:00Z', spec };
}

const needsReview = (row: ReturnType<typeof flags>) => row.diff || row.violation || row.missing || row.notComparable;
function matchesStatus(row: ReturnType<typeof flags>, status: CompareParams['status']) {
  switch (status) {
    case 'all': return true;
    case 'review': return needsReview(row);
    case 'diff': return row.diff;
    case 'violation': return row.violation;
    case 'missing': return row.missing || row.notComparable;
  }
}

function filterValue(index: number, id: string, params: CompareParams) {
  if (!id.startsWith('value.')) return identity(index)[id as keyof ReturnType<typeof identity>];
  const [, eq, kind] = id.split('.');
  const value = valuesFor(index, params)[eq]?.value;
  if (typeof value === kind) return value;
  // Field id uses `text`, while JavaScript calls this primitive `string`.
  return kind === 'text' && typeof value === 'string' ? value : null;
}

/** Count and filter before windowing; never infer equipment visibility from the loaded 80 rows. */
function scan(params: TreeParams) {
  const indices: number[] = [];
  const differences = new Set<number>();
  const affected = new Set<string>();
  const counts: StatusCounts = { all: 0, review: 0, diff: 0, violation: 0, missing: 0 };
  const search = params.q.trim().toLowerCase();
  const specs = filterSpecs(params.eq);
  for (let index = 0; index < ROW_COUNT; index++) {
    if (params.coreOnly && index % 10 < 4) continue;
    if (search && !Object.values(identity(index)).join(' ').toLowerCase().includes(search)) continue;
    if (params.filters?.length && filterRows([index], params.filters, (row, id) => filterValue(row, id, params), { specs }).length === 0) continue;
    const f = flags(index, params);
    counts.all++;
    if (needsReview(f)) counts.review++;
    if (f.diff) counts.diff++;
    if (f.violation) counts.violation++;
    if (f.missing || f.notComparable) counts.missing++;
    if (!matchesStatus(f, params.status)) continue;
    indices.push(index);
    if (f.diff) differences.add(index);
    if (!needsReview(f)) continue;
    const values = valuesFor(index, params);
    const distribution = new Map<number | string, number>();
    for (const { value } of Object.values(values)) if (value !== null) distribution.set(value, (distribution.get(value) ?? 0) + 1);
    const ranked = [...distribution].sort((a, b) => b[1] - a[1]);
    const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];
    const baseline = params.mode === 'reference' ? values[params.ref]?.value : ranked[0]?.[0];
    for (const eq of params.eq) {
      const cell = values[eq];
      if (cell.state === 'violation' || cell.state === 'missing' || cell.state === 'not-comparable' || (f.diff && (tied || cell.value !== baseline))) affected.add(eq);
    }
  }
  const sameColumns = indices.length === 0 ? [] : params.eq.filter(eq => !affected.has(eq) && !(params.mode === 'reference' && eq === params.ref));
  return { indices, counts, differences, sameColumns };
}

type Branch = { id: string; label: string; axis: string; parentId?: string; level: number; count: number; differences: number; children: Map<string, Branch>; leaves: number[] };
const groupId = (path: [string, string][]) => `group:${encodeURIComponent(JSON.stringify(path))}`;
function treePlan(params: TreeParams) {
  const scanned = scan(params);
  const roots = new Map<string, Branch>();
  for (const index of scanned.indices) {
    const row = identity(index);
    const path: [string, string][] = [];
    let children = roots;
    let parent: Branch | undefined;
    for (const [level, axis] of params.levels.entries()) {
      const label = row[axis as keyof typeof row];
      path.push([axis, label]);
      let branch = children.get(label);
      if (!branch) {
        branch = { id: groupId(path), label, axis, parentId: parent?.id, level, count: 0, differences: 0, children: new Map(), leaves: [] };
        children.set(label, branch);
      }
      branch.count++; branch.differences += Number(scanned.differences.has(index));
      parent = branch; children = branch.children;
    }
    parent!.leaves.push(index);
  }
  // The empty expansion list requests the default on the first window only. A separate explicit sentinel preserves collapse-all.
  const expanded = new Set(params.expanded.filter(id => id !== 'collapsed'));
  if (params.expanded.length === 0) {
    let branches = [...roots.values()].slice(0, 1);
    while (branches.length) {
      for (const branch of branches) expanded.add(branch.id);
      branches = branches.flatMap(branch => [...branch.children.values()].slice(0, 2));
    }
  }
  const visible: (TreeRow | number)[] = [];
  const ordered: number[] = [];
  const ancestors = new Map<number, string[]>();
  const walk = (branches: Map<string, Branch>, path: string[], shown: boolean) => {
    for (const branch of branches.values()) {
      const open = expanded.has(branch.id);
      if (shown) visible.push({ id: branch.id, label: branch.label, axis: branch.axis, parentId: branch.parentId, kind: 'group', level: branch.level, count: branch.count, differences: branch.differences, hasChildren: true, expanded: open });
      const next = [...path, branch.id];
      walk(branch.children, next, shown && open);
      for (const index of branch.leaves) {
        ordered.push(index); ancestors.set(index, next);
        if (shown && open) visible.push(index);
      }
    }
  };
  walk(roots, [], true);
  return { ...scanned, visible, ordered, ancestors, expanded: [...expanded] };
}

export function compareTree(params: TreeParams): TreePage {
  const plan = treePlan(params);
  const offset = Math.min(params.offset, Math.max(0, plan.visible.length - 1));
  return {
    nodes: plan.visible.slice(offset, offset + params.limit).map(entry => {
      if (typeof entry !== 'number') return entry;
      const item = makeRow(entry, params);
      return { id: item.id, label: item.item, parentId: plan.ancestors.get(entry)?.at(-1), kind: 'leaf', level: params.levels.length, count: 1, differences: Number(item.diff), hasChildren: false, expanded: false, item };
    }),
    offset, totalVisible: plan.visible.length, totalItems: plan.indices.length, counts: plan.counts, sameColumns: plan.sameColumns,
    expanded: plan.expanded.length ? plan.expanded : ['collapsed'], firstItem: plan.ordered.length ? idOf(plan.ordered[0]) : null,
  };
}

export function navigateTree(params: TreeNavigationParams): TreeNavigation {
  const plan = treePlan(params);
  const differences = plan.ordered.filter(index => plan.differences.has(index));
  const anchor = params.focus === null ? -1 : plan.ordered.indexOf(Number(params.focus.slice(4)));
  const candidates = params.direction === 'next' ? differences : [...differences].reverse();
  const target = candidates.find(index => params.focus === null || (params.direction === 'next' ? plan.ordered.indexOf(index) > anchor : plan.ordered.indexOf(index) < anchor));
  if (target === undefined) return null;
  const expanded = [...new Set([...plan.expanded, ...plan.ancestors.get(target)!])];
  const destination = treePlan({ ...params, expanded });
  const position = destination.visible.indexOf(target);
  return { focus: idOf(target), expanded, offset: Math.floor(position / params.limit) * params.limit, ordinal: differences.indexOf(target) + 1, total: differences.length };
}

function validExpansion(id: unknown, levels: string[]) {
  if (id === 'collapsed') return true;
  if (typeof id !== 'string' || !id.startsWith('group:')) return false;
  try {
    const path: unknown = JSON.parse(decodeURIComponent(id.slice('group:'.length)));
    return Array.isArray(path) && path.length > 0 && path.length <= levels.length && path.every((part, index) => Array.isArray(part) && part.length === 2 && part[0] === levels[index] && typeof part[1] === 'string' && part[1].length <= 200);
  } catch { return false; } // Malformed ids are rejected, never substituted with a default expansion.
}
export function validateTree({ params }: { params: TreeParams }) {
  if (!Array.isArray(params.eq) || !validEquipment(params.eq)) return 'Choose 2–20 unique synthetic equipment';
  if (!['all', 'reference'].includes(params.mode) || !EQUIPMENT.includes(params.ref) || !STATUS.includes(params.status) || typeof params.q !== 'string' || params.asOf !== 'latest') return 'Invalid comparison parameters';
  if (params.mode === 'reference' && !params.eq.includes(params.ref)) return 'Reference must be selected';
  if (params.coreOnly !== undefined && typeof params.coreOnly !== 'boolean') return 'Invalid CORE condition';
  if (!Array.isArray(params.levels) || !validLevels(params.levels)) return 'Invalid levels';
  if (!Array.isArray(params.expanded) || params.expanded.length > ROW_COUNT || params.expanded.some(id => !validExpansion(id, params.levels))) return 'Invalid expansion';
  if (!Number.isInteger(params.offset) || params.offset < 0 || !Number.isInteger(params.limit) || params.limit < 1 || params.limit > TREE_WINDOW) return 'Invalid window';
  if (params.filters !== undefined && (!Array.isArray(params.filters) || params.filters.some(filter => !filter || typeof filter !== 'object') || !validateFilters(params.filters, filterSpecs(params.eq)).ok)) return 'Invalid filters';
  return null;
}
const syntheticSource = { source: 'synthetic.configuration' };
export const configurationMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(configurationTreeEndpoint, { ...syntheticSource, validate: validateTree, handle: ({ params }) => compareTree(params), isEmpty: data => data.totalItems === 0, provisional: ({ data }) => data.counts.missing > 0 }),
  defineMockEndpoint(configurationTreeNavigationEndpoint, { ...syntheticSource, validate: input => validateTree(input) ?? (['next', 'previous'].includes(input.params.direction) && (input.params.focus === null || typeof input.params.focus === 'string' && isRowId(input.params.focus)) ? null : 'Invalid navigation'), handle: ({ params }) => navigateTree(params) }),
  defineMockEndpoint(configurationDetailEndpoint, { ...syntheticSource, validate: input => validateTree(input) ?? (typeof input.params.focus === 'string' && isRowId(input.params.focus) ? null : 'Invalid focus'), handle: ({ params }) => {
    const index = Number(params.focus.slice(4));
    if (!scan(params).indices.includes(index)) throw new MockRequestError('Item is outside the filtered result');
    return makeRow(index, params);
  }, provisional: ({ data }) => data.missing }),
  defineMockEndpoint(configurationExportEndpoint, { ...syntheticSource, validate: validateTree, handle: ({ params }) => {
    const { ordered } = treePlan(params);
    // One extra row lets the mock server apply the declared maxRows without building every row.
    return ordered.slice(0, EXPORT_LIMIT + 1).map(index => makeRow(index, params));
  } }),
];

