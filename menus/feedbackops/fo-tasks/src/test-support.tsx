/** Fixtures shared by the Task page tests. */
import { Suspense, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { ClipboardList } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { groupId, spaceId } from '@ap/contracts';
import { manifests } from './index';

export const registry = createRegistry({
  spaces: [{ id: spaceId('feedbackops'), label: { ko: 'FeedbackOps', en: 'FeedbackOps' }, description: { ko: '목적', en: 'Purpose' }, permission: 'feedbackops:access', carriedPageKeys: ['managedSystem', 'returnTo'], homeMenuId: 'fo-tasks' }],
  groups: [{ id: groupId('foTasks'), label: { ko: 'Tasks', en: 'Tasks' }, icon: ClipboardList, space: spaceId('feedbackops') }],
  menus: manifests,
});

const session = testSession(['platform:view', 'feedbackops:access'], { user: { id: 'admin', name: 'admin', title: { ko: 'admin', en: 'admin' } } });
const adapter = () => testAdapter({ session: () => session });

/** The shell's detail aside: a `DetailDrawer` portals its content here. */
function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}

/** Renders the matched route's page like the shell does. */
function Routes() {
  const { route } = usePlatform();
  if (route === null) return null;
  const Page = route.menu.component;
  return Page ? <Suspense fallback={null}><Page key={route.menu.id} params={route.params} /></Suspense> : null;
}

export function mountAt(url: string) {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter()} registry={registry}><DetailPanelSlotProvider><Routes /><SlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
}

/**
 * Loads the lazy page modules (and the FeedbackOps screens behind them) before a file's first mount: a cold import can take
 * seconds on CI, which would otherwise count against the first test's `findBy` wait.
 */
export const warmPages = () => Promise.all([import('./pages/FoTaskBoard'), import('./pages/FoTaskList'), import('./pages/FoMyTasks')]);
