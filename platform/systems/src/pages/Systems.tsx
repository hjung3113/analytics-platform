import { formatText, useMessages, useI18n, usePlatform } from '@ap/kernel';
import { SYSTEMS_MESSAGES } from '../messages';
import { RotateCw } from 'lucide-react';
import { PlatformPage, LoadingBlock, StateMessage, DetailDrawer } from '@ap/components';
import { FeatureBridge, useSystemsOverview } from '@ap/feature-bridge';
import { Button, StatusBadge } from '@ap/ui';
import { SystemVocPermissions, type SystemPermissionRow } from '@ap/feature-screens/operator-screens/managed-systems';
import { systemRows, type SystemRow } from '../system-rows';

type Copy = { ko: string; en: string };
const HEADERS: readonly Copy[] = [SYSTEMS_MESSAGES.systemsBusinessSystem, SYSTEMS_MESSAGES.systemsTrackedSystem, SYSTEMS_MESSAGES.systemsLink];

function LinkState({ row, lang }: { row: SystemRow; lang: 'ko' | 'en' }) {
  if (row.kind === 'platform') return <StatusBadge tone="info">{formatText(SYSTEMS_MESSAGES.systemsPlatformDefault, lang)}</StatusBadge>;
  if (row.kind === 'manual') return <StatusBadge tone="neutral">{formatText(SYSTEMS_MESSAGES.systemsOutsideThePlatform, lang)}</StatusBadge>;
  return row.link === 'connected'
    ? <StatusBadge tone="success" dot>{formatText(SYSTEMS_MESSAGES.systemsLinked, lang)}</StatusBadge>
    : <StatusBadge tone="warning" dot>{formatText(SYSTEMS_MESSAGES.systemsDisconnected, lang)}</StatusBadge>;
}

/** The business-system cell: the Registry's label, the space id when the Registry does not hold the space, a dash for rows with no space. */
function SpaceCell({ row, lang, tx }: { row: SystemRow; lang: 'ko' | 'en'; tx: (text: Copy) => string }) {
  if (row.spaceId === null) return <span className="text-text-muted">—</span>;
  if (row.spaceLabel !== null) return <>{tx(row.spaceLabel)}</>;
  return <><span className="t-mono">{row.spaceId}</span><span className="ml-2 text-xs text-text-muted">{formatText(SYSTEMS_MESSAGES.systemsNotInTheRegistry, lang)}</span></>;
}

function SystemsTable() {
  const m = useMessages(SYSTEMS_MESSAGES);
  const { lang, tx } = useI18n();
  const { registry } = usePlatform();
  const { status, data, refetch } = useSystemsOverview();
  if (status === 'pending') return <LoadingBlock rows={4} />;
  if (status === 'error' || data === undefined) {
    return <StateMessage tone="danger" icon={<RotateCw className="size-4" aria-hidden />} title={m('systemsCouldNotLoadTheSystems')}
      body={m('systemsTheLinkListCouldNotBeRead')}
      action={<Button size="sm" variant="secondary" onClick={refetch}><RotateCw className="size-3.5" aria-hidden />{m('systemsRetry')}</Button>} />;
  }
  const rows = systemRows(data, registry.spaces);
  if (rows.length === 0) {
    return <StateMessage icon={<RotateCw className="size-4" aria-hidden />} title={m('systemsNoSystemsAreRegistered')}
      body={m('systemsBusinessSystemsAppearHereOnceTheServer')} />;
  }
  const baseline = <table className="w-full text-sm">
    <caption className="sr-only">{m('systemsBusinessSystemsAndTheirTrackedSystems')}</caption>
    <thead><tr className="t-table-header text-left text-text-muted">{HEADERS.map(header => <th key={header.en} scope="col" className="py-1 pr-3 font-semibold">{tx(header)}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.key} data-kind={row.kind} className="border-t border-border-subtle">
      <td className="py-2 pr-3"><SpaceCell row={row} lang={lang} tx={tx} /></td>
      <td className="py-2 pr-3">
        {row.systemName ?? <span className="text-text-muted">{m('systemsNotInTheList')}</span>}
        {row.kind === 'platform' && <span className="ml-2 text-xs text-text-muted">{m('systemsDefaultForScreensWithoutASpace')}</span>}
        {row.archived && <span className="ml-2 text-xs text-text-muted">{m('systemsArchived')}</span>}
      </td>
      <td className="py-2"><LinkState row={row} lang={lang} /></td>
    </tr>)}</tbody>
  </table>;
  const permissionRows: SystemPermissionRow[] = rows.map(row => {
    const id = row.kind === 'platform' ? data.platformManagedSystemId
      : row.kind === 'space' ? data.links.find(link => link.spaceId === row.spaceId)?.managedSystemId
      : row.key.slice('manual:'.length);
    return {
      key: row.key, id: id ?? row.key, name: row.systemName ?? m('systemsNotInTheList2'),
      kind: row.kind, platform: row.kind === 'platform', archived: row.archived,
      business: <SpaceCell row={row} lang={lang} tx={tx} />, link: <LinkState row={row} lang={lang} />,
    };
  });
  return <SystemVocPermissions rows={permissionRows} fallback={baseline} renderDetail={parts => <DetailDrawer id={parts.id} title={parts.title} copyPage={null} subtitle={parts.subtitle} onClose={parts.requestClose} tabs={[{ id: 'voc', label: 'VOC 등록 권한', content: parts.body }]} />} />;
}

/** 시스템 (#1289 node j): business systems, tracked systems and link state, with admin VOC creation settings through the feature bridge. */
export default function SystemsScreen() {
  return <PlatformPage>
    <FeatureBridge><SystemsTable /></FeatureBridge>
  </PlatformPage>;
}
