import { useRef, useState } from 'react';
import { Archive, Replace } from 'lucide-react';
import { useMenuAction, usePlatform } from '@ap/kernel';
import { PlatformDataTable, RowAction, type PlatformColumn } from '@ap/components';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Callout, EmptyState, FieldList, FieldRow, StatusBadge } from '@ap/ui';
import { WINDOW_IMPORT_PERMISSION, replaceSampleWindow, retireSampleWindow, type SampleWindowRow } from '../../endpoints';
import { WINDOW_STATE_LABEL, WINDOW_STATE_TONE, rangeShort, windowHex } from '../../model/onboarding';
import { ImportWindowControl } from './ImportWindow';
import { NoBreakStamps, ShortRange } from './WallClock';
import type { EquipmentData } from './useEquipment';

const COLUMNS: PlatformColumn<SampleWindowRow>[] = [
  { id: 'range', header: '시간 구간', size: 200, value: (row) => row.from, cell: (row) => <span className="text-xs tabular-nums"><ShortRange from={row.from} to={row.to} /></span> },
  { id: 'dataGeneration', header: 'Generation', size: 120, value: (row) => row.dataGeneration },
  { id: 'state', header: '상태', size: 110, value: (row) => row.state, exportValue: (row) => WINDOW_STATE_LABEL[row.state], cell: (row) => <StatusBadge tone={WINDOW_STATE_TONE[row.state]}>{WINDOW_STATE_LABEL[row.state]}</StatusBadge> },
  { id: 'occurrences', header: '이벤트', size: 90, align: 'right', value: (row) => row.occurrences },
  { id: 'mappingCount', header: '사용 Mapping', size: 110, align: 'right', value: (row) => row.mappingCount, cell: (row) => `${row.mappingCount}개` },
  { id: 'timeDomain', header: 'timeDomain', size: 120, value: (row) => row.timeDomain },
];

type Ask = { kind: 'replace' | 'retire'; row: SampleWindowRow };

/** Sample Windows of the equipment (EV ADR-0010): immutable; a reprocessed generation replaces one, and an unused one can be retired (EV#105). */
export function DataTab({ data }: { data: EquipmentData }) {
  const { can, toast } = usePlatform();
  const canWindows = can(WINDOW_IMPORT_PERMISSION);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const replace = useMenuAction(replaceSampleWindow);
  const retire = useMenuAction(retireSampleWindow);
  const busy = replace.pending || retire.pending;
  const confirm = async () => {
    if (!ask) return;
    setError(null);
    const input = { equipmentId: data.equipment.equipmentId, windowHash: windowHex(ask.row.hash) };
    try {
      const result = ask.kind === 'replace' ? await replace.run(input) : await retire.run(input);
      if (result.outcome === 'ok') { setAsk(null); toast(ask.kind === 'replace' ? 'Sample Window를 교체했습니다' : 'Sample Window를 퇴역했습니다', 'info'); }
      else setError(result.outcome === 'forbidden' ? '권한이 없어 바꾸지 못했습니다.' : '바꾸지 못했습니다.');
    } catch { setError('바꾸지 못했습니다.'); }
  };
  const importControl = <ImportWindowControl equipmentId={data.equipment.equipmentId} windows={data.windows} />;
  if (data.windows.length === 0) return <div className="p-4"><EmptyState title="Sample Window가 없습니다" body="원천 변환기가 만든 *.batch.json을 가져오세요." action={importControl} /></div>;
  // The spec's place (a-data.png): the import sits right above the table.
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
    <div className="flex shrink-0 justify-end">{importControl}</div>
    <PlatformDataTable title="Sample Windows" ariaLabel="Sample Windows" fill rows={data.windows} columns={COLUMNS} getRowId={(row) => row.hash} preferenceKey="eqv-onboarding-windows"
      isRowMuted={(row) => row.state === 'replaced' || row.state === 'retired'}
      rowAction={canWindows ? (row, { compact }) => (row.state === 'staged'
        ? <RowAction compact={compact} icon={Replace} label={`${rangeShort(row.from, row.to)} ${row.dataGeneration}로 교체`} text="교체" onClick={() => { setError(null); setAsk({ kind: 'replace', row }); }} />
        : row.state === 'active' ? <RowAction compact={compact} icon={Archive} label={`${rangeShort(row.from, row.to)} 퇴역`} text="퇴역" onClick={() => { setError(null); setAsk({ kind: 'retire', row }); }} />
          : <span className="text-xs text-text-muted">—</span>) : undefined} />
    {ask && <WindowConfirm ask={ask} replaced={data.windows.find((w) => w.hash === ask.row.counterpart) ?? null} busy={busy} error={error} onConfirm={() => void confirm()} onCancel={() => setAsk(null)} />}
  </div>;
}

function WindowConfirm({ ask, replaced, busy, error, onConfirm, onCancel }: { ask: Ask; replaced: SampleWindowRow | null; busy: boolean; error: string | null; onConfirm(): void; onCancel(): void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  const { row } = ask;
  return <AlertDialog open onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
    <AlertDialogContent className="break-keep" onOpenAutoFocus={(event) => { event.preventDefault(); cancel.current?.focus(); }}>
      <AlertDialogHeader>
        <AlertDialogTitle>{ask.kind === 'replace' ? 'Sample Window를 교체할까요?' : 'Sample Window를 퇴역할까요?'}</AlertDialogTitle>
        <AlertDialogDescription>{ask.kind === 'replace'
          ? '다시 처리한 Data Generation이 같은 구간의 window를 대신합니다. 이미 게시한 Mapping Version의 Baseline Inventory는 바뀌지 않습니다.'
          : '퇴역한 window는 Inventory와 검증에 쓰지 않습니다. 이미 게시한 Mapping Version의 Baseline Inventory는 남습니다. 되돌릴 수 없습니다.'}</AlertDialogDescription>
      </AlertDialogHeader>
      <FieldList>
        <FieldRow layout="property" label="구간"><NoBreakStamps text={`${row.from} – ${row.to}`} /></FieldRow>
        <FieldRow layout="property" label="Generation" mono>{replaced ? `${replaced.dataGeneration} → ${row.dataGeneration}` : row.dataGeneration}</FieldRow>
        <FieldRow layout="property" label="사용 Mapping">{`${(replaced ?? row).mappingCount}개`}</FieldRow>
      </FieldList>
      {error && <Callout tone="red"><span role="alert">{error}</span></Callout>}
      <AlertDialogFooter>
        <Button ref={cancel} size="toolbar" variant="secondary" disabled={busy} onClick={onCancel}>취소</Button>
        <Button size="toolbar" variant={ask.kind === 'retire' ? 'destructive' : 'primary'} disabled={busy} onClick={onConfirm}>{ask.kind === 'replace' ? '교체' : '퇴역'}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
