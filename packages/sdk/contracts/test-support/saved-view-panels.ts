/** A valid ChartConfig v1 (#2745) for chart-source instances. */
export const lineChartConfig = {
  version: 1 as const,
  kind: 'line' as const,
  x: { field: 'time', type: 'time' as const },
  measures: [{ field: 'yield', color: 'chart-series-2' as const }],
};

const chartInstance = (config: unknown) => ({ version: 1, instances: [{ id: 'chart', source: { kind: 'chart', config }, inputs: [], outputs: [] }] });

/** Stored chart configs that carry data, visual values or unknown keys: every reader projects them unreadable and every writer refuses them. */
export const rejectedChartConfigCases = [
  { label: 'chart config with a value array', config: { ...lineChartConfig, points: [['2026-11-01T00:00:00', 1]] } },
  { label: 'chart config with rows', config: { ...lineChartConfig, rows: [] } },
  { label: 'chart config with a hex colour', config: { ...lineChartConfig, measures: [{ field: 'yield', color: '#ff0000' }] } },
  { label: 'chart config with a px size', config: { ...lineChartConfig, height: '320px' } },
  { label: 'chart config with a font', config: { ...lineChartConfig, x: { field: 'time', type: 'time', font: 'Arial' } } },
  { label: 'opaque pre-#2745 chart config', config: { stacked: true } },
].map(({ label, config }) => ({ label, panels: chartInstance(config) }));

const connected = {
  version: 1 as const,
  instances: [
    { id: 'source', source: { kind: 'chart' as const, config: lineChartConfig }, inputs: [], outputs: [{ key: 'lots', dimension: 'lot', shape: 'set' as const }] },
    { id: 'sink', source: { kind: 'declared' as const, panel: 'trend' }, inputs: [{ key: 'lots', mode: 'follow' as const, from: 'source.lots' }], outputs: [] },
  ],
};

const unreadable = { panels: null, panelsUnreadable: true } as const;

export const unicodePanelCases = [
  { label: 'v1 with a NUL in a chart x field', config: { ...lineChartConfig, x: { field: 'a\u0000b', type: 'time' as const } } },
  { label: 'v1 with a NUL in a chart measure field', config: { ...lineChartConfig, measures: [{ field: 'a\u0000b' }] } },
].map(({ label, config }) => ({
  label,
  panels: { version: 1 as const, instances: [{ id: 'chart', source: { kind: 'chart' as const, config }, inputs: [], outputs: [] }] },
}));

type ReadablePanels = typeof connected | (typeof unicodePanelCases)[number]['panels'];

export const storedPanelCases = [
  { label: 'null', stored: null, read: { panels: null }, rename: 'Renamed' },
  { label: 'v1', stored: connected, read: { panels: connected }, rename: 'Renamed' },
  ...unicodePanelCases.map(({ label, panels }) => ({ label, stored: panels, read: { panels }, rename: 'Renamed' })),
  { label: 'old object', stored: { anything: 1 }, read: unreadable, rename: 'Renamed' },
  { label: 'old array', stored: [1], read: unreadable, rename: 'Renamed' },
  { label: 'old string', stored: 'x', read: unreadable, rename: 'Renamed' },
  { label: 'future version', stored: { version: 2, instances: [] }, read: unreadable, rename: 'Renamed' },
  { label: 'dangling from', stored: { ...connected, instances: connected.instances.slice(1) }, read: unreadable, rename: 'Renamed' },
  ...rejectedChartConfigCases.map(({ label, panels }) => ({ label, stored: panels, read: unreadable, rename: 'Renamed' })),
] satisfies { label: string; stored: unknown; read: { panels: ReadablePanels | null; panelsUnreadable?: true }; rename: string }[];
