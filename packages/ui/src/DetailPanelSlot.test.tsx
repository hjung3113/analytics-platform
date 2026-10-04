import { cleanup, render, screen } from '@testing-library/react';
import { createContext, StrictMode, useContext } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { DetailPanelSlotProvider, useDetailPanelSlot, useDetailPanelSlotHost } from './DetailPanelSlot';

const PageContext = createContext('missing');
function Consumer({ name }: { name: string }) {
  const host = useDetailPanelSlot();
  const value = useContext(PageContext);
  return host ? createPortal(<button>{name}:{value}</button>, host) : null;
}
function Host() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="Detail slot" data-open={slot.open} />;
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
