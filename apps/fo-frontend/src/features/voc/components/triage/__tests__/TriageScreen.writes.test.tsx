// TriageScreen.writes.test.tsx — #761 t: every URL write of the triage screen is a complete FeedbackOps href through
// the host seam. Each write carries the whole current search (managedSystem, returnTo, …) and changes only its own keys.

import { registerTriageTestHost } from '@/test/triage-host';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VocTriageScreenProps } from '../VocTriageScreen';

const navigateMock = vi.fn();
let searchState: Record<string, string> = {};
let screenProps: VocTriageScreenProps | null = null;

vi.mock('../VocTriageScreen', () => ({
  VocTriageScreen: (props: VocTriageScreenProps) => {
    screenProps = props;
    return <div data-testid="triage-screen-stub" />;
  },
}));
vi.mock('../../../hooks/useVocList', () => ({
  useVocList: () => ({ data: { items: [] }, isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/lib/api/nav', () => ({
  fetchNavCounts: vi.fn(async () => ({ counts: {} })),
}));
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useMeBridge: () => ({ isLoading: false }),
}));
vi.mock('@/lib/cross-system/usePermissionCheckBridge', () => ({
  usePermissionCheckBridge: () => ({ isPending: false, data: { state: 'approved' } }),
  permissionCheckQueryKey: () => ['permission-check', 'voc.triage', null],
}));

import { TriageScreen } from '../TriageScreen';

const SELECTED = '00000000-0000-4000-8000-000000000001';
const NEXT = '00000000-0000-4000-8000-000000000002';
const AREA = '00000000-0000-4000-8000-0000000000a1';

function mountScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TriageScreen />
    </QueryClientProvider>,
  );
  expect(screen.getByTestId('triage-screen-stub')).toBeInTheDocument();
  if (screenProps === null) throw new Error('screen props missing');
  return screenProps;
}

function lastWrite(): { search: URLSearchParams; options: unknown } {
  const [href, options] = navigateMock.mock.calls.at(-1) as [string, unknown];
  const [path, query] = href.split('?');
  expect(path).toBe('/vocs');
  return { search: new URLSearchParams(query), options };
}

beforeAll(() => registerTriageTestHost(() => searchState, navigateMock));

beforeEach(() => {
  navigateMock.mockClear();
  screenProps = null;
  searchState = {
    view: 'triage',
    managedSystem: 'ms-1',
    selected: SELECTED,
    returnTo: '/home',
  };
});

describe('TriageScreen URL writes', () => {
  it('area change sets the area, keeps selection and the rest, and pushes', () => {
    mountScreen().onAreaChange?.(AREA);
    const { search, options } = lastWrite();
    expect(Object.fromEntries(search)).toEqual({
      view: 'triage',
      managedSystem: 'ms-1',
      selected: SELECTED,
      returnTo: '/home',
      'filter.analytics_area': AREA,
    });
    expect(options).toBeUndefined();
  });

  it('area clear drops the area key and keeps the rest', () => {
    searchState = { ...searchState, 'filter.analytics_area': AREA };
    mountScreen().onAreaChange?.(undefined);
    const { search, options } = lastWrite();
    expect(search.has('filter.analytics_area')).toBe(false);
    expect(search.get('selected')).toBe(SELECTED);
    expect(search.get('managedSystem')).toBe('ms-1');
    expect(options).toBeUndefined();
  });

  it('tab change sets the tab, drops selected, keeps managedSystem and returnTo, and pushes', () => {
    mountScreen().onTabChange('high');
    const { search, options } = lastWrite();
    expect(Object.fromEntries(search)).toEqual({
      view: 'triage',
      managedSystem: 'ms-1',
      returnTo: '/home',
      tab: 'high',
    });
    expect(options).toBeUndefined();
  });

  it('select sets selected and pushes', () => {
    mountScreen().onSelectVoc(NEXT);
    const { search, options } = lastWrite();
    expect(search.get('selected')).toBe(NEXT);
    expect(search.get('managedSystem')).toBe('ms-1');
    expect(search.get('returnTo')).toBe('/home');
    expect(options).toBeUndefined();
  });

  it('advance to a VOC sets selected and replaces', () => {
    mountScreen().onAdvanceVoc?.(NEXT);
    const { search, options } = lastWrite();
    expect(search.get('selected')).toBe(NEXT);
    expect(search.get('managedSystem')).toBe('ms-1');
    expect(options).toEqual({ replace: true });
  });

  it('advance past the last VOC omits selected and replaces', () => {
    mountScreen().onAdvanceVoc?.(null);
    const { search, options } = lastWrite();
    expect(search.has('selected')).toBe(false);
    expect(search.get('managedSystem')).toBe('ms-1');
    expect(search.get('view')).toBe('triage');
    expect(options).toEqual({ replace: true });
  });

  describe('consecutive writes before the host acknowledges the first', () => {
    function hrefs(): URLSearchParams[] {
      return navigateMock.mock.calls.map(
        ([href]) => new URLSearchParams(String(href).split('?')[1]),
      );
    }

    it('a tab change then a select keeps the tab', () => {
      const props = mountScreen();
      props.onTabChange('high');
      props.onSelectVoc(NEXT);
      expect(hrefs().at(-1)?.get('tab')).toBe('high');
      expect(hrefs().at(-1)?.get('selected')).toBe(NEXT);
    });

    it('an advance after an area change keeps the area', () => {
      const props = mountScreen();
      props.onAreaChange?.(AREA);
      props.onAdvanceVoc?.(NEXT);
      expect(hrefs().at(-1)?.get('filter.analytics_area')).toBe(AREA);
      expect(hrefs().at(-1)?.get('selected')).toBe(NEXT);
    });

    it('an area change after an advance keeps the advanced selection', () => {
      const props = mountScreen();
      props.onAdvanceVoc?.(NEXT);
      props.onAreaChange?.(AREA);
      expect(hrefs().at(-1)?.get('selected')).toBe(NEXT);
      expect(hrefs().at(-1)?.get('filter.analytics_area')).toBe(AREA);
    });

    it('a select then a tab change clears the selection', () => {
      const props = mountScreen();
      props.onSelectVoc(NEXT);
      props.onTabChange('waiting');
      expect(hrefs().at(-1)?.has('selected')).toBe(false);
      expect(hrefs().at(-1)?.get('tab')).toBe('waiting');
    });

    it('a host navigation drops a pending select', () => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const ui = () => (
        <QueryClientProvider client={qc}>
          <TriageScreen />
        </QueryClientProvider>
      );
      const { rerender } = render(ui());
      screenProps?.onSelectVoc(NEXT);
      // The host resets to a location without the select (a new search object).
      searchState = { ...searchState, selected: SELECTED };
      rerender(ui());
      screenProps?.onAreaChange?.(AREA);
      expect(hrefs().at(-1)?.get('selected')).toBe(SELECTED);
    });
  });
});
