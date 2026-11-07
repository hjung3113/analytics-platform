import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useContext, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { DetailPanelSlotProvider, useDetailPanelSlot, useDetailPanelSlotHost } from './DetailPanelSlot';
import { DetailPanelFullscreenContext, DetailPanelFullscreenToggle } from './panel/DetailPanelFullscreenContext';
import { useDetailPanelContent } from './layout/useDetailPanelContent';

function Host() { const slot = useDetailPanelSlotHost(); return <aside aria-label="slot" ref={slot.ref} data-expanded={slot.expanded} />; }
function Panel() { const mode = useContext(DetailPanelFullscreenContext); return <><DetailPanelFullscreenToggle expandLabel="Expand" collapseLabel="Collapse" /><input aria-label="draft" /><span>{String(mode?.expanded)}</span></>; }
function Portal({ local = false }: { local?: boolean }) { const host = useDetailPanelSlot({ localExpansion: local }); return host ? createPortal(<Panel />, host) : null; }
function Content() { useDetailPanelContent(<Panel />); return null; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(['portal', 'content'])('controlled expansion reaches %s, preserves nodes and requests a change without mutating control', kind => {
  const change = vi.fn();
  const tree = (expanded: boolean) => <DetailPanelSlotProvider expanded={expanded} onExpandedChange={change}>{kind === 'portal' ? <Portal /> : <Content />}<Host /></DetailPanelSlotProvider>;
  const view = render(tree(false));
  const input = screen.getByLabelText('draft'); fireEvent.change(input, { target: { value: 'unsaved' } });
  const toggle = screen.getByRole('button', { name: 'Expand' }); act(() => toggle.focus()); fireEvent.click(toggle);
  expect(change).toHaveBeenLastCalledWith(true); expect(screen.getByRole('button', { name: 'Expand' })).toBe(toggle);
  view.rerender(tree(true)); expect(screen.getByRole('button', { name: 'Collapse' })).toBe(toggle); expect(toggle).toHaveFocus();
  view.rerender(tree(false)); expect(screen.getByLabelText('draft')).toBe(input); expect(input).toHaveValue('unsaved'); expect(toggle).toHaveFocus();
});
it('a replacing registrant inherits expansion; closing ends it', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  function Fixture() { const [second, setSecond] = useState(false); const [open, setOpen] = useState(true); return <DetailPanelSlotProvider><button onClick={() => setSecond(true)}>replace</button><button onClick={() => setOpen(false)}>close</button>{open && <Portal key={String(second)} />}<Host /></DetailPanelSlotProvider>; }
  render(<Fixture />); fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
  fireEvent.click(screen.getByRole('button', { name: 'replace' })); expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'close' })); expect(screen.getByRole('complementary').getAttribute('data-expanded')).toBe('false');
});
it('a local registrant expands in memory without calling the host URL controller', () => {
  const change = vi.fn(); render(<DetailPanelSlotProvider expanded={false} onExpandedChange={change}><Portal local /><Host /></DetailPanelSlotProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Expand' })); expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy(); expect(change).not.toHaveBeenCalled();
});
it('does not clear restored controlled expansion before a late registration', () => {
  const change = vi.fn(); const tree = (open: boolean) => <DetailPanelSlotProvider expanded onExpandedChange={change}>{open && <Portal />}<Host /></DetailPanelSlotProvider>;
  const view = render(tree(false)); expect(change).not.toHaveBeenCalled();
  view.rerender(tree(true)); expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy(); expect(change).not.toHaveBeenCalled();
});

it('respects Escape already handled by a child without collapsing twice', () => {
  function ContentWithEscape() { useDetailPanelContent(<div onKeyDown={event => event.preventDefault()}><Panel /></div>); return null; }
  render(<DetailPanelSlotProvider><ContentWithEscape /><Host /></DetailPanelSlotProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
  fireEvent.keyDown(screen.getByLabelText('draft'), { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy();
});

it('does not invoke the previous screen controller when navigation already removed expansion', () => {
  const previous = vi.fn(); const current = vi.fn();
  const view = render(<DetailPanelSlotProvider expanded onExpandedChange={previous}><Portal /><Host /></DetailPanelSlotProvider>);
  view.rerender(<DetailPanelSlotProvider expanded={false} onExpandedChange={current}><Host /></DetailPanelSlotProvider>);
  expect(previous).not.toHaveBeenCalled(); expect(current).not.toHaveBeenCalled();
});

it('in-memory expansion serves a reported visible surface without any detail registrant and ends with it', () => {
  function SurfaceHost({ visible }: { visible: boolean }) {
    const slot = useDetailPanelSlotHost();
    const { setSurfaceVisible } = slot;
    useLayoutEffect(() => { setSurfaceVisible(visible); }, [setSurfaceVisible, visible]);
    return <><aside aria-label="slot" ref={slot.ref} data-expanded={slot.expanded} /><button onClick={slot.toggle}>toggle</button></>;
  }
  const tree = (visible: boolean) => <DetailPanelSlotProvider expanded={undefined}><SurfaceHost visible={visible} /></DetailPanelSlotProvider>;
  const view = render(tree(true));
  fireEvent.click(screen.getByRole('button', { name: 'toggle' })); expect(screen.getByRole('complementary').getAttribute('data-expanded')).toBe('true');
  view.rerender(tree(false)); expect(screen.getByRole('complementary').getAttribute('data-expanded')).toBe('false');
  view.rerender(tree(true)); expect(screen.getByRole('complementary').getAttribute('data-expanded')).toBe('false');
});
