import { useMemo } from 'react';
import { compareNatural, resolveRole, type InventoryAlias } from '@eqv/core';
import { PlatformDataTable, type PlatformColumn } from '@ap/components';
import { EmptyState, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger } from '@ap/ui';
import type { EquipmentData } from './useEquipment';
import { ShortWallClock } from './WallClock';

type AliasRow = InventoryAlias & { role: string };
type TransferRow = { from: string; to: string; count: number };

// An omitted flag is absent evidence, not `false`.
const flag = (value: boolean | undefined) => (value === undefined ? '—' : value ? '예' : '아니요');

const ALIAS_COLUMNS: PlatformColumn<AliasRow>[] = [
  { id: 'alias', header: 'alias', size: 130, value: (row) => row.alias },
  { id: 'moduleType', header: 'ModuleType', size: 150, value: (row) => row.moduleType ?? null, cell: (row) => row.moduleType ?? '—' },
  { id: 'role', header: 'Role', size: 100, value: (row) => row.role, cell: (row) => (row.role === 'unknown' ? <StatusBadge tone="warning">unknown</StatusBadge> : row.role) },
  { id: 'flags', header: 'Port / Robot', size: 140, sortable: false, value: (row) => `${flag(row.isPort)} / ${flag(row.isRobot)}` },
  { id: 'references', header: '참조', size: 80, align: 'right', value: (row) => row.references },
  { id: 'slots', header: 'slots', size: 90, sortable: false, value: (row) => (row.slots.length ? row.slots.join(', ') : '—') },
  { id: 'activity', header: '활동', size: 214, sortable: false, value: (row) => row.activity.map(({ kind, count }) => `${kind} ${count}`).join(' · ') || '—' },
  {
    id: 'seen', header: '처음 / 마지막 관측', size: 170, value: (row) => row.firstSeen,
    cell: (row) => <span className="text-xs tabular-nums"><span className="block">{row.firstSeen ? <ShortWallClock value={row.firstSeen} /> : '—'}</span><span className="block">{row.lastSeen ? <ShortWallClock value={row.lastSeen} /> : '—'}</span></span>,
  },
];
const TRANSFER_COLUMNS: PlatformColumn<TransferRow>[] = [
  { id: 'pair', header: 'from → to', size: 240, value: (row) => `${row.from} → ${row.to}` },
  { id: 'count', header: '건수', size: 90, align: 'right', value: (row) => row.count },
];

/** ② Observed Inventory of the selected window: aliases (Role from the Type Dictionaries, `unknown` first) and observed transfer pairs. */
export function InventoryTab({ data }: { data: EquipmentData }) {
  const { inventory, dictionaries } = data;
  const rows = useMemo(() => (inventory ? inventory.aliases.map((row): AliasRow => ({ ...row, role: row.moduleType === undefined ? 'unknown' : resolveRole([...dictionaries], row.moduleType) }))
    .sort((a, b) => Number(b.role === 'unknown') - Number(a.role === 'unknown') || compareNatural(a.alias, b.alias)) : []), [inventory, dictionaries]);
  if (!inventory) return <div className="p-4"><EmptyState title="관측된 Sample Window가 없습니다" /></div>;
  return <div className="flex min-h-0 flex-1 flex-col p-4 pt-2"><Tabs defaultValue="aliases" className="flex min-h-0 flex-1 flex-col">
    <TabsList aria-label="Inventory 보기" className="h-11 shrink-0"><TabsTrigger value="aliases">관측 Inventory</TabsTrigger><TabsTrigger value="transfers">관측된 이송</TabsTrigger></TabsList>
    <TabsContent value="aliases" className="m-0 flex min-h-0 flex-1 flex-col">
      <PlatformDataTable title="관측 Inventory" hideTitle ariaLabel="관측 Inventory" fill rows={rows} columns={ALIAS_COLUMNS} getRowId={(row) => row.alias} preferenceKey="eqv-onboarding-inventory"
        subtitle={`표본 기간 ${inventory.from} – ${inventory.to}`} />
    </TabsContent>
    <TabsContent value="transfers" className="m-0 flex min-h-0 flex-1 flex-col">
      <PlatformDataTable title="관측된 이송" hideTitle ariaLabel="관측된 이송" fill rows={inventory.transfers} columns={TRANSFER_COLUMNS} getRowId={(row) => `${row.from}\u0000${row.to}`} preferenceKey="eqv-onboarding-transfers"
        subtitle="공간 정보 없는 관측 쌍입니다. 경로나 궤적이 아닙니다." />
    </TabsContent>
  </Tabs></div>;
}
