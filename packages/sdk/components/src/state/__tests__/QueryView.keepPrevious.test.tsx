import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineEndpoint, groupId, spaceId, type ApiResponse } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useMenuQuery } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { QueryView } from '../../StateView';

afterEach(cleanup);

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', primary: true, group: groupId('overview'), path: '/', label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' },
    icon: House, permission: 'platform:view', requiresScope: false, context: noContext,
    features: { export: false, annotate: false, compare: false, savedView: false }, pageType: 'analysis', pageKeys: [] }],
});
const endpoint = defineEndpoint<{ page: number }, string>({
  id: 'fixture.keep-previous', menuId: 'home', paramKeys: { page: true }, permission: 'platform:view',
  requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false,
});

function Draft({ onMount }: { onMount: () => void }) {
  const [value, setValue] = useState('initial');
  useEffect(onMount, [onMount]);
  return <input aria-label="Draft" value={value} onChange={event => setValue(event.target.value)} />;
}

function Query({ keepPrevious, page, onMount }: { keepPrevious?: boolean; page: number; onMount: () => void }) {
  const query = useMenuQuery(endpoint, { page }, true, keepPrevious === undefined ? undefined : { keepPrevious });
  return <>
    <p data-testid="query-state">{query.status}:{String(query.showingPrevious)}</p>
    <QueryView query={query}>{data => <><p>{data}</p><Draft onMount={onMount} /></>}</QueryView>
  </>;
}

describe('real useMenuQuery + QueryView option toggles (#1365 FIX6V)', () => {
  it.each([false, undefined, true])('remounts only when opt-in changes, keeping live/previous transitions stable (initial=%s)', async initial => {
    const pending: ((response: ApiResponse<string>) => void)[] = [];
    const session = testSession(['platform:view']);
    const adapter = testAdapter({
      session: () => session,
      menuQuery: vi.fn(() => new Promise<ApiResponse<string>>(resolve => pending.push(resolve))),
    });
    const mounts = vi.fn();
    const view = (keepPrevious: boolean | undefined, page = 1) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <Query keepPrevious={keepPrevious} page={page} onMount={mounts} />
    </PlatformProvider></I18nProvider>;
    const result = render(view(initial));
    const settle = async (index: number, data: string) => {
      await waitFor(() => expect(pending).toHaveLength(index + 1));
      act(() => pending[index]!({ outcome: 'ok', data, assessments: [], trust: null, correlationId: data }));
      await screen.findByText(data);
    };
    await settle(0, 'page one');
    expect(screen.getByTestId('query-state')).toHaveTextContent(`done:${initial ? 'false' : 'undefined'}`);
    const initialInput = screen.getByRole('textbox', { name: 'Draft' });
    fireEvent.change(initialInput, { target: { value: 'before opt-in' } });
    act(() => initialInput.focus());
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(!!result.container.querySelector('[data-query-result-content]')).toBe(initial === true);

    // Kernel F7 still keeps the accepted result on late opt-in. QueryView adds its
    // result box once, so consumers must opt in from the first render to keep local state.
    result.rerender(view(true));
    expect(screen.getByTestId('query-state')).toHaveTextContent('done:false');
    expect(screen.getByText('page one')).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'Draft' });
    const content = result.container.querySelector('[data-query-result-content]');
    const optedInMounts = initial === true ? 1 : 2;
    expect(mounts).toHaveBeenCalledTimes(optedInMounts);
    if (initial === true) {
      expect(input).toBe(initialInput);
      expect(input).toHaveValue('before opt-in');
      expect(input).toHaveFocus();
    } else {
      expect(input).not.toBe(initialInput);
      expect(input).toHaveValue('initial');
      expect(initialInput).not.toBeInTheDocument();
      expect(input).not.toHaveFocus();
    }
    fireEvent.change(input, { target: { value: 'edited' } });
    act(() => input.focus());
    const assertPreserved = () => {
      expect(mounts).toHaveBeenCalledTimes(optedInMounts);
      expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(input);
      expect(input).toHaveValue('edited');
      expect(input).toHaveFocus();
      expect(result.container.querySelector('[data-query-result-content]')).toBe(content);
    };

    result.rerender(view(true, 2));
    expect(screen.getByTestId('query-state')).toHaveTextContent('refreshing:true');
    expect(screen.getByText('page one')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '이전 선택의 결과 · 갱신 중' }).nextElementSibling).toBe(content);
    assertPreserved();

    await settle(1, 'page two');
    expect(screen.getByTestId('query-state')).toHaveTextContent('done:false');
    expect(result.container.querySelector('[data-query-result-content]')).toBe(content);
    assertPreserved();

    result.rerender(view(false, 2));
    expect(screen.getByTestId('query-state')).toHaveTextContent('done:undefined');
    expect(screen.getByText('page two')).toBeInTheDocument();
    expect(result.container.querySelector('[data-query-result-content]')).toBeNull();
    expect(mounts).toHaveBeenCalledTimes(optedInMounts + 1);
    const nonOptInInput = screen.getByRole('textbox', { name: 'Draft' });
    expect(nonOptInInput).not.toBe(input);
    expect(nonOptInInput).toHaveValue('initial');
    result.rerender(view(undefined, 2));
    expect(screen.getByTestId('query-state')).toHaveTextContent('done:undefined');
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(nonOptInInput);
    expect(mounts).toHaveBeenCalledTimes(optedInMounts + 1);
  });
});
