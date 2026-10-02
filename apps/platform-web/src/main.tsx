import '@fontsource-variable/inter';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/500.css';
import '@fontsource/noto-sans-kr/600.css';
import './style.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { setFeedbackOpsOrigin } from '@ap/menu-notice-voc/feedbackops-origin';
import { createAssembly } from '#platform-assembly';
import { readFeedbackOpsOrigin } from './feedbackops-origin';
import { registry } from './menus';
import { AppShell, GlobalContextBar, RouteOutlet } from '@ap/shell';

// Composition root owns the FeedbackOps origin (issue #60 §4): menus never read the env, the adapter
// never carries it. Missing env → null → the /voc links render disabled and the data still loads.
setFeedbackOpsOrigin(readFeedbackOpsOrigin(import.meta.env.VITE_FEEDBACKOPS_ORIGIN));

// The build picks the assembly (#153, ADR-0009): mock + DevTools in dev/--mode mock, the real adapter in production.
const assembly = createAssembly({ registry });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <PlatformProvider adapter={assembly.adapter} registry={registry} slots={{ contextBar: <GlobalContextBar />, topBarTools: assembly.topBarTools }}>
        <AppShell><RouteOutlet /></AppShell>
      </PlatformProvider>
    </I18nProvider>
  </StrictMode>,
);
