import { RotateCw } from 'lucide-react';
import { PlatformPage, LoadingBlock, StateMessage } from '@ap/components';
import { useI18n, usePlatform } from '@ap/kernel';
import { FeatureBridge, useSystemsOverview } from '@ap/feature-bridge';
import { Button, StatusBadge } from '@ap/ui';
import { systemRows, type SystemRow } from '../system-rows';

type Copy = { ko: string; en: string };
const HEADERS: readonly Copy[] = [{ ko: '업무 시스템', en: 'Business system' }, { ko: '추적 시스템', en: 'Tracked system' }, { ko: '연결 상태', en: 'Link' }];

function LinkState({ row, lang }: { row: SystemRow; lang: 'ko' | 'en' }) {
  const ko = lang === 'ko';
  if (row.kind === 'platform') return <StatusBadge tone="info">{ko ? '플랫폼 기본' : 'Platform default'}</StatusBadge>;
  if (row.kind === 'manual') return <StatusBadge tone="neutral">{ko ? '플랫폼 밖' : 'Outside the platform'}</StatusBadge>;
  return row.link === 'connected'
    ? <StatusBadge tone="success" dot>{ko ? '연결됨' : 'Linked'}</StatusBadge>
    : <StatusBadge tone="warning" dot>{ko ? '연결 끊김' : 'Disconnected'}</StatusBadge>;
}

/** The business-system cell: the Registry's label, the space id when the Registry does not hold the space, a dash for rows with no space. */
function SpaceCell({ row, lang, tx }: { row: SystemRow; lang: 'ko' | 'en'; tx: (text: Copy) => string }) {
  if (row.spaceId === null) return <span className="text-text-muted">—</span>;
  if (row.spaceLabel !== null) return <>{tx(row.spaceLabel)}</>;
  return <><span className="t-mono">{row.spaceId}</span><span className="ml-2 text-xs text-text-muted">{lang === 'ko' ? '등록되지 않은 업무 시스템' : 'Not in the Registry'}</span></>;
}

function SystemsTable() {
  const { lang, tx } = useI18n();
  const { registry } = usePlatform();
  const { status, data, refetch } = useSystemsOverview();
  const ko = lang === 'ko';
  if (status === 'pending') return <LoadingBlock rows={4} />;
  if (status === 'error' || data === undefined) {
    return <StateMessage tone="danger" icon={<RotateCw className="size-4" aria-hidden />} title={ko ? '시스템을 불러오지 못했습니다' : 'Could not load the systems'}
      body={ko ? '서버에서 연결 목록을 읽지 못했습니다. 잠시 뒤 다시 시도하세요.' : 'The link list could not be read from the server. Try again in a moment.'}
      action={<Button size="sm" variant="secondary" onClick={refetch}><RotateCw className="size-3.5" aria-hidden />{ko ? '다시 시도' : 'Retry'}</Button>} />;
  }
  const rows = systemRows(data, registry.spaces);
  if (rows.length === 0) {
    return <StateMessage icon={<RotateCw className="size-4" aria-hidden />} title={ko ? '등록된 시스템이 없습니다' : 'No systems are registered'}
      body={ko ? '업무 시스템이 서버 시작 때 등록되면 여기에 보입니다.' : 'Business systems appear here once the server registers them at startup.'} />;
  }
  return <table className="w-full text-sm">
    <caption className="sr-only">{ko ? '업무 시스템과 추적 시스템의 연결' : 'Business systems and their tracked systems'}</caption>
    <thead><tr className="t-table-header text-left text-text-muted">{HEADERS.map(header => <th key={header.en} scope="col" className="py-1 pr-3 font-semibold">{tx(header)}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.key} data-kind={row.kind} className="border-t border-border-subtle">
      <td className="py-2 pr-3"><SpaceCell row={row} lang={lang} tx={tx} /></td>
      <td className="py-2 pr-3">
        {row.systemName ?? <span className="text-text-muted">{ko ? '(목록에 없음)' : '(not in the list)'}</span>}
        {row.kind === 'platform' && <span className="ml-2 text-xs text-text-muted">{ko ? '공간이 없는 화면의 VOC 기본' : 'Default for screens without a space'}</span>}
        {row.archived && <span className="ml-2 text-xs text-text-muted">{ko ? '보관됨' : 'Archived'}</span>}
      </td>
      <td className="py-2"><LinkState row={row} lang={lang} /></td>
    </tr>)}</tbody>
  </table>;
}

/** 시스템 (#1289 node j): read-only list of the business systems' tracked systems and link state, through the feature bridge. */
export default function SystemsScreen() {
  return <PlatformPage>
    <FeatureBridge><SystemsTable /></FeatureBridge>
  </PlatformPage>;
}
