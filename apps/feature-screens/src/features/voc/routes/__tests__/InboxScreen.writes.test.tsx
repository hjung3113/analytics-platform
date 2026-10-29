// InboxScreen.writes.test.tsx — every URL write of the inbox through the host seam (#761 i): the
// complete feature href, carried keys kept, absent means omitted, and the replace flag of the
// old router calls (replace only for the 내 VOC cleanup and the q draft).

import { SEARCH_DEBOUNCE_MS } from '@/lib/forms/search-debounce';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InboxScreen } from '../InboxScreen';

const VOC = '00000000-0000-4000-8000-000000000001';
const AREA = '11111111-1111-4111-8111-111111111111';

const navigateMock = vi.hoisted(() => vi.fn());
const canLinkMock = vi.hoisted(() => vi.fn());
let searchState: Record<string, string> = {};

vi.mock('../../hooks/useVocListPages', () => ({
  useVocListPages: () => ({
    data: { pages: [{ items: [{ id: VOC }], page: { has_more: false } }], pageParams: [undefined] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: vi.fn(),
  }),
}));
vi.mock('../../components/list/VocList', () => ({
  VocList: ({ onSelect, onCreate }: { onSelect: (id: string) => void; onCreate?: () => void }) => (
    <>
      <button type="button" onClick={() => onSelect(VOC)}>
        VOC 선택
      </button>
      {onCreate !== undefined && (
        <button type="button" onClick={onCreate}>
          빈 목록 작성
        </button>
      )}
    </>
  ),
}));
vi.mock('../../components/VocAreaFilterSelect', () => ({
  VocAreaFilterSelect: ({ onChange }: { onChange: (next: string | undefined) => void }) => (
    <>
      <button type="button" onClick={() => onChange(AREA)}>
        Area 선택
      </button>
      <button type="button" onClick={() => onChange(undefined)}>
        Area 해제
      </button>
    </>
  ),
}));
vi.mock('@/lib/useAnalyticsAreaFilterLabel', () => ({ useAnalyticsAreaFilterLabel: () => 'Area' }));

const SEAM: HostSeam = {
  canLink: (to) => canLinkMock(to),
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  notifyError: () => {},
  notifySuccess: () => {},
  useNavigate: () => navigateMock,
  useSearch: () => searchState,
};

function DetailSlotHost() {
  const { ref } = useDetailPanelSlotHost();
  return <div ref={ref} />;
}

const renderDetail = vi.fn((vocId: string, { onClose }: { onClose: () => void }) => (
  <button type="button" onClick={onClose}>
    {`상세 닫기 ${vocId}`}
  </button>
));

function mount(view: 'inbox' | 'my' = 'inbox') {
  const ui = () => (
    <HostSeamProvider value={SEAM}>
      <DetailPanelSlotProvider>
        <InboxScreen view={view} renderDetail={renderDetail} />
        <DetailSlotHost />
      </DetailPanelSlotProvider>
    </HostSeamProvider>
  );
  const result = render(ui());
  return { ...result, again: () => result.rerender(ui()) };
}

function written(index = -1) {
  const calls = navigateMock.mock.calls;
  const [href, options] = calls.at(index) as [string, { replace?: boolean } | undefined];
  const url = new URL(href, 'http://platform.local');
  return {
    path: url.pathname,
    search: Object.fromEntries(url.searchParams),
    replace: options?.replace === true,
  };
}

const CARRIED = {
  returnTo: '/home',
  view: 'inbox',
  managedSystem: 'ms-1',
  'filter.owner': 'assigned',
  selected: VOC,
};

beforeEach(() => {
  navigateMock.mockClear();
  renderDetail.mockClear();
  canLinkMock.mockReturnValue(true);
  searchState = { ...CARRIED };
});

describe('InboxScreen URL writes', () => {
  it.each([
    [
      'tab',
      async () => fireEvent.mouseDown(await screen.findByRole('tab', { name: '높음' })),
      { ...CARRIED, tab: 'high' },
    ],
    [
      'row select',
      () => fireEvent.click(screen.getByRole('button', { name: 'VOC 선택' })),
      CARRIED,
    ],
    [
      'panel close',
      () => fireEvent.click(screen.getByRole('button', { name: `상세 닫기 ${VOC}` })),
      { ...CARRIED, selected: undefined },
    ],
    [
      'area choose',
      () => fireEvent.click(screen.getByRole('button', { name: 'Area 선택' })),
      { ...CARRIED, 'filter.analytics_area': AREA },
    ],
    [
      'sort',
      async () => {
        fireEvent.click(screen.getByRole('button', { name: /정렬/ }));
        fireEvent.click(await screen.findByText('오래된순'));
      },
      { ...CARRIED, sort: 'created_at:asc' },
    ],
    [
      'filters',
      async () => {
        fireEvent.click(await screen.findByRole('button', { name: /^필터/ }));
        fireEvent.click(await screen.findByRole('checkbox', { name: '접수됨' }));
      },
      { ...CARRIED, 'filter.reporterStatus': 'received' },
    ],
  ])('%s keeps every other key and does not replace', async (_name, act, expected) => {
    mount();
    await act();
    const { path, search, replace } = written();
    expect(path).toBe('/vocs');
    expect(replace).toBe(false);
    expect(search).toEqual(
      Object.fromEntries(Object.entries(expected).filter(([, value]) => value !== undefined)),
    );
  });

  it('area removal drops only the Area key', () => {
    searchState = { ...CARRIED, 'filter.analytics_area': AREA };
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Area 해제' }));
    expect(written().search).toEqual(CARRIED);
    expect(written().replace).toBe(false);
  });

  it('create from the empty list keeps the search and adds action=create', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '빈 목록 작성' }));
    expect(written().search).toEqual({ ...CARRIED, action: 'create' });
    expect(written().replace).toBe(false);
  });

  it('hands renderDetail the selected VOC, its Managed System and a close that clears selected', () => {
    mount();
    expect(renderDetail).toHaveBeenCalledWith(
      VOC,
      expect.objectContaining({ managedSystemId: 'ms-1', onClose: expect.any(Function) }),
    );
  });

  it('renders no detail without a selection', () => {
    searchState = { view: 'inbox' };
    mount();
    expect(renderDetail).not.toHaveBeenCalled();
  });

  it('renders no create link and no empty-list create action where the host cannot link there', () => {
    canLinkMock.mockReturnValue(false);
    mount();
    expect(canLinkMock).toHaveBeenCalledWith('/vocs?action=create');
    expect(screen.queryByRole('link', { name: /VOC 생성/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '빈 목록 작성' })).not.toBeInTheDocument();
  });

  it('keeps the create link when the host can link', () => {
    mount();
    expect(screen.getByRole('link', { name: /VOC 생성/ })).toHaveAttribute(
      'href',
      '/vocs?action=create',
    );
  });

  it('내 VOC cleanup of a stale severity sort replaces and keeps the carried keys', () => {
    searchState = { ...CARRIED, view: 'my', sort: 'severity:desc', tab: 'high' };
    mount('my');
    expect(written().replace).toBe(true);
    expect(written().search).toEqual({ ...CARRIED, view: 'my' });
  });

  it('q draft: starting a search drops the tab, replaces, and clearing restores the tab', () => {
    vi.useFakeTimers();
    try {
      searchState = { ...CARRIED, tab: 'high' };
      const { again } = mount();
      const box = screen.getByRole('searchbox', { name: '제목 또는 ID' });
      fireEvent.change(box, { target: { value: 'login' } });
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      expect(written().replace).toBe(true);
      expect(written().search).toEqual({ ...CARRIED, q: 'login' });

      searchState = written().search;
      again();
      fireEvent.change(screen.getByRole('searchbox', { name: '제목 또는 ID' }), {
        target: { value: '' },
      });
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      expect(written().replace).toBe(true);
      expect(written().search).toEqual({ ...CARRIED, tab: 'high' });
    } finally {
      vi.useRealTimers();
    }
  });
});
