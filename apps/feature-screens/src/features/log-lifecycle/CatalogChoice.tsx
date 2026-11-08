import { useState } from 'react';
import { Button, Input } from '@ap/ui';
import type { Page, ScreenProps } from './contracts';
import { Choice, Disclosure, ReadView } from './presentation';

/** Search and page the existing authorized catalog; never enumerate an entire catalog for a filter. */
export function CatalogChoice({ api, name, label, value, onChange }: Pick<ScreenProps, 'api'> & { name: 'vendors' | 'processes'; label: string; value: string; onChange(value: string): void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const data = api.useRead<Page<{ id: string; name: string }>>(name, { q: q || null, page, pageSize: 25 });
  return <Disclosure label={`${label}${value !== 'all' ? ' · 적용 중' : ''}`}><div className="mt-2 grid gap-2"><Input inputSize="toolbar" aria-label={`${label} 검색`} value={q} onChange={e => { setQ(e.target.value); setPage(0); }} /><ReadView query={data}>{d => <><Choice label={label} value={value} onChange={onChange} options={[[ 'all', '전체' ], ...(value !== 'all' && !d.rows.some(r => r.id === value) ? [[value, '선택한 항목'] as const] : []), ...d.rows.map(r => [r.id, r.name] as const)]} /><div className="flex gap-2"><Button variant="secondary" size="toolbar" disabled={page === 0} onClick={() => setPage(p => p - 1)}>이전 {label}</Button><Button variant="secondary" size="toolbar" disabled={(page + 1) * 25 >= d.total} onClick={() => setPage(p => p + 1)}>다음 {label}</Button></div></>}</ReadView></div></Disclosure>;
}
