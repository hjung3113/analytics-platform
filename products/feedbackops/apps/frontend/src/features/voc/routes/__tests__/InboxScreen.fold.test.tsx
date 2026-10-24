// InboxScreen.fold.test.tsx — the pending-write fold against a host that applies navigation itself
// (#761 i, F2): the fold lives until the host reports any navigation, then writes build on the host search.

import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@fops/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InboxScreen } from '../InboxScreen';

const VOC = '00000000-0000-4000-8000-000000000001';
const navigateMock = vi.hoisted(() => vi.fn());

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
vi.mock('../../components/VocAreaFilterSelect', () => ({ VocAreaFilterSelect: () => null }));
vi.mock('@/lib/useAnalyticsAreaFilterLabel', () => ({ useAnalyticsAreaFilterLabel: () => 'Area' }));
vi.mock('../../components/list/VocList', () => ({
  VocList: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <button type="button" onClick={() => onSelect(VOC)}>
      VOC 선택
    </button>
  ),
}));

// A host whose search only changes when the test says so; every `report` is a new object, as the
// real hosts hand out one per navigation (also for Back to the same URL).
let current: Record<string, string> = {};
const listeners = new Set<() => void>();
const report = (next: Record<string, string>) =>
  act(() => {
    current = { ...next };
    for (const listener of listeners) listener();
  });
const SEAM: HostSeam = {
  canLink: () => true,
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  notifyError: () => {},
  notifySuccess: () => {},
  useNavigate: () => navigateMock,
  useSearch: () =>
    React.useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => current,
    ),
};

function DetailSlotHost() {
  const { ref } = useDetailPanelSlotHost();
  return <div ref={ref} />;
}

const written = (index = -1) =>
  Object.fromEntries(
    new URL(String(navigateMock.mock.calls.at(index)?.[0]), 'http://x').searchParams,
  );
const sortOldest = async () => {
  fireEvent.click(screen.getByRole('button', { name: /정렬/ }));
  fireEvent.click(await screen.findByText('오래된순'));
};
const pickTab = async () => fireEvent.mouseDown(await screen.findByRole('tab', { name: '높음' }));

beforeEach(() => {
  navigateMock.mockClear();
  current = { view: 'inbox' };
  listeners.clear();
  render(
    <HostSeamProvider value={SEAM}>
      <DetailPanelSlotProvider>
        <InboxScreen view="inbox" renderDetail={() => null} />
        <DetailSlotHost />
      </DetailPanelSlotProvider>
    </HostSeamProvider>,
  );
});

describe('InboxScreen write fold', () => {
  it('folds writes made before the host reports a navigation', async () => {
    await pickTab();
    fireEvent.click(screen.getByRole('button', { name: 'VOC 선택' }));
    expect(written()).toEqual({ view: 'inbox', tab: 'high', selected: VOC });
  });

  it('drops a pending write the host superseded with the search it already rendered', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'VOC 선택' }));
    expect(written().selected).toBe(VOC);
    report({ view: 'inbox' });
    await sortOldest();
    expect(written()).toEqual({ view: 'inbox', sort: 'created_at:asc' });
  });

  it.each([
    ['Back/Forward to a changed URL', { view: 'inbox', tab: 'no-task' }],
    ['an external update', { view: 'inbox', managedSystem: 'ms-9', 'filter.owner': 'assigned' }],
  ])('builds the next write on the host search after %s', async (_name, next) => {
    fireEvent.click(screen.getByRole('button', { name: 'VOC 선택' }));
    report(next);
    await sortOldest();
    expect(written()).toEqual({ ...next, sort: 'created_at:asc' });
  });
});
