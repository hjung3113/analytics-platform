import { useCallback, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PlatformDataTable, type PageQuery } from '../platform/PlatformDataTable';
import { DetailDrawer } from '../platform/DetailDrawer';
import { Button } from '../ui/components/Button';
import { Label } from '../ui/components/shadcn/label';
import type { FixtureRow } from './types';
const columns: ColumnDef<FixtureRow>[] = [
  { accessorKey: 'id', header: 'id' },
  { accessorKey: 'numericValue', header: 'numericValue', cell: ({ row }) => <span className="numeric block w-full text-right tabular-nums">{row.original.numericValue.toFixed(2)}</span> },
  { accessorKey: 'category', header: 'category' },
  { accessorKey: 'updatedAt', header: 'updatedAt', size: 250 },
];
const getRowId = (row: FixtureRow) => row.id;
async function loadPage(query: PageQuery, signal: AbortSignal) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize), sort: query.sorting[0]?.id || 'id', desc: String(query.sorting[0]?.desc || false), category: query.filter });
  const response = await fetch(`/api/rows?${params}`, { signal });
  if (!response.ok) throw new Error('Fixture request failed');
  return response.json();
}
export function App() {
  const [category, setCategory] = useState('');
  const [detail, setDetail] = useState<FixtureRow | null>(null);
  const [notice, setNotice] = useState('');
  const rowAction = useCallback((row: FixtureRow) => <Button variant="outline" size="sm" className="h-6 px-2" aria-label={`Open ${row.id}`} onClick={() => setDetail(row)}>Details</Button>, []);
  return <main className="mx-auto max-w-[1440px] p-6"><header className="mb-4 space-y-1"><p className="text-xs font-medium tracking-wide text-text-muted">PLATFORM COMPONENT LAB · UNIT C</p><h1 className="text-2xl font-semibold text-text-primary">PlatformDataTable + DetailDrawer</h1><p className="text-text-secondary">합성 fixture, 실제 메뉴 아님 · Synthetic values only · No CRUD</p><p className="text-text-secondary">Context: synthetic-session · Read-only · 2,000 server rows / 250 per response</p></header>
    <PlatformDataTable ariaLabel="Synthetic values" pageSize={250} columns={columns} getRowId={getRowId} loadPage={loadPage} filter={category} preferenceKey="unit-c:columns:v1" rowAction={rowAction} onExport={() => setNotice('Export entry only: format and delivery are not connected.')} filterControl={<Label className="flex items-center gap-2">Category <select aria-label="Category" value={category} className="h-8 rounded-md border border-border-subtle bg-surface-field-filled px-2 text-sm font-normal text-text-primary" onChange={e => setCategory(e.target.value)}><option value="">All</option>{['A', 'B', 'C', 'D'].map(value => <option key={value}>{value}</option>)}</select></Label>} />
    {notice && <p role="status" className="mt-3 text-text-secondary">{notice}</p>}
    {detail && <DetailDrawer key={detail.id} title={detail.id} context="Context: synthetic-session" onClose={() => setDetail(null)} tabs={[
      { id: 'details', label: 'Details', content: <dl>{Object.entries(detail).map(([key, value]) => <div key={key} className="mt-4"><dt className="font-semibold">{key}</dt><dd className="mt-1 [overflow-wrap:anywhere]">{value}</dd></div>)}</dl> },
      { id: 'audit', label: 'Audit', content: <p className="mt-4 text-text-muted">Audit placeholder: no real audit data is connected.</p> },
    ]} />}
  </main>;
}
