import { cleanup, render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DetailPanelSlotProvider, useDetailPanelSlot, useDetailPanelSlotHost } from './DetailPanelSlot';
import { useDetailPanelContent } from './layout/useDetailPanelContent';
import { SurfacePauseScope } from './SurfacePauseScope';

function Host() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="Detail slot" data-open={String(slot.open)} data-activation={slot.activation} />;
}
const aside = () => screen.getByRole('complementary', { name: 'Detail slot', hidden: true });
const activation = () => Number(aside().getAttribute('data-activation'));
const isOpen = () => aside().getAttribute('data-open') === 'true';
/** A portal registrant: draws `label` into the host when it wins. */
function Portal({ label, onSuperseded }: { label: string; onSuperseded?: () => void }) {
  const host = useDetailPanelSlot({ onSuperseded });
  return host ? createPortal(<p>{label}</p>, host) : null;
}
function Content({ node }: { node: React.ReactNode }) { useDetailPanelContent(node); return null; }
const Fixture = ({ children }: { children?: React.ReactNode }) => <DetailPanelSlotProvider>{children}<Host /></DetailPanelSlotProvider>;
beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const tree = (paused: boolean, extra?: React.ReactNode, onSuperseded?: () => void) => <Fixture>
  <SurfacePauseScope paused={paused}><Portal label="D1" onSuperseded={onSuperseded} /></SurfacePauseScope>{extra}
</Fixture>;

it('S1: a paused winner keeps its place but is not open, is not superseded and does not bump the activation', () => {
  const superseded = vi.fn();
  const view = render(tree(false, undefined, superseded));
  expect(isOpen()).toBe(true);
  const start = activation();
  view.rerender(tree(true, undefined, superseded));
  expect(isOpen()).toBe(false);
  expect(superseded).not.toHaveBeenCalled();
  expect(activation()).toBe(start);
  expect(screen.getByText('D1')).toBeInTheDocument();
});

it('S1: resuming a registrant that is still the winner shows it again and counts as a newly visible detail', () => {
  const view = render(tree(true));
  const paused = activation();
  view.rerender(tree(false));
  expect(isOpen()).toBe(true);
  expect(activation()).toBe(paused + 1);
});

it('S1: a content registrant is not rendered while paused, and comes back on resume', () => {
  const content = (paused: boolean) => <Fixture><SurfacePauseScope paused={paused}><Content node={<p>D1 content</p>} /></SurfacePauseScope></Fixture>;
  const view = render(content(false));
  expect(screen.getByText('D1 content')).toBeInTheDocument();
  const start = activation();
  view.rerender(content(true));
  expect(screen.queryByText('D1 content')).toBeNull();
  expect(isOpen()).toBe(false);
  expect(activation()).toBe(start);
  view.rerender(content(false));
  expect(screen.getByText('D1 content')).toBeInTheDocument();
  expect(activation()).toBe(start + 1);
});

// Issue 4.4 table: scenario 2 (explicit D2 supersedes the paused D1), 3 (a later restore does not bring D1 back), 4 (nothing is revived).
it('S1 §4.4 ②③④: a newer registrant supersedes the paused one (callback runs once); resuming later does not revive it or bump the activation', () => {
  const superseded = vi.fn();
  const view = render(tree(true, undefined, superseded));
  view.rerender(tree(true, <Content node={<p>D2</p>} />, superseded));
  expect(superseded).toHaveBeenCalledTimes(1);
  expect(screen.getByText('D2')).toBeInTheDocument();
  expect(isOpen()).toBe(true);
  const afterD2 = activation();
  view.rerender(tree(false, <Content node={<p>D2</p>} />, superseded));
  expect(screen.getByText('D2')).toBeInTheDocument();
  expect(activation()).toBe(afterD2);
  expect(superseded).toHaveBeenCalledTimes(1);
});

it('S1: a registrant born under a paused surface does not push out a visible detail', () => {
  const superseded = vi.fn();
  const view = render(<Fixture>{[<Content key="c" node={<p>visible</p>} />]}</Fixture>);
  const start = activation();
  view.rerender(<Fixture>{[<Content key="c" node={<p>visible</p>} />, <SurfacePauseScope key="p" paused><Portal label="hidden" onSuperseded={superseded} /></SurfacePauseScope>]}</Fixture>);
  expect(screen.getByText('visible')).toBeInTheDocument();
  expect(screen.queryByText('hidden')).toBeNull();
  expect(isOpen()).toBe(true);
  expect(activation()).toBe(start);
  expect(superseded).not.toHaveBeenCalled();
});

it('S1: a paused registrant that is not the winner changes nothing when it pauses or resumes', () => {
  const view = render(<Fixture><SurfacePauseScope paused={false}><Content node={<p>old</p>} /></SurfacePauseScope><Content node={<p>new</p>} /></Fixture>);
  const start = activation();
  view.rerender(<Fixture><SurfacePauseScope paused><Content node={<p>old</p>} /></SurfacePauseScope><Content node={<p>new</p>} /></Fixture>);
  expect(isOpen()).toBe(true);
  view.rerender(<Fixture><SurfacePauseScope paused={false}><Content node={<p>old</p>} /></SurfacePauseScope><Content node={<p>new</p>} /></Fixture>);
  expect(activation()).toBe(start);
  expect(screen.getByText('new')).toBeInTheDocument();
});

it('nested scopes pause when any of them does', () => {
  const view = render(<Fixture><SurfacePauseScope paused><SurfacePauseScope paused={false}><Content node={<p>x</p>} /></SurfacePauseScope></SurfacePauseScope></Fixture>);
  expect(isOpen()).toBe(false);
  view.unmount();
});
