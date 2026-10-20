import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createContext, StrictMode, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { DetailPanelSlotProvider, useDetailPanelSlot, useDetailPanelSlotHost } from './DetailPanelSlot';
import { useDetailPanelContent } from './layout/useDetailPanelContent';
import { DetailPanelFullscreenContext } from './panel/DetailPanelFullscreenContext';

const PageContext = createContext('missing');
function Consumer({ name }: { name: string }) {
  const host = useDetailPanelSlot();
  const value = useContext(PageContext);
  return host ? createPortal(<button>{name}:{value}</button>, host) : null;
}
function Host() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="Detail slot" data-open={slot.open} data-expanded={slot.expanded} />;
}
function Fixture({ first = true, second = false }: { first?: boolean; second?: boolean }) {
  return <DetailPanelSlotProvider>
    <PageContext.Provider value="page">{first && <Consumer name="first" />}{second && <Consumer name="second" />}</PageContext.Provider>
    <Host />
  </DetailPanelSlotProvider>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it('registers, portals with page context, and empties the host on unmount (StrictMode)', () => {
  const view = render(<StrictMode><Fixture /></StrictMode>);
  const host = screen.getByRole('complementary', { name: 'Detail slot' });
  expect(host.contains(screen.getByRole('button', { name: 'first:page' }))).toBe(true);
  view.rerender(<StrictMode><Fixture first={false} /></StrictMode>);
  expect(host.getAttribute('data-open')).toBe('false');
  expect(host.childElementCount).toBe(0);
});

it('last registrant wins, rerenders do not reclaim the slot, and cleanup restores the previous one', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const view = render(<Fixture />);
  view.rerender(<Fixture second />);
  expect(screen.queryByRole('button', { name: 'first:page' })).toBeNull();
  expect(screen.getByRole('button', { name: 'second:page' })).toBeTruthy();
  expect(warning).toHaveBeenCalledTimes(1);
  view.rerender(<Fixture second />);
  expect(screen.getByRole('button', { name: 'second:page' })).toBeTruthy();
  view.rerender(<Fixture />);
  expect(screen.getByRole('button', { name: 'first:page' })).toBeTruthy();
});

it('cleaning up an overridden registrant leaves the winner in place', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const view = render(<Fixture second />);
  view.rerender(<Fixture first={false} second />);
  expect(screen.getByRole('button', { name: 'second:page' })).toBeTruthy();
});

it('suppresses overlap warnings in production', () => {
  vi.stubEnv('PROD', true);
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  render(<Fixture second />);
  expect(warning).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'second:page' })).toBeTruthy();
});

function Content({ name, node }: { name: string; node: ReactNode | undefined }) {
  useDetailPanelContent(node);
  return <span>{name}</span>;
}
function FullscreenProbe({ label }: { label: string }) {
  const fullscreen = useContext(DetailPanelFullscreenContext);
  return <button onClick={fullscreen?.toggle}>{label}:{fullscreen === null ? 'none' : String(fullscreen.expanded)}</button>;
}
function ContentFixture({ slots }: { slots: Record<string, ReactNode | undefined> }) {
  return <DetailPanelSlotProvider>
    <FullscreenProbe label="children" />
    {Object.entries(slots).map(([name, node]) => <Content key={name} name={name} node={node} />)}
    <Host />
  </DetailPanelSlotProvider>;
}
const host = () => screen.getByRole('complementary', { name: 'Detail slot' });
const panel = (label = 'panel') => <FullscreenProbe label={label} />;

it('a closed (null) content registrant hides the previous one, renders nothing, and returns it on cleanup', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const view = render(<ContentFixture slots={{ a: panel('a') }} />);
  expect(host().getAttribute('data-open')).toBe('true');
  view.rerender(<ContentFixture slots={{ a: panel('a'), b: null }} />);
  expect(host().getAttribute('data-open')).toBe('false');
  expect(host().childElementCount).toBe(0);
  view.rerender(<ContentFixture slots={{ a: panel('a') }} />);
  expect(host().getAttribute('data-open')).toBe('true');
  expect(screen.getByRole('button', { name: 'a:false' })).toBeTruthy();
});

it('a registrant keeps its place when its content changes between node and null', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const view = render(<ContentFixture slots={{ a: panel('a'), b: panel('b') }} />);
  view.rerender(<ContentFixture slots={{ a: panel('a'), b: null }} />);
  expect(host().getAttribute('data-open')).toBe('false');
  view.rerender(<ContentFixture slots={{ a: panel('a'), b: panel('b') }} />);
  expect(screen.getByRole('button', { name: 'b:false' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'a:false' })).toBeNull();
});

it('toggle and Escape switch expanded; the context reaches the portaled content only, not the provider children', () => {
  render(<ContentFixture slots={{ a: panel() }} />);
  expect(host().getAttribute('data-expanded')).toBe('false');
  expect(screen.getByRole('button', { name: 'children:none' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'panel:false' }));
  expect(host().getAttribute('data-expanded')).toBe('true');
  expect(screen.getByRole('button', { name: 'panel:true' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'children:none' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'panel:true' }));
  expect(host().getAttribute('data-expanded')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'panel:false' }));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(host().getAttribute('data-expanded')).toBe('false');
});

it('Escape with a defaultPrevented event does not collapse', () => {
  render(<ContentFixture slots={{ a: panel() }} />);
  fireEvent.click(screen.getByRole('button', { name: 'panel:false' }));
  act(() => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    event.preventDefault();
    window.dispatchEvent(event);
  });
  expect(host().getAttribute('data-expanded')).toBe('true');
});

it.each([
  ['the active key changes to another registrant', { a: panel('a'), b: panel('b') }],
  ['the active content becomes null', { a: null }],
  ['the registrant clears', { a: undefined }],
] as const)('expanded resets when %s', (_name, next) => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const view = render(<ContentFixture slots={{ a: panel('a') }} />);
  fireEvent.click(screen.getByRole('button', { name: 'a:false' }));
  expect(host().getAttribute('data-expanded')).toBe('true');
  view.rerender(<ContentFixture slots={next} />);
  expect(host().getAttribute('data-expanded')).toBe('false');
  view.rerender(<ContentFixture slots={{ a: panel('a') }} />);
  expect(host().getAttribute('data-expanded')).toBe('false');
});

it('expanded resets when the registrant unmounts', () => {
  const view = render(<ContentFixture slots={{ a: panel('a') }} />);
  fireEvent.click(screen.getByRole('button', { name: 'a:false' }));
  view.rerender(<ContentFixture slots={{}} />);
  expect(host().getAttribute('data-expanded')).toBe('false');
  expect(host().getAttribute('data-open')).toBe('false');
});

it('portal registrants are open, never expanded, and see no fullscreen context', () => {
  render(<Fixture />);
  expect(host().getAttribute('data-open')).toBe('true');
  expect(host().getAttribute('data-expanded')).toBe('false');
});

it('the host hook returns the same toggle the portaled content receives', () => {
  function ToggleHost() {
    const slot = useDetailPanelSlotHost();
    return <aside ref={slot.ref} aria-label="Detail slot" data-expanded={slot.expanded}><button onClick={slot.toggle}>host-toggle</button></aside>;
  }
  render(<DetailPanelSlotProvider>
    <Content name="a" node={panel()} />
    <ToggleHost />
  </DetailPanelSlotProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'host-toggle' }));
  expect(host().getAttribute('data-expanded')).toBe('true');
  expect(screen.getByRole('button', { name: 'panel:true' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'host-toggle' }));
  expect(host().getAttribute('data-expanded')).toBe('false');
});

function ClosingPortal({ name, onClose }: { name: string; onClose: () => void }) {
  const target = useDetailPanelSlot({ onSuperseded: onClose });
  return target ? createPortal(<button>{name}</button>, target) : null;
}

it.each([false, true])('closes only the outgoing portal once in StrictMode (simultaneous=%s), even without a host', simultaneous => {
  const first = vi.fn();
  const second = vi.fn();
  function ClosingFixture({ add = simultaneous, attach = false }: { add?: boolean; attach?: boolean }) {
    const [open, setOpen] = useState(true);
    const [winner, setWinner] = useState(true);
    return <DetailPanelSlotProvider>
      {open && <ClosingPortal name="old" onClose={() => { first(); setOpen(false); }} />}
      {add && winner && <ClosingPortal name="winner" onClose={second} />}
      <button onClick={() => setWinner(false)}>remove winner</button>
      {attach && <Host />}
    </DetailPanelSlotProvider>;
  }
  const view = render(<StrictMode><ClosingFixture /></StrictMode>);
  view.rerender(<StrictMode><ClosingFixture add /></StrictMode>);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  view.rerender(<StrictMode><ClosingFixture add attach /></StrictMode>);
  expect(screen.getByRole('button', { name: 'winner' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'remove winner' }));
  expect(host().childElementCount).toBe(0);
  expect(first).toHaveBeenCalledTimes(1);
});

it.each(['node', 'null'])('new content %s supersedes a portal; updates and undefined do not', kind => {
  const node = kind === 'node' ? <p>content</p> : null;
  const closed = vi.fn();
  function Mixed({ value, portal = true }: { value: ReactNode | undefined; portal?: boolean }) {
    return <DetailPanelSlotProvider>
      <Content name="content" node={value} />
      {portal && <ClosingPortal name="portal" onClose={closed} />}
      <Host />
    </DetailPanelSlotProvider>;
  }
  const view = render(<Mixed value={node} />);
  expect(closed).not.toHaveBeenCalled();
  view.rerender(<Mixed value={<p>updated</p>} />);
  expect(screen.getByRole('button', { name: 'portal' })).toBeTruthy();
  expect(closed).not.toHaveBeenCalled();
  view.rerender(<Mixed value={undefined} />);
  expect(closed).not.toHaveBeenCalled();
  view.rerender(<Mixed value={node} />);
  expect(closed).toHaveBeenCalledTimes(1);
  view.rerender(<Mixed value={undefined} portal={false} />);
  expect(closed).toHaveBeenCalledTimes(1);
});

it('own unregister and removing the winner never notify an inactive portal', () => {
  const closed = vi.fn();
  function Pair({ first = true, second = false }: { first?: boolean; second?: boolean }) {
    return <DetailPanelSlotProvider>
      {first && <ClosingPortal name="first" onClose={closed} />}
      {second && <Consumer name="second" />}
      <Host />
    </DetailPanelSlotProvider>;
  }
  const view = render(<Pair />);
  view.rerender(<Pair first={false} />);
  expect(closed).not.toHaveBeenCalled();
  view.rerender(<Pair second />);
  expect(closed).toHaveBeenCalledTimes(1);
  view.rerender(<Pair />);
  expect(closed).toHaveBeenCalledTimes(1);
});
