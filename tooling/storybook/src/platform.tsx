import type { Decorator } from '@storybook/react-vite';
import { Gauge } from 'lucide-react';
import { groupId, spaceId, type ChartAnnotation } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, type PlatformLocation, type PlatformMenuEntry } from '@ap/kernel';
import { testAdapter, testMenu, testSession, testSpace } from '@ap/kernel/testing';

type Options = { features?: Partial<PlatformMenuEntry['features']>; address?: string; annotations?: ChartAnnotation[]; menu?: Partial<Omit<PlatformMenuEntry, 'features'>> };

/**
 * Mock platform (no backend): one analysis menu at `/`, a viewer session and an in-memory address bar. The chart stories add menu
 * `features`, a starting address (a Scope and period) and stored annotations; the session then also holds `analytics:view` and that Scope.
 * `menu` adds further manifest fields, e.g. the `panels`, `outputs` and page keys of the 분석 선택 page (ADR-0175).
 */
export function platformDecorator({ features, address: start = '/', annotations = [], menu }: Options = {}): Decorator {
  const registry = createRegistry({
    spaces: [testSpace({ homeMenuId: 'storybook' })],
    groups: [{ id: groupId('overview'), label: { ko: '분석', en: 'Analysis' }, icon: Gauge, space: spaceId('mars') }],
    menus: [testMenu({ id: 'storybook', label: { ko: '공정 가동 분석', en: 'Process utilization' }, pageType: 'analysis', icon: Gauge, ...menu, ...(features ? { features } : {}) })],
  });
  const session = testSession(features ? ['platform:view', 'analytics:view'] : ['platform:view'], {
    user: { id: 'sb', name: '홍길동', title: { ko: '분석가', en: 'Analyst' } },
    ...(features ? { scopes: [{ id: 'fab1', label: '1공장', grantedRooms: 4, totalRooms: 4 }] } : {}),
  });
  const adapter = testAdapter({ session: () => session, listAnnotations: async ({ chartId }) => ({ outcome: 'ok', data: { items: annotations.filter(note => note.chartId === chartId) }, assessments: [], trust: null, correlationId: 'storybook' }) });
  let address = start;
  const location: PlatformLocation = {
    read: () => address,
    push: url => { address = url; },
    replace: url => { address = url; },
    href: url => url,
    absoluteUrl: url => url,
  };
  return Story => <I18nProvider>
    <PlatformProvider adapter={adapter} registry={registry} location={location}>
      <Story />
    </PlatformProvider>
  </I18nProvider>;
}

export const withPlatform = platformDecorator();
