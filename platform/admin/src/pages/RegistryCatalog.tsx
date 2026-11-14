import { useMessages, CONTEXT_LABELS, PAGE_TYPE_LABELS, useI18n, usePlatform } from '@ap/kernel';
import { ADMIN_MESSAGES } from '../messages';
import { useMemo } from 'react';
import { AlertTriangle, PanelRight } from 'lucide-react';
import type { Text } from '@ap/contracts';
import { DetailDrawer, RowAction, type PlatformColumn, PlatformDataTable, PlatformPage, sortAndPage, StateMessage, TableUrlWarning, useTableUrlState } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import { toRegistryRow, type RegistryRow } from '../registry-rows';

const SORT_FIELDS = ['id', 'spaceId', 'groupId', 'path', 'permission', 'capabilities', 'pageKeys', 'contextResetKeys', 'status'] as const;
// Package-owned status vocabulary (design §1).
const STATUS: Record<RegistryRow['status'], Text> = { implemented: ADMIN_MESSAGES.registryCatalogImplemented, planned: ADMIN_MESSAGES.registryCatalogPlanned };

/**
 * 메뉴 레지스트리 (issue #42; 06 §12.4 catalog archetype — the object is a definition, not a mutable master).
 * Reads `usePlatform().registry` directly: the registry is a client declaration, never a mart result,
 * so there is no adapter method or endpoint and `loadPage` stays client-side (trust stays null).
 */
export default function RegistryCatalog() {
  const m = useMessages(ADMIN_MESSAGES);
  const { lang } = useI18n();
  const { registry, pageParam, setPage } = usePlatform();
  // §6.1 page keys (sort/page/focus): invalid wire values alert instead of substituting — same as EquipmentMaster.
  const focus = pageParam('focus');
  // #304 FIX1 (06 §19): the warning keeps each field's user name and the raw value as entered (quoted,
  // untruncated), one sentence per field — never `key=value`.
  const { urlState: tableUrlState, invalid: tableInvalid, sentences: invalidTableSentences } = useTableUrlState(SORT_FIELDS);
  // Every registered menu stays: planned, navHidden and other-permission rows included (design §1).
  const rows = useMemo(() => registry.menus.map(menu => toRegistryRow(menu, registry)), [registry]);
  // Full 8-key context, one badge per value — the PlannedPage capability list, copied inline (do not extract).
  const tone = { apply: 'success', reference: 'info', unsupported: 'neutral' } as const;
  const columns = useMemo<PlatformColumn<RegistryRow>[]>(() => [
    // #1167 B-2·UX-2: the declaration strings are long; one line with the full value in title (same pattern as AuditTrail reason).
    { id: 'id', header: 'ID', cell: row => <span className="t-mono block truncate" title={row.id}>{String(row.id)}</span> },
    { id: 'spaceId', header: m('registryCatalogSpace'), cell: row => row.spaceLabel[lang] },
    { id: 'groupId', header: m('registryCatalogGroup'), cell: row => <span className="t-mono">{String(row.groupId)}</span> },
    { id: 'path', header: 'Path', cell: row => <span className="t-mono block truncate" title={row.path}>{String(row.path)}</span> },
    { id: 'permission', header: m('registryCatalogPermission'), cell: row => <span className="t-mono">{String(row.permission)}</span> },
    { id: 'capabilities', header: m('registryCatalogContext'), cell: row => <span className="block truncate" title={row.capabilities}>{row.capabilities}</span> },
    { id: 'pageKeys', header: m('registryCatalogPageKeys'), cell: row => <span className="t-mono block truncate" title={row.pageKeys}>{String(row.pageKeys)}</span> },
    { id: 'contextResetKeys', header: m('registryCatalogResetKeys'), cell: row => <span className="t-mono block truncate" title={row.contextResetKeys}>{String(row.contextResetKeys)}</span> },
    { id: 'status', header: m('registryCatalogStatus'), cell: row => STATUS[row.status][lang] },
  ], [m, lang]);
  const menu = focus ? registry.menus.find(m => m.id === focus) : undefined;
  // Computed outside JSX children: a multi-line JSX ternary in children is a parser trap.
  const drawer = focus ? (menu
    ? <DetailDrawer key={menu.id} title={<span className="t-mono">{menu.id}</span>} subtitle={menu.label[lang]}
        onClose={() => setPage({ focus: null })}
        tabs={[{ id: 'declaration', label: m('registryCatalogDeclaration'), content: <div className="grid gap-3">
          <dl className="grid grid-cols-[9rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-text-muted">{m('registryCatalogLabel')}</dt><dd>{menu.label[lang]}</dd>
            <dt className="text-text-muted">{m('registryCatalogDescription')}</dt><dd>{menu.description[lang]}</dd>
            <dt className="text-text-muted">requiresScope</dt><dd className="t-mono">{String(menu.requiresScope)}</dd>
            <dt className="text-text-muted">{m('registryCatalogPageType')}</dt><dd>{PAGE_TYPE_LABELS[menu.pageType][lang]}</dd>
            <dt className="text-text-muted">{m('registryCatalogFeatures')}</dt><dd className="t-mono">{Object.entries(menu.features).map(([k, v]) => `${k}: ${v}`).join(', ')}</dd>
            <dt className="text-text-muted">navHidden</dt><dd className="t-mono">{String(!!menu.navHidden)}</dd>
            <dt className="text-text-muted">parent</dt><dd className="t-mono">{menu.parent ?? '—'}</dd>
            <dt className="text-text-muted">primary</dt><dd className="t-mono">{String(!!menu.primary)}</dd>
            <dt className="text-text-muted">initializesMetric</dt><dd className="t-mono">{String(!!menu.initializesMetric)}</dd>
            <dt className="text-text-muted">{m('registryCatalogPageKeys2')}</dt><dd className="t-mono">{menu.pageKeys.join(', ') || '—'}</dd>
            <dt className="text-text-muted">{m('registryCatalogResetKeys2')}</dt><dd className="t-mono">{(menu.contextResetKeys ?? []).join(', ') || '—'}</dd>
          </dl>
          <ul className="grid grid-cols-2 gap-1.5 text-sm">
            {(Object.keys(menu.context) as (keyof typeof menu.context)[]).map(k => <li key={k} className="flex items-center justify-between rounded-sm bg-surface-sunken px-2 py-1">
              <span>{CONTEXT_LABELS[k][lang]}</span><StatusBadge tone={tone[menu.context[k]]}>{menu.context[k]}</StatusBadge>
            </li>)}
          </ul>
        </div> }]} />
    : <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />}
        title={m('registryCatalogThisMenuIsNotRegistered')}
        body={m('registryCatalogIsNotARegisteredMenuPick', { focus })}
        action={<Button size="sm" variant="secondary" onClick={() => setPage({ focus: null })}>{m('registryCatalogClose')}</Button>} />) : null;
  return <PlatformPage description={m('registryCatalogRegisteredMenuDeclarationsReadOnly')}>
    {/* #1167 B-1: the page head already shows this title; keep it for the outline only, the table's name is ariaLabel. */}
    {tableInvalid ? <TableUrlWarning sentences={invalidTableSentences} />
      : <PlatformDataTable<RegistryRow>
          title={m('registryCatalogMenuRegistry')}
          hideTitle
          ariaLabel={m('registryCatalogMenuRegistryList')}
          subtitle={m('registryCatalogAllRegisteredMenusPlannedAndHiddenIncluded')}
          columns={columns} getRowId={row => row.id}
          preferenceKey="admin-registry:columns:v1" pageSize={25} activeRowId={focus}
          urlState={tableUrlState}
          rowAction={(row, { compact }) => <RowAction compact={compact} icon={PanelRight} label={m('registryCatalogView', { id: row.id })} text={m('registryCatalogView2')} onClick={() => setPage({ focus: row.id })} />}
          loadPage={async page => {
            // Client envelope: the rows are the registry projection, not a server result — trust is null.
            const paged = sortAndPage(rows, page);
            return { outcome: paged.total ? 'ok' : 'empty', data: paged, assessments: [], trust: null, correlationId: 'client-registry' };
          }}
        />}
    {drawer}
  </PlatformPage>;
}
