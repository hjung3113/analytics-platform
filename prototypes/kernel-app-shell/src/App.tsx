/** 합성 fixture, 실제 메뉴 아님. All global UI is owned by this shell. */
import { useEffect, useState, type CSSProperties } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ContractError, decodeCondition, type ContextState } from './codec';
import { FIXTURE_NOTICE, menus, type Capability, type MenuEntry } from './registry';
import { readLocation, writeLocation } from './kernel';
import { PlatformPage } from './PlatformPage';
export const shellDimensions = { expanded: 270, collapsed: 64, header: 54 } as const;
const valueLabel = (v: unknown) => v === null ? 'Not selected' : Array.isArray(v) ? (v.length ? v.join(', ') : 'Explicit empty set') : typeof v === 'object' ? JSON.stringify(v) : String(v);
export function ContextDisplay({ menu, context }: { menu: MenuEntry; context: ContextState }) {
  const entries: [string, unknown, Capability][] = [
    ['room', context.room_names, menu.supportedContext.room_names],
    ['Condition', context.condition, menu.supportedContext.condition],
    ['Selection', context.selection, menu.supportedContext.selection],
    ...context.unapplied_globals.map(([key, value]): [string, unknown, Capability] => [key, value, 'unsupported']),
  ];
  return <ul className="context-values" aria-label="Inherited context">{entries.map(([key, value, capability], i) => <li key={key + i} data-context={key}>
    <strong>{key}</strong>: {valueLabel(value)}{value !== null && <small> · {capability === 'unsupported' ? 'Not used on this page' : capability === 'reference' ? 'Reference only' : 'Supported · server validation pending'}</small>}
  </li>)}</ul>;
}
function currentUrl() { return window.location.pathname + window.location.search; }
export function App() {
  const [url, setUrl] = useState(currentUrl);
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  const [editError, setEditError] = useState('');
  useEffect(() => {
    const pop = () => { setUrl(currentUrl()); setEditError(''); };
    const key = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette(value => !value); } };
    window.addEventListener('popstate', pop); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('keydown', key); };
  }, []);
  let state: ReturnType<typeof readLocation> | undefined; let error = '';
  try { state = readLocation(url === '/' ? menus[0].path : url); }
  catch (caught) { error = caught instanceof ContractError ? `${caught.code}: ${caught.message}` : String(caught); }
  const navigate = (menu: MenuEntry) => {
    if (!state) return;
    const next = writeLocation(menu, state.context, true);
    window.history.pushState(null, '', next); setUrl(next); setPalette(false); setEditError('');
  };
  const update = (patch: Partial<ContextState>) => {
    if (!state) return;
    try {
      const next = writeLocation(state.menu, { ...state.context, ...patch });
      window.history.pushState(null, '', next); setUrl(next); setEditError('');
    } catch (caught) { setEditError(String(caught)); }
  };
  const context = state?.context;
  const scope = context?.scope_id ?? '';
  // '__inherited'는 setValue의 표시용 sentinel — 재선택해도 현재 다중/미지 값을 리터럴로 덮어쓰지 않는다.
  const setSelect = (key: 'room_names' | 'selection', value: string) => { if (value === '__inherited') return; update({ [key]: value === '' ? null : value === 'none' ? [] : [value] }); };
  const setValue = (value: string[] | null | undefined) => value == null ? '' : value.length === 0 ? 'none' : value.length === 1 ? value[0] : '__inherited';
  const inheritedOption = (values: string[] | null | undefined, known: string[]) => values?.length && (values.length > 1 || !known.includes(values[0])) ? <option value={setValue(values)}>Inherited: {values.join(', ')}</option> : null;
  return <div className="shell" style={{ '--sidebar-width': `${collapsed ? shellDimensions.collapsed : shellDimensions.expanded}px`, '--header-height': `${shellDimensions.header}px` } as CSSProperties}>
    <aside style={{ width: collapsed ? shellDimensions.collapsed : shellDimensions.expanded }}>
      <button aria-label="Toggle sidebar" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>☰</button>
      {!collapsed && <><h2>Kernel laboratory</h2><p>{FIXTURE_NOTICE}</p></>}
      <nav aria-label="Fixture navigation">{[...new Set(menus.map(menu => menu.group))].map(group => <section key={group} aria-label={group}>{!collapsed && <p className="group-label">{group}</p>}{menus.filter(menu => menu.group === group).map(menu => <button key={menu.id} title={`${menu.name} · ${FIXTURE_NOTICE}`} aria-label={menu.name} aria-current={state?.menu.id === menu.id ? 'page' : undefined} disabled={!state} onClick={() => navigate(menu)}>{menu.icon}{!collapsed && <span>{menu.name}</span>}</button>)}</section>)}</nav>
    </aside>
    <div className="workspace">
      <header className="top-bar" style={{ height: shellDimensions.header }}>
        <strong className="hidden sm:block">Platform / Fixture</strong>
        <label>Scope <select aria-label="Scope" value={scope} disabled={!state} onChange={e => update({ scope_id: e.target.value || null })}>
          <option value="">Select scope</option><option value="fixture-scope-a">fixture-scope-a</option><option value="fixture-scope-b">fixture-scope-b</option>
          {scope && !['fixture-scope-a', 'fixture-scope-b'].includes(scope) && <option value={scope}>{scope} · unverified</option>}
        </select></label>
        <Dialog.Root open={palette} onOpenChange={setPalette}>
          <Dialog.Trigger asChild><button>Search ⌘K</button></Dialog.Trigger>
          <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content">
            <Dialog.Title>Menu Registry</Dialog.Title><Dialog.Description>{FIXTURE_NOTICE} · 목록만 제공, 검색 인덱스 없음</Dialog.Description>
            <nav aria-label="Command palette">{menus.map(menu => <button key={menu.id} disabled={!state} onClick={() => navigate(menu)}>{menu.icon} {menu.name}</button>)}</nav>
            <Dialog.Close asChild><button>Close</button></Dialog.Close>
          </Dialog.Content></Dialog.Portal>
        </Dialog.Root>
        <span title="Help integration deferred">Help · stub</span><span title="No authenticated session">User · fixture</span>
      </header>
      {error ? <div role="alert" className="error">{error}<p>URL preserved. Correct the address to continue.</p></div> : state && context && <>
        <nav aria-label="Breadcrumb" className="breadcrumb">{state.menu.group} / {state.menu.name}</nav>
        <section aria-label="Global Context" className="global-context">
          <p>{scope ? `Requested Scope: ${scope} · server validation pending` : 'Scope selection required'} · {FIXTURE_NOTICE}</p>
          <ContextDisplay menu={state.menu} context={context} />
          <div className="context-controls">
            <label>room <select aria-label="room" value={setValue(context.room_names)} onChange={e => setSelect('room_names', e.target.value)}><option value="">Not selected</option><option value="none">Explicit empty set</option><option value="fixture-room-a">fixture-room-a</option><option value="fixture-room-b">fixture-room-b</option>{inheritedOption(context.room_names, ['fixture-room-a', 'fixture-room-b'])}</select></label>
            <label>Condition <select aria-label="Condition" value={context.condition ? JSON.stringify(context.condition) : ''} onChange={e => {
              if (!e.target.value) update({ condition: null });
              else { const condition = JSON.parse(e.target.value); update({ condition: decodeCondition(JSON.stringify({ axis: condition.axis, ...Object.fromEntries((condition.axis === 'makerModel' ? ['maker', 'model'] : ['id']).map((key, i) => [key, condition.values[i]])) })) }); }
            }}><option value="">Not selected</option>{[
              { axis: 'stgroup', values: ['fixture-group'] }, { axis: 'team', values: ['fixture-team'] }, { axis: 'makerModel', values: ['fixture-maker', 'fixture-model'] },
              ...(context.condition ? [context.condition] : []),
            ].filter((item, i, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(item)) === i).map(item => <option key={JSON.stringify(item)} value={JSON.stringify(item)}>{item.axis}: {item.values.join(' / ')}</option>)}</select></label>
            <label>Selection <select aria-label="Selection" value={setValue(context.selection)} onChange={e => setSelect('selection', e.target.value)}><option value="">Not selected</option><option value="none">Explicit empty set</option><option value="fixture-equipment-a">fixture-equipment-a</option><option value="fixture-equipment-b">fixture-equipment-b</option>{inheritedOption(context.selection, ['fixture-equipment-a', 'fixture-equipment-b'])}</select></label>
          </div>
          <small>Condition edits preserve fixed Selection. No server request or authorization is performed.</small>
        </section>
        {editError && <p role="alert">{editError}</p>}
        <PlatformPage title={state.menu.name} description={FIXTURE_NOTICE} primaryAction={null} secondaryActions={null} contextExtension={null} content={null} dataTrustSummary="Fixture only · no dataset, calculation basis, or verified permissions" />
      </>}
    </div>
  </div>;
}
