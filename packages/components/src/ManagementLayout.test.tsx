import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { PageFilterBar } from './PageFilterBar';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { DetailDrawer } from './DetailDrawer';
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
function mount(count = 0, filter: React.ReactNode = <input aria-label="상태 필터" />, pending = 0) {
  const table = vi.fn(slot => <section aria-label="표">{slot}<p>표 내용</p></section>);
  const result = render(<I18nProvider><ManagementLayout filter={filter} activeFilterCount={count} pendingFilterCount={pending} table={table} drawer={<p>상세 내용</p>} /></I18nProvider>);
  return { ...result, table };
}
function setWidth(next: number) { act(() => { width = next; resize?.(); }); }
const collapse = () => screen.getByRole('button', { name: '필터 접기' });
const trigger = () => within(screen.getByRole('region', { name: '표' })).getByRole('button', { name: /^필터/ });

describe('ManagementLayout', () => {
  it('moves rail input focus to the narrow filter trigger on resize', () => {
    mount();
    screen.getByLabelText('상태 필터').focus();
    setWidth(959);
    expect(trigger()).toHaveFocus();
  });

  it('closes the narrow popover and moves its focus to the expanded rail on resize', async () => {
    width = 959;
    mount();
    fireEvent.click(trigger());
    const popover = await screen.findByRole('dialog', { name: '필터' });
    within(popover).getByLabelText('상태 필터').focus();
    setWidth(1200);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(collapse()).toHaveFocus());
  });

  it('moves narrow trigger focus to the expanded rail on resize', () => {
    width = 959;
    mount();
    trigger().focus();
    setWidth(1200);
    expect(collapse()).toHaveFocus();
  });

  it('preserves table focus through both resize directions', () => {
    render(<I18nProvider><ManagementLayout filter={<input aria-label="필터 입력" />} table={slot => <>{slot}<button>표 동작</button></>} /></I18nProvider>);
    screen.getByRole('button', { name: '표 동작' }).focus();
    setWidth(959);
    expect(screen.getByRole('button', { name: '표 동작' })).toHaveFocus();
    setWidth(1200);
    expect(screen.getByRole('button', { name: '표 동작' })).toHaveFocus();
  });

  it('only controls targets present in expanded, collapsed and popover states', async () => {
    mount();
    const checkTargets = () => {
      for (const control of document.querySelectorAll('[aria-controls]')) {
        expect(document.getElementById(control.getAttribute('aria-controls')!)).not.toBeNull();
      }
    };
    checkTargets();
    fireEvent.click(collapse());
    expect(trigger()).not.toHaveAttribute('aria-controls');
    checkTargets();
    setWidth(959);
    checkTargets();
    fireEvent.click(trigger());
    await screen.findByRole('dialog', { name: '필터' });
    checkTargets();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(trigger()).toHaveAttribute('aria-expanded', 'false'));
    checkTargets();
  });

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


describe('ManagementLayout pending filter changes (ADR-0037)', () => {
  it('shows a text marker and a description on the collapsed trigger while its accessible name stays 필터 · N', () => {
    storage.set(key, '1');
    mount(2, undefined, 3);
    const button = trigger();
    expect(button).toHaveAccessibleName('필터 · 2');
    expect(button).toHaveTextContent('미적용 3');
    expect(button).toHaveAccessibleDescription('적용된 필터 2개, 미적용 변경 3개');
  });

  it('shows the marker on the narrow trigger as well, and nothing when no change is pending', () => {
    width = 959;
    const view = mount(1, undefined, 1);
    expect(trigger()).toHaveTextContent('미적용 1');
    expect(trigger()).toHaveAccessibleName('필터 · 1');
    view.unmount();
    mount(1, undefined, 0);
    expect(trigger()).not.toHaveTextContent('미적용');
    expect(trigger()).not.toHaveAttribute('aria-describedby');
  });

  it.each([
    [2, 1, '2개 적용 · 미적용 변경 1개'],
    [0, 2, '미적용 변경 2개'],
  ])('adds the pending count to the rail header (applied %i, pending %i)', (applied, pending, text) => {
    mount(applied, undefined, pending);
    expect(screen.getByRole('region', { name: '필터' })).toHaveTextContent(text);
  });

  function Draft({ apply }: { apply: () => void }) {
    const [text, setText] = useState('');
    const [applied, setApplied] = useState('');
    return <I18nProvider><ManagementLayout pendingFilterCount={text === applied ? 0 : 1}
      filter={<PageFilterBar orientation="column" label="필터" onApply={() => { apply(); setApplied(text); }}
        fields={[{ kind: 'text', key: 'q', label: '검색어', value: text, onValueChange: setText }]}
        actions={<button type="submit" disabled={text === applied}>적용</button>} />}
      table={slot => <section aria-label="표">{slot}</section>} /></I18nProvider>;
  }

  it.each([['rail', 1200], ['popover', 700]])('keeps the draft and moves focus to the first field after Apply in the %s', async (source, nextWidth) => {
    width = nextWidth;
    const apply = vi.fn();
    render(<Draft apply={apply} />);
    const user = userEvent.setup();
    if (source === 'popover') {
      await user.click(trigger());
      await screen.findByRole('dialog', { name: '필터' });
    }
    await user.type(screen.getByRole('textbox', { name: '검색어' }), 'abc');
    const button = screen.getByRole('button', { name: '적용' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(apply).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '검색어' })).toHaveFocus();
    expect(screen.getByRole('textbox', { name: '검색어' })).toHaveValue('abc');
  });
});

it('keeps the focused detail and returns to the same table opener after the rail disappears', () => {
  function Host() { const host = useDetailPanelSlotHost(); return <aside ref={host.ref} />; }
  function Fixture() {
    const [open, setOpen] = useState(false);
    return <ManagementLayout filter={<input aria-label="필터 입력" />}
      table={slot => <>{slot}<button onClick={() => setOpen(true)}>보기</button></>}
      drawer={open && <DetailDrawer title="상세" onClose={() => setOpen(false)} tabs={[{ id: 'a', label: '속성', content: '내용' }]} />} />;
  }
  render(<I18nProvider><DetailPanelSlotProvider><Fixture /><Host /></DetailPanelSlotProvider></I18nProvider>);
  const opener = screen.getByRole('button', { name: '보기' });
  opener.focus();
  fireEvent.click(opener);
  const close = screen.getByRole('button', { name: '상세 닫기' });
  expect(close).toHaveFocus();
  setWidth(959);
  expect(close).toHaveFocus();
  expect(screen.getByRole('button', { name: '보기' })).toBe(opener);
  fireEvent.keyDown(close, { key: 'Escape' });
  expect(opener).toHaveFocus();
});


it.each(['rail', 'trigger', 'popover'])('does not consume pending %s focus after the user moves to the table', async source => {
  if (source !== 'rail') width = 959;
  render(<I18nProvider><ManagementLayout filter={<input aria-label="필터 입력" />}
    table={slot => <>{slot}<button>표 동작</button></>} /></I18nProvider>);
  if (source === 'popover') {
    fireEvent.click(screen.getByRole('button', { name: '필터' }));
    await screen.findByRole('dialog');
  }
  (source === 'trigger' ? screen.getByRole('button', { name: '필터' }) : screen.getByLabelText('필터 입력')).focus();
  const table = screen.getByRole('button', { name: '표 동작' });
  act(() => {
    width = source === 'rail' ? 959 : 1200;
    resize?.();
    table.focus();
  });
  await act(() => new Promise(resolve => setTimeout(resolve, 30)));
  expect(table).toHaveFocus();
});
