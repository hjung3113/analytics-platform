import type { Decorator } from '@storybook/react-vite';
import { Gauge } from 'lucide-react';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, type PlatformLocation } from '@ap/kernel';
import { testAdapter, testMenu, testSession, testSpace } from '@ap/kernel/testing';

// Mock platform for every story (no backend): one analysis menu at `/`, a viewer session and an in-memory address bar.
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'storybook' })],
  groups: [{ id: groupId('overview'), label: { ko: '분석', en: 'Analysis' }, icon: Gauge, space: spaceId('mars') }],
  menus: [testMenu({ id: 'storybook', label: { ko: '공정 가동 분석', en: 'Process utilization' }, pageType: 'analysis', icon: Gauge })],
});
const session = testSession(['platform:view'], { user: { id: 'sb', name: '홍길동', title: { ko: '분석가', en: 'Analyst' } } });
const adapter = testAdapter({ session: () => session });
let address = '/';
const location: PlatformLocation = {
  read: () => address,
  push: url => { address = url; },
  replace: url => { address = url; },
  href: url => url,
  absoluteUrl: url => url,
};

export const withPlatform: Decorator = Story => (
  <I18nProvider>
    <PlatformProvider adapter={adapter} registry={registry} location={location}>
      <Story />
    </PlatformProvider>
  </I18nProvider>
);
