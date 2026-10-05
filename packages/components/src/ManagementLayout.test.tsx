import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { ManagementLayout } from './ManagementLayout';

let width = 1200;
let resize: (() => void) | undefined;
let observed: Element | undefined;
let storage: Map<string, string>;
const key = 'platform:filter-rail-collapsed';
beforeEach(() => {
  width = 1200;
  resize = undefined;
  observed = undefined;
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: () => void) {}
    observe(element: Element) { if (!observed) { observed = element; resize = this.callback; } }
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width, height: 600, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 600, toJSON() {},
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount(count = 0, filter: React.ReactNode = <input aria-label="상태 필터" />) {
  const table = vi.fn(slot => <section aria-label="표">{slot}<p>표 내용</p></section>);
  const result = render(<I18nProvider><ManagementLayout filter={filter} activeFilterCount={count} table={table} drawer={<p>상세 내용</p>} /></I18nProvider>);
  return { ...result, table };
}
function setWidth(next: number) { act(() => { width = next; resize?.(); }); }
const collapse = () => screen.getByRole('button', { name: '필터 접기' });
const trigger = () => within(screen.getByRole('region', { name: '표' })).getByRole('button', { name: /^필터/ });

describe('ManagementLayout', () => {
  it('observes its own width and renders the expanded rail with an empty table filter slot', () => {
    const { container, table } = mount(2);
    expect(observed).toBe(container.firstElementChild);
    expect(screen.getByRole('region', { name: '필터' })).toBeInTheDocument();
    expect(collapse()).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(collapse().getAttribute('aria-controls')!)).toContainElement(screen.getByLabelText('상태 필터'));
    expect(table).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByText('2개 적용')).toBeInTheDocument();
    expect(screen.getByText('상세 내용')).toBeInTheDocument();
  });

  it('collapses and expands with storage and focus following the controls', () => {
    const { table } = mount(3);
    fireEvent.click(collapse());
    expect(screen.queryByRole('region', { name: '필터' })).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent('필터 · 3');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveFocus();
    expect(table.mock.lastCall?.[0]).toBeDefined();
    expect(storage.get(key)).toBe('1');
    expect(screen.getByText('상세 내용')).toBeInTheDocument();
    fireEvent.click(trigger());
    expect(collapse()).toHaveFocus();
    expect(storage.has(key)).toBe(false);
  });

  it('starts collapsed from the shared saved preference', () => {
    storage.set(key, '1');
    mount();
    expect(screen.queryByRole('button', { name: '필터 접기' })).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent('필터');
    expect(trigger()).not.toHaveTextContent('0');
  });

  it('uses a popover below 960px and preserves the expanded preference when returning wide', async () => {
    mount();
    setWidth(959);
    expect(screen.queryByRole('region', { name: '필터' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('상태 필터')).not.toBeInTheDocument();
    fireEvent.click(trigger());
    const popover = await screen.findByRole('dialog', { name: '필터' });
    expect(within(popover).getByLabelText('상태 필터')).toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(storage.has(key)).toBe(false);
    fireEvent.keyDown(popover, { key: 'Escape' });
    await waitFor(() => expect(trigger()).toHaveAttribute('aria-expanded', 'false'));
    setWidth(960);
    expect(collapse()).toBeInTheDocument();
  });

  it('preserves a collapsed preference through narrow popover editing', async () => {
    storage.set(key, '1');
    width = 700;
    mount(1);
    fireEvent.click(trigger());
    expect(await screen.findByRole('dialog', { name: '필터' })).toBeInTheDocument();
    setWidth(1200);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(storage.get(key)).toBe('1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('omits counts for zero and omits all rail controls when no filter exists', () => {
    const result = mount();
    expect(screen.queryByText('0개 적용')).not.toBeInTheDocument();
    result.unmount();
    const { table } = mount(4, null);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(table).toHaveBeenLastCalledWith(undefined);
    expect(screen.getByText('상세 내용')).toBeInTheDocument();
  });

  it('continues rendering and toggling when storage reads and writes throw', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); },
    });
    mount();
    fireEvent.click(collapse());
    expect(trigger()).toHaveFocus();
    fireEvent.click(trigger());
    expect(collapse()).toHaveFocus();
  });
});
