import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkOptions } from '@ap/kernel';
import type { PlatformColumn } from '@ap/components';
import type { CatalogRow } from '../endpoints';
import MetricCatalogPage from './MetricCatalog';

const mode = vi.hoisted(() => ({ compact: false }));
const origin = '/metrics?v=1&q=time&sort=nameSort:asc';
const row: CatalogRow = {
  metricId: 'cycle_time', nameKo: '사이클타임', nameEn: 'Cycle time', nameSort: 'cycle_time',
  domain: 'time', grain: 'equipment × hour', numerator: 'run_minutes', denominator: 'runs',
  publishedPointer: '3', catalogVersion: '3', draftVersion: '4', status: 'published',
  ownerId: 'u1', owner: '생산팀', updatedAt: '2026-10-01T09:30:00+09:00',
};

vi.mock('@ap/kernel', () => ({
  CONTEXT_LABELS: { time: { ko: '기간' }, lot: { ko: 'Lot' }, roomNames: { ko: 'room_name' }, condition: { ko: '그룹 조건' }, selection: { ko: '설비 선택' } },
  topicParticle: () => '은',
  PlatformLink: ({ href, children, 'aria-label': label }: { href: string; children: ReactNode; 'aria-label'?: string }) => <a href={href} aria-label={label}>{children}</a>,
  useI18n: () => ({ lang: 'ko', tx: (text: { ko: string }) => text.ko, t: (key: string) => key }),
  usePlatform: () => ({
    global: { selection: null }, pageParam: () => null, setPage: vi.fn(),
    linkTo: (_id: string, options: LinkOptions = {}) => {
      const query = new URLSearchParams({ v: '1', ...options.page });
      if (options.returnTo) query.set('returnTo', origin);
      return `/metrics/${options.params?.metricId}?${query}`;
    },
  }),
  useMenuQuery: () => ({}), useMenuFetch: () => ({ fetch: vi.fn() }),
}));
vi.mock('@ap/components', async importOriginal => ({
  ...await importOriginal<typeof import('@ap/components')>(),
  PlatformPage: ({ children }: { children: ReactNode }) => <>{children}</>,
  QueryView: () => null,
  PlatformDataTable: ({ columns, rowAction }: { columns: PlatformColumn<CatalogRow>[]; rowAction: (row: CatalogRow, context: { compact: boolean }) => ReactNode }) =>
    <>{columns.find(column => column.id === 'metricId')!.cell!(row)}{rowAction(row, { compact: mode.compact })}</>,
}));

describe('catalog detail entry links (#298, 06 §22)', () => {
  beforeEach(() => { mode.compact = false; });
  it.each([
    ['cycle_time', '3'], ['정의', '3'], ['초안 v4', '4'],
  ])('%s carries the origin URL and destination version', (label, version) => {
    const html = renderToStaticMarkup(<MetricCatalogPage params={{}} />);
    const links = [...html.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)];
    const href = links.find(([, , text]) => text === label)?.[1];
    expect(href).toBeDefined();
    const url = new URL(href!.replaceAll('&amp;', '&'), 'https://platform.test');
    expect(url.pathname).toBe('/metrics/cycle_time');
    expect(url.searchParams.get('version')).toBe(version);
    expect(url.searchParams.get('returnTo')).toBe(origin);
  });

  it.each([
    ['정의', '3'], ['초안 v4', '4'],
  ])('compact: the %s icon link keeps its name, no visible text, and the destination version', (label, version) => {
    mode.compact = true;
    const html = renderToStaticMarkup(<MetricCatalogPage params={{}} />);
    const anchor = [...html.matchAll(/<a [^>]*aria-label="([^"]+)"[^>]*>(.*?)<\/a>/g)].find(([, name]) => name === label);
    expect(anchor).toBeDefined();
    expect(anchor![2]).toContain('<svg');
    expect(anchor![2].replace(/<svg.*<\/svg>/, '')).toBe('');
    const href = anchor![0].match(/href="([^"]+)"/)![1];
    const url = new URL(href.replaceAll('&amp;', '&'), 'https://platform.test');
    expect(url.searchParams.get('version')).toBe(version);
    expect(url.searchParams.get('returnTo')).toBe(origin);
  });
});
