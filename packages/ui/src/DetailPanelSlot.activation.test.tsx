import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DetailPanelSlotProvider, useDetailPanelSlot, useDetailPanelSlotHost } from './DetailPanelSlot';
import { useDetailPanelContent } from './layout/useDetailPanelContent';

function Host() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="Detail slot" data-activation={slot.activation} />;
}
const activation = () => Number(screen.getByRole('complementary', { name: 'Detail slot' }).getAttribute('data-activation'));
function Portal() { useDetailPanelSlot(); return null; }
function Content({ node }: { node: unknown }) { useDetailPanelContent(node as null | undefined); return null; }
function Fixture({ children }: { children?: React.ReactNode }) {
  return <DetailPanelSlotProvider>{children}<Host /></DetailPanelSlotProvider>;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// The shell hides the VOC drawer on each increment (06 §13): only a detail that becomes visible counts.
it.each<[string, () => React.ReactElement, () => React.ReactElement, number]>([
  ['a new portal registrant', () => <Fixture />, () => <Fixture><Portal /></Fixture>, 1],
  ['a new non-null content registrant', () => <Fixture />, () => <Fixture><Content node={<p>a</p>} /></Fixture>, 1],
  ['null → node for the same registrant', () => <Fixture><Content node={null} /></Fixture>, () => <Fixture><Content node={<p>a</p>} /></Fixture>, 1],
  ['a fresh node for an open content registrant (ModuleScreen case)', () => <Fixture><Content node={<p>a</p>} /></Fixture>, () => <Fixture><Content node={<p>a</p>} /></Fixture>, 0],
  ['a new closed (null) registrant', () => <Fixture />, () => <Fixture><Content node={null} /></Fixture>, 0],
  ['node → null for the same registrant', () => <Fixture><Content node={<p>a</p>} /></Fixture>, () => <Fixture><Content node={null} /></Fixture>, 0],
  ['clearContent (undefined)', () => <Fixture><Content node={<p>a</p>} /></Fixture>, () => <Fixture><Content node={undefined} /></Fixture>, 0],
])('activation after %s', (_name, before, after, delta) => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const view = render(before());
  const start = activation();
  view.rerender(after());
  expect(activation() - start).toBe(delta);
});

it('unregister and resume of the previous registrant do not increment', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fixture = (withPortal: boolean) => <Fixture>{[<Content key="c" node={<p>first</p>} />, withPortal && <Portal key="p" />]}</Fixture>;
  const view = render(fixture(false));
  view.rerender(fixture(true));
  const start = activation();
  view.rerender(fixture(false));
  expect(activation()).toBe(start);
});
