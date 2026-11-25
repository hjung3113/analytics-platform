const connected = {
  version: 1 as const,
  instances: [
    { id: 'source', source: { kind: 'chart' as const, config: { stacked: true } }, inputs: [], outputs: [{ key: 'lots', dimension: 'lot', shape: 'set' as const }] },
    { id: 'sink', source: { kind: 'declared' as const, panel: 'trend' }, inputs: [{ key: 'lots', mode: 'follow' as const, from: 'source.lots' }], outputs: [] },
  ],
};

const unreadable = { panels: null, panelsUnreadable: true } as const;

export const unicodePanelCases = [
  { label: 'v1 with a NUL in a chart config key', key: 'a\u0000b', value: 'value' },
  { label: 'v1 with a NUL in a chart config string', key: 'label', value: 'a\u0000b' },
].map(({ label, key, value }) => ({
  label,
  panels: { version: 1 as const, instances: [{ id: 'chart', source: { kind: 'chart' as const, config: { [key]: value } }, inputs: [], outputs: [] }] },
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
  { label: 'forbidden chart data', stored: { version: 1, instances: [{ id: 'chart', source: { kind: 'chart', config: { rows: [] } }, inputs: [], outputs: [] }] }, read: unreadable, rename: 'Renamed' },
] satisfies { label: string; stored: unknown; read: { panels: ReadablePanels | null; panelsUnreadable?: true }; rename: string }[];
