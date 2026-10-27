// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Gauge } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, type LinkOptions } from '@ap/kernel';
import { testAdapter } from '@ap/kernel/testing';
import type { PlatformColumn } from '@ap/components';
import type { CatalogRow } from '../endpoints';
import { manifests } from '../index';
import MetricCatalogPage from './MetricCatalog';
import { groupId, spaceId } from '@ap/contracts';
import { PERMISSION } from '../permission';

const mode = vi.hoisted(() => ({ compact: false }));
const origin = '/metrics?v=1&q=time&sort=nameSort:asc';
const registry = createRegistry({
  permissions: [PERMISSION],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'metric-catalog' }],
  groups: [{ id: groupId('metrics'), label: { ko: '지표관리', en: 'Metrics' }, icon: Gauge, space: spaceId('mars') }],
  menus: manifests,
});
const adapter = testAdapter();
const row: CatalogRow = {
  metricId: 'cycle_time', nameKo: '사이클타임', nameEn: 'Cycle time', nameSort: 'cycle_time',
  domain: 'time', grain: 'equipment × hour', numerator: 'run_minutes', denominator: 'runs',
  publishedPointer: '3', catalogVersion: '3', draftVersion: '4', status: 'published',
  ownerId: 'u1', owner: '생산팀', updatedAt: '2026-10-01T09:30:00+09:00',
};

function renderPageAnchors(): { href: string | null; label: string | null; text: string; hasSvg: boolean }[] {
  const { container, unmount } = render(
    <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><MetricCatalogPage params={{}} /></PlatformProvider></I18nProvider>,
  );
  const anchors = [...container.querySelectorAll('a')].map(anchor => ({
    href: anchor.getAttribute('href'),
    label: anchor.getAttribute('aria-label'),
    text: anchor.textContent?.trim() ?? '',
    hasSvg: anchor.querySelector('svg') !== null,
  }));
  unmount();
  return anchors;
}

vi.mock('@ap/kernel', async importOriginal => ({
  ...await importOriginal<typeof import('@ap/kernel')>(),
  useI18n: () => ({ lang: 'ko', tx: (text: { ko: string }) => text.ko, t: (key: string) => key }),
  usePlatform: () => ({
    global: { selection: null }, pageParam: () => null, setPage: vi.fn(),
    location: { href: (href: string) => href }, pathname: '/metrics', navigate: vi.fn(),
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
    const anchors = renderPageAnchors();
    const href = anchors.find(anchor => anchor.text === label)?.href;
    expect(href).toBeDefined();
    const url = new URL(href!, 'https://platform.test');
    expect(url.pathname).toBe('/metrics/cycle_time');
    expect(url.searchParams.get('version')).toBe(version);
    expect(url.searchParams.get('returnTo')).toBe(origin);
  });

  it.each([
    ['정의', '3'], ['초안 v4', '4'],
  ])('compact: the %s icon link keeps its name, no visible text, and the destination version', (label, version) => {
    mode.compact = true;
    const anchors = renderPageAnchors();
    const anchor = anchors.find(candidate => candidate.label === label);
    expect(anchor).toBeDefined();
    expect(anchor!.hasSvg).toBe(true);
    expect(anchor!.text).toBe('');
    const url = new URL(anchor!.href!, 'https://platform.test');
    expect(url.searchParams.get('version')).toBe(version);
    expect(url.searchParams.get('returnTo')).toBe(origin);
  });
});
