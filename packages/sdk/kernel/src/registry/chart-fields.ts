import { CHART_CONFIG_FIELD_MAX, PANEL_INSTANCE_TOKEN_MAX, type MenuChartFields, type Text } from '@ap/contracts';
import type { MenuEntry } from './registry';
import { isIdShape, isObjectKindShape, isPermissionShape } from './shapes';

const REAGGREGATIONS = ['sum', 'ratioOfSums', 'recomputeFromDistribution', 'none'];
const textPresent = (text: Text | undefined) => typeof text?.ko === 'string' && text.ko.trim() !== '' && typeof text.en === 'string' && text.en.trim() !== '';
const isField = (value: unknown): value is string => isIdShape(value) && value.length <= CHART_CONFIG_FIELD_MAX;

/**
 * Registration check of `MenuMeta.chartFields` (#2761). Measure ids, breakdown ids and the time field share one namespace: each is a
 * field of the chart query's rows and of a stored ChartConfig, so a repeat would draw one column as two things.
 */
export function registerChartFields(menu: Pick<MenuEntry, 'id' | 'chartFields'>, fail: (message: string) => never): void {
  const fields: MenuChartFields | undefined = menu.chartFields;
  if (fields === undefined) return;
  const error = (message: string): never => fail(`Menu "${menu.id}" chartFields ${message}`);
  if (!fields || typeof fields !== 'object' || !Array.isArray(fields.measures) || !Array.isArray(fields.breakdowns)) error('needs measures and breakdowns arrays');
  if (fields.measures.length === 0 || fields.breakdowns.length === 0) error('needs at least one measure and one breakdown');
  const seen = new Set<string>();
  const claim = (id: unknown, what: string) => {
    if (!isField(id)) error(`${what} id must be nonempty, at most ${CHART_CONFIG_FIELD_MAX} characters and contain no URL separators`);
    if (seen.has(id as string)) error(`duplicate field "${id as string}"`);
    seen.add(id as string);
  };
  if (fields.time !== undefined) {
    claim(fields.time?.field, 'time');
    if (!textPresent(fields.time.label)) error('time label needs nonempty ko and en');
  }
  for (const breakdown of fields.breakdowns) {
    claim(breakdown?.id, 'breakdown');
    if (!textPresent(breakdown.label)) error(`breakdown "${breakdown.id}" label needs nonempty ko and en`);
    // The same rule as a code panel's output selection dimension, and the saved-view token cap, so the bar's output is storable and linkable.
    if (!isObjectKindShape(breakdown.dimension) || breakdown.dimension.length > PANEL_INSTANCE_TOKEN_MAX) {
      error(`breakdown "${breakdown.id}" dimension must match /^[a-z][a-zA-Z0-9]*$/ and have at most ${PANEL_INSTANCE_TOKEN_MAX} characters`);
    }
  }
  for (const measure of fields.measures) {
    claim(measure?.id, 'measure');
    const invalid = (message: string): never => error(`measure "${measure.id}" ${message}`);
    if (!textPresent(measure.label)) invalid('label needs nonempty ko and en');
    if (typeof measure.unit !== 'string' || measure.unit.trim() === '') invalid('unit must be nonempty (a dimensionless measure names one, such as 건)');
    if (!REAGGREGATIONS.includes(measure.reaggregation)) invalid(`reaggregation must be one of ${REAGGREGATIONS.join(', ')}`);
    if (measure.metricVersion !== undefined && (typeof measure.metricVersion !== 'string' || measure.metricVersion.trim() === '')) invalid('metricVersion must be nonempty');
    if (measure.permission !== undefined && !isPermissionShape(measure.permission)) invalid('permission must be <namespace>:<action>');
    if (measure.breakdowns !== undefined) {
      if (!Array.isArray(measure.breakdowns) || measure.breakdowns.length === 0) invalid('breakdowns must be a nonempty array');
      for (const id of measure.breakdowns) if (!fields.breakdowns.some(b => b.id === id)) invalid(`breakdowns names unknown breakdown "${id}"`);
    }
  }
}
