// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import RegistryCatalog from './RegistryCatalog';
import UsageOverview from './UsageOverview';
import { groupId, spaceId } from '@ap/contracts';

afterEach(cleanup);

const registry = createRegistry({
  spaces: [{ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
  groups: [{ id: groupId('admin'), label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: spaceId('operations') }],
  menus: manifests,
});
const session = testSession(['console:access', 'platform:view'], { user: { id: 'admin-a', name: 'admin-a', title: { ko: '관리자', en: 'Administrator' } } });
const adapter = testAdapter({ session: () => session });

describe.each([
  ['UsageOverview', '/admin/usage', UsageOverview],
  ['RegistryCatalog', '/admin/registry', RegistryCatalog],
] as const)('%s invalid sort/page (ADR-0034 sentences)', (_name, path, Page) => {
  it('states both exact value sentences and Reset clears sort and page', async () => {
    window.history.replaceState(null, '', `${path}?sort=bogus&page=0`);
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Page /></PlatformProvider></I18nProvider>);
    const alert = (await screen.findAllByRole('alert')).find(el => el.textContent?.includes('bogus'))!;
    expect([...alert.querySelectorAll('p')].map(p => p.textContent)).toEqual([
      '정렬 “bogus”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
      '페이지 “0”는 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
    ]);
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    const params = new URLSearchParams(window.location.search);
    expect(params.has('sort')).toBe(false);
    expect(params.has('page')).toBe(false);
  });
});
