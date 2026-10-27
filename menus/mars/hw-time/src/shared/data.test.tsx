import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMenuQuery } from '@ap/kernel';
import { hwTime } from '../endpoints';
import { useHwTimeLevel, useHwTimeTrend } from './data';

// The lifecycle itself (applied vs draft Context, kind check, Scope/period gates) is the Kernel's and is tested in
// packages/kernel/src/menu-query.test.tsx; this package has no DOM test environment. These tests pin that the HW Time
// hooks reach it with the declared endpoint instead of keeping a query lifecycle of their own.
vi.mock('@ap/kernel', () => ({ useMenuQuery: vi.fn(() => ({ status: 'loading', response: null })) }));

function render(hook: () => unknown) {
  function Probe() { hook(); return null; }
  renderToStaticMarkup(<Probe />);
}

beforeEach(() => { vi.mocked(useMenuQuery).mockClear(); });

describe('HW Time query hooks', () => {
  it('queries the level endpoint with the drill as params', () => {
    render(() => useHwTimeLevel({ drillModule: 'PM1' }));
    expect(useMenuQuery).toHaveBeenCalledWith(hwTime.levelRows, { drillModule: 'PM1' }, true);
  });

  it('queries the trend endpoint with the row ids as params', () => {
    render(() => useHwTimeTrend(['EQ-001.H1']));
    expect(useMenuQuery).toHaveBeenCalledWith(hwTime.trend, { rowIds: ['EQ-001.H1'] }, true);
  });

  it.each([
    ['level', () => useHwTimeLevel({}, false)],
    ['trend', () => useHwTimeTrend([], false)],
  ])('passes the caller enabled flag through for %s', (_name, hook) => {
    render(hook);
    expect(vi.mocked(useMenuQuery).mock.calls[0]?.[2]).toBe(false);
  });
});
