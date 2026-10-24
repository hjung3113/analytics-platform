/** Fixtures shared by the 대시보드 page and scope slot tests. */
import { Suspense, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { ListTodo } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { manifests } from './index';

export const registry = createRegistry({
  spaces: [{ id: spaceId('feedbackops'), label: { ko: 'FeedbackOps', en: 'FeedbackOps' }, description: { ko: '목적', en: 'Purpose' }, permission: 'feedbackops:access', carriedPageKeys: ['managedSystem'], homeMenuId: 'fo-dashboard' }],
  groups: [{ id: groupId('foDashboard'), label: { ko: '대시보드', en: 'Dashboard' }, icon: ListTodo, space: spaceId('feedbackops') }],
  menus: manifests,
});

const session = testSession(['platform:view', 'feedbackops:access'], { user: { id: 'admin', name: 'admin', title: { ko: 'admin', en: 'admin' } } });
const adapter = () => testAdapter({ session: () => session });

/** Renders the matched route's page like the shell does. */
function Routes() {
  const { route } = usePlatform();
  if (route === null) return null;
  const Page = route.menu.component;
  return Page ? <Suspense fallback={null}><Page key={route.menu.id} params={route.params} /></Suspense> : null;
}

export function mountAt(url: string, extra?: ReactNode) {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter()} registry={registry}><Routes />{extra}</PlatformProvider></I18nProvider>);
}
