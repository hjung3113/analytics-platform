import './style.css';
import { lazy, useState, useSyncExternalStore } from 'react';
import { Gauge } from 'lucide-react';
import { startAppHost } from '@ap/app-host';
import { groupId, type SavedViewStore } from '@ap/contracts';
import { useEquipmentAxes, useMenuQuery, usePlatform } from '@ap/kernel';
import { PlatformPage, QueryView } from '@ap/components';
import { Button } from '@ap/ui';
import { createLocalSavedViewStore, createMockAdapter } from '@ap/mock-server';
import { axes, endpoint, menu, MENU_ID, permissions, space } from './contract';

const completed: string[] = [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
let store: SavedViewStore;

function RoundTripPage() {
  const platform = usePlatform();
  const injectedAxes = useEquipmentAxes();
  const filter = platform.pageParam('rtFilter') ?? 'all';
  const axis = platform.pageParam('rtAxis') ?? 'chamberType';
  const query = useMenuQuery(endpoint, { filter, axis });
  const [status, setStatus] = useState('');
  const finished = useSyncExternalStore(subscribe, () => completed.join(','));
  async function save() {
    const result = await store.save({
      schemaVersion: 1, kind: 'menu-view', name: 'Kit view', menuId: MENU_ID, menuSchemaVersion: 1,
      context: {}, page: [['rtFilter', filter], ['rtAxis', axis]], chartOptions: {}, layout: null, panels: null,
    });
    setStatus(result.ok ? 'Saved' : result.reason);
  }
  async function restore() {
    const views = await store.list({ userId: platform.session.user.id, menuId: MENU_ID });
    const entry = views.find((item) => !item.denied && item.view.name === 'Kit view');
    if (!entry || entry.denied || entry.view.kind !== 'menu-view') { setStatus('View unavailable'); return; }
    const page = entry.view.page;
    platform.setPage(Array.isArray(page) ? Object.fromEntries(page) : page);
    setStatus('Restored');
  }
  return <PlatformPage>
    <label>Axis group<select aria-label="Axis group" value={axis} onChange={(event) => platform.setPage({ rtAxis: event.target.value })}>
      {injectedAxes.map((item) => <option key={item.id} value={item.id}>{item.label.en}</option>)}
    </select></label>
    <label>Row filter<select aria-label="Row filter" value={filter} onChange={(event) => platform.setPage({ rtFilter: event.target.value })}>
      {['all', 'old', 'new'].map((item) => <option key={item}>{item}</option>)}
    </select></label>
    <Button onClick={() => void save()}>Save menu view</Button>
    <Button onClick={() => void restore()}>Restore menu view</Button>
    <output aria-label="View operation">{status}</output>
    <pre data-testid="round-trip-context">{JSON.stringify(platform.global)}</pre>
    <pre data-testid="completed-requests">{finished}</pre>
    <QueryView query={query}>{(data) => <table aria-label="Round trip rows">
      <thead><tr><th>Axis group</th><th>Row</th><th>Value</th><th>Trust</th><th>MeasureMeta</th></tr></thead>
      <tbody>{data.rows.map((row, index) => <tr key={row.name}>
        <td>{row.group}</td><td>{row.name}</td><td>{row.value}</td>
        <td>{index === 0 ? query.response?.trust?.source : ''}</td>
        <td>{index === 0 ? `${data.measure.unit} / ${data.measure.reaggregation} / ${data.measure.metricVersion}` : ''}</td>
      </tr>)}</tbody>
    </table>}</QueryView>
  </PlatformPage>;
}

const container = document.getElementById('root');
if (container) void startAppHost({
  container,
  declarations: {
    spaces: [space], groups: [{ id: groupId('kit'), label: space.label, icon: Gauge, space: space.id }],
    menus: [{ ...menu, icon: Gauge, component: lazy(async () => ({ default: RoundTripPage })) }], permissions: [menu.permission],
  },
  equipmentAxes: axes,
  queryHistory: { list: async () => [], record: async () => {}, remove: async () => {}, clear: async () => {} },
  createAssembly: ({ registry }) => {
    const adapter = createMockAdapter({ registry, permissions, equipmentAxes: axes, endpoints: [] });
    // Real moved store; only its synthetic seed and actor are injected. No store method is replaced.
    store = createLocalSavedViewStore({
      getActor: () => ({ userId: adapter.session().user.id, admin: false, permissions: [menu.permission], rooms: [] }),
      menuPermissionsOf: (id) => registry.menus.find((item) => item.id === id)?.permission ? [menu.permission] : undefined,
      seed: { actors: { engineer: { userId: 'engineer', admin: false, permissions: [menu.permission], rooms: [] } }, directory: [{ userId: 'engineer', displayName: 'Kit actor', affiliation: 'Kit' }], groups: () => [], views: () => [] },
    });
    return { topBarTools: null, savedViews: store, adapter: { ...adapter,
      // Deliberately uncancelled: the SDK must also reject a response from a transport that ignores abort.
      menuQuery: async (request) => {
        const response = await fetch('/api/round-trip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
        if (!response.ok) throw new Error(`Mock endpoint HTTP ${response.status}`);
        const result = await response.json();
        completed.push(String((request.params as { filter: string }).filter));
        listeners.forEach((listener) => listener());
        return result;
      },
    } };
  },
});
