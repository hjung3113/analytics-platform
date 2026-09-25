/** 합성 fixture, 실제 메뉴 아님. All global UI is owned by this shell. */
import { useEffect, useId, useState, type CSSProperties } from 'react';
import { Menu } from 'lucide-react';
import { Button } from './components/shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './components/shadcn/dialog';
import { Label } from './components/shadcn/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/shadcn/select';
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
  return <ul className="flex flex-wrap gap-x-6 gap-y-2 py-2 [overflow-wrap:anywhere]" aria-label="Inherited context">{entries.map(([key, value, capability], i) => <li key={key + i} data-context={key}>
    <strong>{key}</strong>: {valueLabel(value)}{value !== null && <small className="text-text-warning"> · {capability === 'unsupported' ? 'Not used on this page' : capability === 'reference' ? 'Reference only' : 'Supported · server validation pending'}</small>}
  </li>)}</ul>;
}
// Radix Select reserves '' for "no value", so absence crosses the boundary as this sentinel and the callers keep native-select strings.
const ABSENT = '__absent';
type Option = { value: string; label: string };
function ContextSelect({ label, value, options, disabled, onChange }: { label: string; value: string; options: Option[]; disabled?: boolean; onChange: (value: string) => void }) {
  const id = useId();
  return <div className="inline-flex items-center gap-2">
    <Label htmlFor={id}>{label}</Label>
    <Select value={value || ABSENT} disabled={disabled} onValueChange={next => onChange(next === ABSENT ? '' : next)}>
      <SelectTrigger id={id} aria-label={label} className="h-8 w-auto min-w-44 gap-2 rounded-sm border-border-strong bg-surface-card"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value || ABSENT}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
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
  const inheritedOption = (values: string[] | null | undefined, known: string[]): Option[] => values?.length && (values.length > 1 || !known.includes(values[0])) ? [{ value: setValue(values), label: `Inherited: ${values.join(', ')}` }] : [];
  const setOptions = (known: string[]): Option[] => [{ value: '', label: 'Not selected' }, { value: 'none', label: 'Explicit empty set' }, ...known.map(value => ({ value, label: value }))];
  const conditionOptions = [
    { axis: 'stgroup', values: ['fixture-group'] }, { axis: 'team', values: ['fixture-team'] }, { axis: 'makerModel', values: ['fixture-maker', 'fixture-model'] },
    ...(context?.condition ? [context.condition] : []),
  ].filter((item, i, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(item)) === i).map(item => ({ value: JSON.stringify(item), label: `${item.axis}: ${item.values.join(' / ')}` }));
  const navButton = 'w-full justify-start gap-3 px-3 text-text-sidebar hover:bg-surface-sidebar-hover hover:text-text-on-accent focus-visible:ring-focus-ring-sidebar focus-visible:ring-offset-surface-sidebar aria-[current=page]:bg-accent-primary aria-[current=page]:text-text-on-accent';
  return <div className="grid min-h-screen grid-cols-[var(--sidebar-width)_minmax(0,1fr)]" style={{ '--sidebar-width': `${collapsed ? shellDimensions.collapsed : shellDimensions.expanded}px`, '--header-height': `${shellDimensions.header}px` } as CSSProperties}>
    <aside className="bg-surface-sidebar px-2 py-4 text-text-sidebar" style={{ width: collapsed ? shellDimensions.collapsed : shellDimensions.expanded }}>
      <Button variant="ghost" size="sm" className={navButton + ' w-auto'} aria-label="Toggle sidebar" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><Menu className="h-4 w-4" aria-hidden /></Button>
      {!collapsed && <><h2 className="mx-2 mt-5 mb-2 text-[17px] font-semibold">Kernel laboratory</h2><p className="m-2 text-xs">{FIXTURE_NOTICE}</p></>}
      <nav aria-label="Fixture navigation">{[...new Set(menus.map(menu => menu.group))].map(group => <section key={group} aria-label={group} className="grid gap-1">{!collapsed && <p className="mx-2 pt-6 text-xs tracking-wider text-text-disabled uppercase">{group}</p>}{menus.filter(menu => menu.group === group).map(menu => <Button key={menu.id} variant="ghost" size="sm" className={navButton} title={`${menu.name} · ${FIXTURE_NOTICE}`} aria-label={menu.name} aria-current={state?.menu.id === menu.id ? 'page' : undefined} disabled={!state} onClick={() => navigate(menu)}>{menu.icon}{!collapsed && <span>{menu.name}</span>}</Button>)}</section>)}</nav>
    </aside>
    <div className="min-w-0">
      <header className="flex items-center gap-4 overflow-x-auto border-b border-border-subtle bg-surface-card px-6 whitespace-nowrap max-sm:gap-2 max-sm:px-3" style={{ height: shellDimensions.header }}>
        <strong className="hidden sm:block">Platform / Fixture</strong>
        <ContextSelect label="Scope" value={scope} disabled={!state} onChange={value => update({ scope_id: value || null })} options={[
          { value: '', label: 'Select scope' }, { value: 'fixture-scope-a', label: 'fixture-scope-a' }, { value: 'fixture-scope-b', label: 'fixture-scope-b' },
          ...(scope && !['fixture-scope-a', 'fixture-scope-b'].includes(scope) ? [{ value: scope, label: `${scope} · unverified` }] : []),
        ]} />
        <Dialog open={palette} onOpenChange={setPalette}>
          <DialogTrigger asChild><Button variant="secondary" size="sm">Search ⌘K</Button></DialogTrigger>
          {/* DialogContent's built-in close button is the palette's only Close control. */}
          <DialogContent className="top-[20%] max-w-[520px] translate-y-0 rounded-lg">
            <DialogHeader><DialogTitle>Menu Registry</DialogTitle><DialogDescription>{FIXTURE_NOTICE} · 목록만 제공, 검색 인덱스 없음</DialogDescription></DialogHeader>
            <nav aria-label="Command palette" className="grid gap-1">{menus.map(menu => <Button key={menu.id} variant="ghost" size="sm" className="justify-start" disabled={!state} onClick={() => navigate(menu)}>{menu.icon} {menu.name}</Button>)}</nav>
          </DialogContent>
        </Dialog>
        <span title="Help integration deferred">Help · stub</span><span title="No authenticated session">User · fixture</span>
      </header>
      {error ? <div role="alert" className="m-6 border border-accent-danger p-4 text-text-danger">{error}<p>URL preserved. Correct the address to continue.</p></div> : state && context && <>
        <nav aria-label="Breadcrumb" className="px-6 py-4 text-text-muted">{state.menu.group} / {state.menu.name}</nav>
        <section aria-label="Global Context" className="min-h-12 border-y border-border-subtle bg-surface-card px-6 py-3">
          <p>{scope ? `Requested Scope: ${scope} · server validation pending` : 'Scope selection required'} · {FIXTURE_NOTICE}</p>
          <ContextDisplay menu={state.menu} context={context} />
          <div className="my-3 flex flex-wrap gap-3">
            <ContextSelect label="room" value={setValue(context.room_names)} onChange={value => setSelect('room_names', value)} options={[...setOptions(['fixture-room-a', 'fixture-room-b']), ...inheritedOption(context.room_names, ['fixture-room-a', 'fixture-room-b'])]} />
            <ContextSelect label="Condition" value={context.condition ? JSON.stringify(context.condition) : ''} options={[{ value: '', label: 'Not selected' }, ...conditionOptions]} onChange={value => {
              if (!value) update({ condition: null });
              else { const condition = JSON.parse(value); update({ condition: decodeCondition(JSON.stringify({ axis: condition.axis, ...Object.fromEntries((condition.axis === 'makerModel' ? ['maker', 'model'] : ['id']).map((key, i) => [key, condition.values[i]])) })) }); }
            }} />
            <ContextSelect label="Selection" value={setValue(context.selection)} onChange={value => setSelect('selection', value)} options={[...setOptions(['fixture-equipment-a', 'fixture-equipment-b']), ...inheritedOption(context.selection, ['fixture-equipment-a', 'fixture-equipment-b'])]} />
          </div>
          <small>Condition edits preserve fixed Selection. No server request or authorization is performed.</small>
        </section>
        {editError && <p role="alert">{editError}</p>}
        <PlatformPage title={state.menu.name} description={FIXTURE_NOTICE} primaryAction={null} secondaryActions={null} contextExtension={null} content={null} dataTrustSummary="Fixture only · no dataset, calculation basis, or verified permissions" />
      </>}
    </div>
  </div>;
}
