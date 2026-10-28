import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './style.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBasePathLocation, I18nProvider, PlatformProvider } from '@ap/kernel';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { homeTodoSlot } from '@ap/feature-bridge/home-todo-slot';
import { navCountsSlot } from '@ap/feature-bridge/nav-counts';
import { notificationsSlot } from '@ap/feature-bridge/notifications-slot';
import { savedViewsSlot } from '@ap/feature-bridge/saved-views';
import { scopeControlSlot } from '@ap/feature-bridge/scope-control';
import { vocComposeSlot } from '@ap/feature-bridge/voc-compose-slot';
import { createAssembly } from '#platform-assembly';
import { managedSystemFor } from './feedbackops-systems';
import { createLocalQueryHistoryStore } from './query-history-store';
import { EQUIPMENT_AXES } from './equipmentAxes';
import { registry, SPACE_ID_MIGRATIONS } from './menus';
import { appSlots } from './slots';
import { startOrFail } from './startup-failure';
import { AppShell, RouteOutlet } from '@ap/shell';


// The build picks the assembly (#153, ADR-0009): mock + DevTools in dev/--mode mock, the real adapter in production.
// It may be asynchronous (the real assembly awaits the bootstrap, #154), so the tree mounts after it answers; it can
// also ask for a redirect (login) or a replacement screen (server unavailable) instead of the app.
const queryHistory = createLocalQueryHistoryStore();
// One slot object for the page's lifetime: its `Compose` component must keep its identity so a held draft does not remount.
const vocCompose = vocComposeSlot(managedSystemFor);
const location = import.meta.env.BASE_URL === '/' ? undefined : createBasePathLocation(import.meta.env.BASE_URL);
const root = createRoot(document.getElementById('root')!);

void startOrFail(root, async () => {
  const assembly = await Promise.resolve(createAssembly({ registry }));
  if ('redirect' in assembly) {
    window.location.replace(assembly.redirect);
    return;
  }
  if ('screen' in assembly) {
    root.render(<StrictMode>{assembly.screen}</StrictMode>);
    return;
  }
  // The bridge screens' FeedbackOps API comes from the assembly (ADR-0071); mock builds have none → "실서버 필요".
  setFeatureApi(assembly.featureApi ?? null);
  root.render(
    <StrictMode>
      <I18nProvider>
        <PlatformProvider spaceIdMigrations={SPACE_ID_MIGRATIONS} queryHistory={queryHistory} savedViews={assembly.savedViews} equipmentAxes={EQUIPMENT_AXES} adapter={assembly.adapter} registry={registry} location={location} slots={appSlots(assembly, notificationsSlot, vocCompose, homeTodoSlot, scopeControlSlot, navCountsSlot, savedViewsSlot)}>
          <AppShell><RouteOutlet /></AppShell>
        </PlatformProvider>
      </I18nProvider>
    </StrictMode>,
  );
});
