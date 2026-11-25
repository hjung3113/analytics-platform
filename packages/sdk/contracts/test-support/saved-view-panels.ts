const connected = {
  version: 1 as const,
  instances: [
    { id: 'source', source: { kind: 'chart' as const, config: { stacked: true } }, inputs: [], outputs: [{ key: 'lots', dimension: 'lot', shape: 'set' as const }] },
    { id: 'sink', source: { kind: 'declared' as const, panel: 'trend' }, inputs: [{ key: 'lots', mode: 'follow' as const, from: 'source.lots' }], outputs: [] },
  ],
};

const unreadable = { panels: null, panelsUnreadable: true } as const;

export const storedPanelCases = [
  { label: 'null', stored: null, read: { panels: null }, rename: 'Renamed' },
  { label: 'v1', stored: connected, read: { panels: connected }, rename: 'Renamed' },
  { label: 'old object', stored: { anything: 1 }, read: unreadable, rename: 'Renamed' },
  { label: 'old array', stored: [1], read: unreadable, rename: 'Renamed' },
  { label: 'old string', stored: 'x', read: unreadable, rename: 'Renamed' },
  { label: 'future version', stored: { version: 2, instances: [] }, read: unreadable, rename: 'Renamed' },
  { label: 'dangling from', stored: { ...connected, instances: connected.instances.slice(1) }, read: unreadable, rename: 'Renamed' },
  { label: 'forbidden chart data', stored: { version: 1, instances: [{ id: 'chart', source: { kind: 'chart', config: { rows: [] } }, inputs: [], outputs: [] }] }, read: unreadable, rename: 'Renamed' },
] satisfies { label: string; stored: unknown; read: { panels: typeof connected | null; panelsUnreadable?: true }; rename: string }[];
