// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useClearFiltersAction, type ClearFiltersActionOptions } from '../useClearFiltersAction';

function Harness(props: ClearFiltersActionOptions) { return useClearFiltersAction(props); }

const { setPage } = vi.hoisted(() => ({ setPage: vi.fn() }));
vi.mock('@ap/kernel', () => ({ usePlatform: () => ({ setPage }), useI18n: () => ({ t: () => '필터 초기화' }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ClearFiltersAction (#1233)', () => {
  it.each([{ extraKeys: [] }, { extraKeys: ['q'] }, { extraKeys: ['focus', 'tab'] }])('clears the declared filter, page and extras %j in one write', ({ extraKeys }) => {
    render(<Harness filterKey="conditions" hasFilters extraKeys={extraKeys} />);
    const button = screen.getByRole('button', { name: '필터 초기화' });
    expect(button.getAttribute('type')).toBe('button');
    fireEvent.click(button);
    expect(setPage).toHaveBeenCalledExactlyOnceWith({ conditions: null, page: null, ...Object.fromEntries(extraKeys.map(key => [key, null])) });
  });

  it('renders nothing when the page has no conditions or extra values to clear', () => {
    const { result } = renderHook(() => useClearFiltersAction({ filterKey: 'filter', hasFilters: false, extraKeys: ['q'] }));
    expect(result.current).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(setPage).not.toHaveBeenCalled();
  });
});
