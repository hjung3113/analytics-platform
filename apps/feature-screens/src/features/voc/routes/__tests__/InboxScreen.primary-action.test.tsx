// #1291 B2 — VOC 생성 is drawn in the host head when the host offers one, in the toolbar otherwise, and only for a host that can link to the create form.
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { HeadTargetHost } from '@/test/primary-action-host';
import { DetailPanelSlotProvider } from '@ap/ui';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InboxScreen } from '../InboxScreen';

vi.mock('../../hooks/useVocListPages', () => ({
  useVocListPages: () => ({
    data: { pages: [{ items: [], page: { has_more: false } }], pageParams: [undefined] },
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
vi.mock('../../components/list/VocList', () => ({ VocList: () => null }));

const seam = (canLink: boolean): HostSeam => ({
  canLink: () => canLink,
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  notifyError: () => {},
  notifySuccess: () => {},
  useNavigate: () => () => {},
  useSearch: () => ({ view: 'inbox' }),
});
const screenOf = () => (
  <DetailPanelSlotProvider>
    <InboxScreen view="inbox" renderDetail={() => null} />
  </DetailPanelSlotProvider>
);
const CREATE = { name: /VOC 생성/ };

describe('InboxScreen VOC 생성 placement', () => {
  it('is in the host head and not in the toolbar', () => {
    render(<HeadTargetHost base={seam(true)}>{screenOf()}</HeadTargetHost>);
    expect(within(screen.getByTestId('host-head')).getByRole('link', CREATE)).toBeInTheDocument();
    expect(within(screen.getByTestId('host-body')).queryByRole('link', CREATE)).toBeNull();
    expect(screen.getAllByRole('link', CREATE)).toHaveLength(1);
  });

  it('stays in the toolbar without a host target', () => {
    render(<HostSeamProvider value={seam(true)}>{screenOf()}</HostSeamProvider>);
    expect(screen.getAllByRole('link', CREATE)).toHaveLength(1);
  });

  it('is drawn nowhere for a host that cannot link to the create form', () => {
    render(<HeadTargetHost base={seam(false)}>{screenOf()}</HeadTargetHost>);
    expect(screen.queryByRole('link', CREATE)).toBeNull();
  });
});
