import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMenuQuery } from '@ap/kernel';
import { operationTimeEndpoint } from '../endpoints';
import OperationTimeScreen from './OperationTime';

// This package has no DOM test environment, and the lifecycle itself (the kept result, the refreshing label, Context and period hiding) is the Kernel's,
// tested in packages/sdk/kernel/src/query/__tests__/menu-query.test.tsx. This pins that the screen asks for it: the screen has no other state to test.
vi.mock('@ap/kernel', () => ({
  useMenuQuery: vi.fn(() => ({ status: 'loading', response: null })),
  useI18n: () => ({ lang: 'ko', tx: (text: { ko: string }) => text.ko }),
  usePlatform: () => ({ pageParam: (key: string) => (key === 'eqp' ? 'EQ-07' : null), global: {}, setPage: vi.fn() }),
}));
vi.mock('@ap/components', () => ({
  PlatformPage: ({ children }: { children?: unknown }) => <>{children as never}</>,
  QueryView: () => null, DataTrustIndicator: () => null, AnalysisLayout: () => null, AnalysisChart: () => null, LaneTimeline: () => null, StatCard: () => null,
}));

beforeEach(() => { vi.mocked(useMenuQuery).mockClear(); });

describe('CLAS operation time keeps the previous equipment while another loads (#1365)', () => {
  it('reads the chosen equipment with keepPrevious on', () => {
    renderToStaticMarkup(<OperationTimeScreen />);
    expect(useMenuQuery).toHaveBeenCalledWith(operationTimeEndpoint, { eqp: 'EQ-07' }, true, { keepPrevious: true });
  });
});
