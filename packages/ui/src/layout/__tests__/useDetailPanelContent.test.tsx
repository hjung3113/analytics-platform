import { cleanup, render, screen } from '@testing-library/react';
import { createContext, StrictMode, useContext, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { DetailPanelSlotProvider, useDetailPanelSlot, useDetailPanelSlotHost } from '../../DetailPanelSlot';
import { useDetailPanelContent } from '../useDetailPanelContent';

const ProviderContext = createContext('outside');
function Content({ name, node }: { name: string; node?: ReactNode }) {
  useDetailPanelContent(node);
  return <span data-shell={name} />;
}
function Portal({ name }: { name: string }) {
  const host = useDetailPanelSlot();
  return host ? createPortal(<button>{name}</button>, host) : null;
}
function Probe() {
  return <i>{useContext(ProviderContext)}</i>;
}
function Host() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="Detail slot" data-open={slot.open} />;
}
function Fixture({ children }: { children: ReactNode }) {
  return <DetailPanelSlotProvider>{children}<Host /></DetailPanelSlotProvider>;
}
const getHost = () => screen.getByRole('complementary', { name: 'Detail slot' });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it('renders the content inside the host and opens the slot', () => {
  render(<Fixture><Content name="shell" node={<p>detail</p>} /></Fixture>);
  expect(getHost().contains(screen.getByText('detail'))).toBe(true);
  expect(getHost().getAttribute('data-open')).toBe('true');
});

it('renders content with the provider tree context', () => {
  render(<ProviderContext.Provider value="provider"><Fixture><ProviderContext.Provider value="shell"><Content name="shell" node={<Probe />} /></ProviderContext.Provider></Fixture></ProviderContext.Provider>);
  expect(getHost().textContent).toBe('provider');
});

it('is a no-op without a provider', () => {
  render(<Content name="shell" node={<p>detail</p>} />);
  expect(document.querySelector('[data-shell="shell"]')).not.toBeNull();
  expect(screen.queryByText('detail')).toBeNull();
});

it('clears the slot when the node becomes undefined', () => {
  const view = render(<Fixture><Content name="shell" node={<p>detail</p>} /></Fixture>);
  view.rerender(<Fixture><Content name="shell" node={undefined} /></Fixture>);
  expect(getHost().getAttribute('data-open')).toBe('false');
  expect(getHost().childElementCount).toBe(0);
});

it('clears the slot when the registrant unmounts (StrictMode)', () => {
  const view = render(<StrictMode><Fixture><Content name="shell" node={<p>detail</p>} /></Fixture></StrictMode>);
  expect(getHost().contains(screen.getByText('detail'))).toBe(true);
  view.rerender(<StrictMode><Fixture>{null}</Fixture></StrictMode>);
  expect(getHost().getAttribute('data-open')).toBe('false');
  expect(getHost().childElementCount).toBe(0);
});

it('updates the rendered content when the node changes', () => {
  const view = render(<Fixture><Content name="shell" node={<p>one</p>} /></Fixture>);
  view.rerender(<Fixture><Content name="shell" node={<p>two</p>} /></Fixture>);
  expect(screen.queryByText('one')).toBeNull();
  expect(getHost().contains(screen.getByText('two'))).toBe(true);
});

it('last registrant wins across kinds and cleanup restores the previous one', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const view = render(<Fixture><Content name="shell" node={<p>content</p>} /></Fixture>);
  view.rerender(<Fixture><Content name="shell" node={<p>content</p>} /><Portal name="portal" /></Fixture>);
  expect(warning).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('content')).toBeNull();
  expect(getHost().contains(screen.getByRole('button', { name: 'portal' }))).toBe(true);
  view.rerender(<Fixture><Content name="shell" node={<p>content</p>} /></Fixture>);
  expect(getHost().contains(screen.getByText('content'))).toBe(true);
  expect(screen.queryByRole('button', { name: 'portal' })).toBeNull();
});

it('a later content registrant overrides a portal registrant and restores it on cleanup', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const view = render(<Fixture><Portal name="portal" /></Fixture>);
  view.rerender(<Fixture><Portal name="portal" /><Content name="shell" node={<p>content</p>} /></Fixture>);
  expect(screen.queryByRole('button', { name: 'portal' })).toBeNull();
  expect(getHost().contains(screen.getByText('content'))).toBe(true);
  view.rerender(<Fixture><Portal name="portal" /></Fixture>);
  expect(screen.queryByText('content')).toBeNull();
  expect(getHost().contains(screen.getByRole('button', { name: 'portal' }))).toBe(true);
});

it('rerendering the earlier registrant does not reclaim the slot', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const view = render(<Fixture><Content name="first" node={<p>first</p>} /><Content name="second" node={<p>second</p>} /></Fixture>);
  expect(screen.queryByText('first')).toBeNull();
  view.rerender(<Fixture><Content name="first" node={<p>first again</p>} /><Content name="second" node={<p>second</p>} /></Fixture>);
  expect(screen.queryByText('first again')).toBeNull();
  expect(getHost().contains(screen.getByText('second'))).toBe(true);
  view.rerender(<Fixture><Content name="first" node={<p>first again</p>} /></Fixture>);
  expect(getHost().contains(screen.getByText('first again'))).toBe(true);
});

it('a shell passing a fresh element every render settles without looping', () => {
  let renders = 0;
  function Shell() {
    renders += 1;
    const count = useRef(0);
    count.current += 1;
    return <Content name="shell" node={<p>fresh {count.current}</p>} />;
  }
  render(<StrictMode><Fixture><Shell /></Fixture></StrictMode>);
  expect(renders).toBeLessThan(10);
  expect(getHost().textContent).toMatch(/^fresh /);
});

it('suppresses the overlap warning in production', () => {
  vi.stubEnv('PROD', true);
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  render(<Fixture><Content name="first" node={<p>first</p>} /><Content name="second" node={<p>second</p>} /></Fixture>);
  expect(warning).not.toHaveBeenCalled();
  expect(getHost().contains(screen.getByText('second'))).toBe(true);
});
