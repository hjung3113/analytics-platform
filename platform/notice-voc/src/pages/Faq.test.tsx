import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, type MenuEntry } from '@ap/kernel';
import { testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { contextCapabilities, groupId, NO_FEATURES, spaceId, type Permission } from '@ap/contracts';
import { manifests } from '../index';
import Faq from './Faq';

const opsHome: MenuEntry = {
  id: 'ops-home', primary: true, group: groupId('ops'), label: { ko: '운영 홈', en: 'Ops home' }, description: { ko: '', en: '' }, path: '/ops/home', icon: House,
  permission: 'notice:view', requiresScope: false, pageType: 'management', context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
};
const vocMenu: MenuEntry = { ...opsHome, id: 'voc', group: groupId('noticeVoc'), label: { ko: 'VOC', en: 'VOC' }, path: '/voc', permission: 'voc:view', primary: false };
const registry = createRegistry({
  permissions: [], spaces: [testSpace({ id: spaceId('ops'), homeMenuId: 'ops-home' })],
  groups: [{ id: groupId('noticeVoc'), label: { ko: '소통', en: 'Communication' }, icon: House, space: null }, { id: groupId('ops'), label: { ko: '운영', en: 'Ops' }, icon: House, space: spaceId('ops') }],
  menus: [...manifests, vocMenu, opsHome],
});

function mount(permissions: Permission[]) {
  window.history.replaceState(null, '', '/faq');
  const session = testSession(permissions); // a stable snapshot: a new object per read re-renders forever
  render(<I18nProvider><PlatformProvider equipmentAxes={[]} adapter={testAdapter({ session: () => session })} registry={registry}><Faq /></PlatformProvider></I18nProvider>);
}
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('FAQ placeholder', () => {
  it('declares a screen for the faq menu', () => {
    expect(manifests.find(m => m.id === 'faq')?.component).toBeDefined();
  });

  it('tells the user the FAQ is being prepared and links to VOC when it can be opened', () => {
    mount(['notice:view', 'voc:view']);
    expect(screen.getByText('자주 묻는 질문은 준비 중입니다. 궁금한 점은 VOC로 남겨 주세요.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'VOC 남기기' }).getAttribute('href')).toContain('/voc');
    expect(screen.queryByText(/레지스트리|Context/)).toBeNull();
  });

  it('hides the VOC link when the user cannot open it', () => {
    mount(['notice:view']);
    expect(screen.queryByRole('link', { name: 'VOC 남기기' })).toBeNull();
  });
});
