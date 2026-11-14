import { cleanup, render, screen } from '@testing-library/react';
import { Timer } from 'lucide-react';
import { afterEach, expect, it } from 'vitest';
import { PageDensityProvider } from '../../pageDensity';
import { EmbeddedPane, InWorkspacePanelProvider } from '../../workspace/panelContext';
import { WorkspaceQueryBarContext } from '../../archetypes/WorkspaceQueryBar';
import { StatCard } from '../StatCard';

afterEach(cleanup);
const card = () => screen.getByText('사이클타임').closest('div') as HTMLElement;
const mount = (density?: 'compact' | 'comfortable') => render(density
  ? <PageDensityProvider value={density}><StatCard icon={Timer} label="사이클타임" value="12" /></PageDensityProvider>
  : <StatCard icon={Timer} label="사이클타임" value="12" />);

it('compact page: 12px inner padding and an 8px icon–body gap; number sizes unchanged', () => {
  mount('compact');
  expect(card().className).toContain('p-3');
  expect(card().className).toContain('gap-2');
  expect(card().className).not.toMatch(/\bp-4\b|\bgap-3\b/);
  expect(screen.getByText('12').className).toContain('t-stat');
});

it.each([[undefined], ['comfortable' as const]])('comfortable (%s): 16px padding and 12px gap as before', density => {
  mount(density);
  expect(card().className).toContain('p-4');
  expect(card().className).toContain('gap-3');
  expect(card().className).not.toMatch(/\bp-3\b|\bgap-2\b/);
});

it.each([
  ['purple', 'teal'],
  ['amber', 'blue'],
] as const)('deprecated %s chip renders exactly like %s for the migration release', (legacy, supported) => {
  const { container, rerender } = render(<StatCard icon={Timer} label="사이클타임" value="12" chip={legacy} />);
  const legacyClass = container.querySelector('span')!.className;
  rerender(<StatCard icon={Timer} label="사이클타임" value="12" chip={supported} />);
  expect(legacyClass).toBe(container.querySelector('span')!.className);
  expect(legacyClass).toContain(`bg-icon-${supported}-soft`);
});

const foldedWorkspace = { status: null, parameterTarget: null, setParameterTarget: () => {}, toolbarTarget: null, setToolbarTarget: () => {} };
it.each(['compact', 'comfortable'] as const)('folded workspace StatCard has one pane border at %s density, retaining rounded selection and hover', density => {
  const view = render(<WorkspaceQueryBarContext.Provider value={foldedWorkspace}><PageDensityProvider value={density}><InWorkspacePanelProvider value><StatCard icon={Timer} label="사이클타임" value="12" active onClick={() => {}} /></InWorkspacePanelProvider></PageDensityProvider></WorkspaceQueryBarContext.Provider>);
  const tile = screen.getByRole('button', { name: /사이클타임/ });
  expect(tile).not.toHaveClass('border');
  expect(tile).toHaveClass('rounded-lg', 'ring-1', 'ring-accent-primary', 'hover:bg-surface-row-hover');
  view.rerender(<StatCard icon={Timer} label="사이클타임" value="12" />);
  expect(card()).toHaveClass('border', 'border-border-subtle');
});

it('board pane StatCards keep their existing border', () => {
  render(<EmbeddedPane><StatCard icon={Timer} label="사이클타임" value="12" /></EmbeddedPane>);
  expect(card()).toHaveClass('border', 'border-border-subtle');
});

it('keeps workspace StatCard borders when that workspace is inside a board pane (#1941)', () => {
  render(<EmbeddedPane><InWorkspacePanelProvider value><StatCard icon={Timer} label="사이클타임" value="12" /></InWorkspacePanelProvider></EmbeddedPane>);
  expect(card()).toHaveClass('border', 'border-border-subtle');
});
