import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { DetailPanelSlotProvider } from '@ap/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InboxScreen } from '../InboxScreen';

vi.mock('../../hooks/useVocListPages', () => ({
  useVocListPages: () => ({
    data: {
      pages: [{
        items: [],
        page: { has_more: false },
        out_of_scope_summary: {
          count: 3,
          severity_distribution: { low: 0, medium: 2, high: 0, critical: 1 },
        },
      }],
      pageParams: [undefined],
    },
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

const seam: HostSeam = {
  canLink: () => true,
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  notifyError: () => {},
  notifySuccess: () => {},
  useNavigate: () => () => {},
  useSearch: () => ({ view: 'inbox' }),
};

describe('InboxScreen out-of-scope summary (#2052 FEA-26)', () => {
  it('labels every severity in Korean while preserving the counts', () => {
    render(
      <HostSeamProvider value={seam}>
        <DetailPanelSlotProvider>
          <InboxScreen view="inbox" renderDetail={() => null} />
        </DetailPanelSlotProvider>
      </HostSeamProvider>,
    );
    expect(screen.getByText('3건의 VOC를 조회할 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('심각도 분포: 낮음=0, 중간=2, 높음=0, 심각=1')).toBeInTheDocument();
  });
});
