import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { PlatformPage, type PlatformPageProps } from '../PlatformPage';
import { QueryView } from '../../StateView';

const features = { export: false, savedView: false, annotate: false, compare: false };
const registryFor = (requiresScope: boolean) => createRegistry({
  spaces: [testSpace()],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope, context: noContext, pageType: 'analysis', features, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const mount = (props: Partial<PlatformPageProps> = {}, requiresScope = false, body: React.ReactNode = <p>본문</p>) =>
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registryFor(requiresScope)}><PlatformPage {...props}>{body}</PlatformPage></PlatformProvider></I18nProvider>);
const content = () => document.querySelector<HTMLElement>('[data-platform-page-content]')!;
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

const expected = {
  'flow/compact': 'flex-1 px-4 pb-4 pt-3', 'flow/comfortable': 'flex-1 px-8 pb-9 pt-7',
  'fill/compact': 'flex flex-1 flex-col px-4 pb-4 pt-3', 'fill/comfortable': 'flex flex-1 flex-col px-8 pb-9 pt-7',
};

describe('PlatformPage bodyInset (#1291)', () => {
  it.each(['flow', 'fill'] as const)('absent and "default" keep the content class string unchanged (%s)', layout => {
    for (const density of ['compact', 'comfortable'] as const) {
      for (const bodyInset of [undefined, 'default' as const]) {
        mount({ layout, density, bodyInset });
        expect(content().className).toBe(expected[`${layout}/${density}`]);
        expect(content()).not.toHaveAttribute('data-body-inset');
        cleanup();
      }
    }
  });

  it.each(['flow', 'fill'] as const)('"none" drops the body inset and padding and marks the element (%s)', layout => {
    mount({ layout, bodyInset: 'none' });
    expect(content().className).not.toMatch(/(^|\s)(px|pt|pb)-/);
    expect(content()).toHaveAttribute('data-body-inset', 'none');
    expect(content()).toHaveAttribute('tabindex', '-1');
    expect(content()).toContainElement(screen.getByText('본문'));
  });

  it('"none" keeps a gate inset from the edge', () => {
    window.history.replaceState(null, '', '/?v=1');
    mount({ bodyInset: 'none' }, true);
    const gate = content().firstElementChild as HTMLElement;
    expect(gate).toHaveClass('px-4');
    expect(gate.className).toMatch(/(^|\s)pt-/);
  });

  it('"none" keeps an outcome banner inset from the edge', async () => {
    const response = { outcome: 'error' as const, data: null, assessments: [], trust: null, correlationId: 'fixture', message: 'Same response' };
    const query = { missing: [], completedAt: null, response, status: 'done' as const, refetch: () => {} };
    mount({ bodyInset: 'none' }, false, <><QueryView query={query} widgetName="First">{() => null}</QueryView><QueryView query={query} widgetName="Second">{() => null}</QueryView></>);
    await screen.findByRole('group', { name: '위젯 상태 요약' });
    const banner = content().querySelector('[data-outcome-banner]')!;
    expect(banner.closest('[data-platform-page-content] > div')).toHaveClass('px-4', 'has-[[data-outcome-banner]]:pt-3');
  });

  it('"none" keeps the comfortable top spacing above a banner', async () => {
    const response = { outcome: 'error' as const, data: null, assessments: [], trust: null, correlationId: 'fixture', message: 'Same response' };
    const query = { missing: [], completedAt: null, response, status: 'done' as const, refetch: () => {} };
    mount({ bodyInset: 'none', density: 'comfortable' }, false, <><QueryView query={query} widgetName="First">{() => null}</QueryView><QueryView query={query} widgetName="Second">{() => null}</QueryView></>);
    await screen.findByRole('group', { name: '위젯 상태 요약' });
    const banner = content().querySelector('[data-outcome-banner]')!;
    expect(banner.closest('[data-platform-page-content] > div')).toHaveClass('has-[[data-outcome-banner]]:pt-7');
  });
});
