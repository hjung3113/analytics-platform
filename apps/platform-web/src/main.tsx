import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './style.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBasePathLocation, I18nProvider, PlatformProvider } from '@ap/kernel';
import { setFeedbackOpsOrigin } from '@ap/menu-notice-voc/feedbackops-origin';
import { createAssembly } from '#platform-assembly';
import { readFeedbackOpsOrigin } from './feedbackops-origin';
import { createLocalQueryHistoryStore } from './query-history-store';
import { EQUIPMENT_AXES } from './equipmentAxes';
import { registry } from './menus';
import { appSlots } from './slots';
import { AppShell, RouteOutlet } from '@ap/shell';

// Composition root owns the FeedbackOps origin (issue #60 §4): menus never read the env, the adapter
// never carries it. Missing env → null → the /voc links and the space entries render disabled and the data still loads.
const feedbackOpsOrigin = readFeedbackOpsOrigin(import.meta.env.VITE_FEEDBACKOPS_ORIGIN);
setFeedbackOpsOrigin(feedbackOpsOrigin);

// The build picks the assembly (#153, ADR-0009): mock + DevTools in dev/--mode mock, the real adapter in production.
const assembly = createAssembly({ registry });
const queryHistory = createLocalQueryHistoryStore();
const location = import.meta.env.BASE_URL === '/' ? undefined : createBasePathLocation(import.meta.env.BASE_URL);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <PlatformProvider queryHistory={queryHistory} equipmentAxes={EQUIPMENT_AXES} adapter={assembly.adapter} registry={registry} location={location} slots={appSlots(assembly, feedbackOpsOrigin)}>
        <AppShell><RouteOutlet /></AppShell>
      </PlatformProvider>
    </I18nProvider>
  </StrictMode>,
);
