import { useCallback, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { PlatformDataTable, type PageQuery } from '../platform/PlatformDataTable';
import { DetailDrawer } from '../platform/DetailDrawer';
import type { FixtureRow } from './types';
const columns: ColumnDef<FixtureRow>[] = [
  { accessorKey: 'id', header: 'id' },
  { accessorKey: 'numericValue', header: 'numericValue', cell: ({ row }) => <span className="numeric">{row.original.numericValue.toFixed(2)}</span> },
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
  const rowAction = useCallback((row: FixtureRow) => <button aria-label={`Open ${row.id}`} onClick={() => setDetail(row)}>Details</button>, []);
  return <main><header><p className="eyebrow">PLATFORM COMPONENT LAB · UNIT C</p><h1>PlatformDataTable + DetailDrawer</h1><p>합성 fixture, 실제 메뉴 아님 · Synthetic values only · No CRUD</p><p>Context: synthetic-session · Read-only · 2,000 server rows / 250 per response</p></header>
    <PlatformDataTable ariaLabel="Synthetic values" pageSize={250} columns={columns} getRowId={getRowId} loadPage={loadPage} filter={category} preferenceKey="unit-c:columns:v1" rowAction={rowAction} onExport={() => setNotice('Export entry only: format and delivery are not connected.')} filterControl={<label>Category <select aria-label="Category" value={category} onChange={e => setCategory(e.target.value)}><option value="">All</option>{['A', 'B', 'C', 'D'].map(value => <option key={value}>{value}</option>)}</select></label>} />
    {notice && <p role="status">{notice}</p>}
    {detail && <DetailDrawer key={detail.id} title={detail.id} context="Context: synthetic-session" onClose={() => setDetail(null)} tabs={[
      { id: 'details', label: 'Details', content: <dl>{Object.entries(detail).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl> },
      { id: 'audit', label: 'Audit', content: <p>Audit placeholder: no real audit data is connected.</p> },
    ]} />}
  </main>;
}
