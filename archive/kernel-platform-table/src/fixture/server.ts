// Node-only fixture. Never import this module from a browser entry.
import type { FixtureRow } from './types';
const rows: FixtureRow[] = Array.from({ length: 2000 }, (_, i) => ({
  id: `row-${String(i + 1).padStart(4, '0')}`, numericValue: (i * 137) % 2000,
  category: ['A', 'B', 'C', 'D'][i % 4], updatedAt: '2026-09-25T00:00:00Z',
}));
export function queryFixture(params: URLSearchParams) {
  const page = Number(params.get('page') ?? 0);
  const size = Number(params.get('pageSize') ?? 250);
  const sort = params.get('sort') || 'id';
  const category = params.get('category') || '';
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 250 ||
    !['id', 'numericValue', 'category', 'updatedAt'].includes(sort) || !['', 'A', 'B', 'C', 'D'].includes(category)) throw new Error('Invalid fixture query');
  const filtered = rows.filter(row => !category || row.category === category);
  const key = sort as keyof FixtureRow;
  filtered.sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : a.id.localeCompare(b.id)) * (params.get('desc') === 'true' ? -1 : 1));
  return { rows: filtered.slice(page * size, (page + 1) * size), total: filtered.length };
}
