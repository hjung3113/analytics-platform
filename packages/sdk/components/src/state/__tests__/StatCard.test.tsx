import { cleanup, render, screen } from '@testing-library/react';
import { Timer } from 'lucide-react';
import { afterEach, expect, it } from 'vitest';
import { PageDensityProvider } from '../../pageDensity';
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
