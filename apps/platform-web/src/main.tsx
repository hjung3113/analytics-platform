import '@fontsource-variable/inter';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/500.css';
import '@fontsource/noto-sans-kr/600.css';
import './style.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { setFeedbackOpsOrigin } from '@ap/menu-notice-voc/feedbackops-origin';
// <gen:menu-mock-imports>
import { analyticsMock } from '@ap/menu-analytics/mock';
import { equipmentMock } from '@ap/menu-equipment/mock';
import { homeMock } from '@ap/menu-home/mock';
import { metricsMock } from '@ap/menu-metrics/mock';
import { noticeVocMock } from '@ap/menu-notice-voc/mock';
// </gen:menu-mock-imports>
import { DevTools } from './dev/DevTools';
// THROWAWAY prototype for #172 — do not merge
import { TableExportVariantSwitcher } from './dev/TableExportVariantSwitcher';
import { readFeedbackOpsOrigin } from './feedbackops-origin';
import { registry } from './menus';
import { createMockAdapter } from '@ap/mock-server';
import { AppShell, GlobalContextBar, RouteOutlet } from '@ap/shell';

// Composition root owns the FeedbackOps origin (issue #60 §4): menus never read the env, the adapter
// never carries it. Missing env → null → the /voc links render disabled and the data still loads.
setFeedbackOpsOrigin(readFeedbackOpsOrigin(import.meta.env.VITE_FEEDBACKOPS_ORIGIN));

const adapter = createMockAdapter({
  endpoints: [
    // <gen:menu-mock-spreads>
    ...analyticsMock,
    ...equipmentMock,
    ...homeMock,
    ...metricsMock,
    ...noticeVocMock,
    // </gen:menu-mock-spreads>
  ],
  registry,
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <PlatformProvider adapter={adapter} registry={registry} slots={{ contextBar: <GlobalContextBar />, topBarTools: <DevTools /> }}>
        <AppShell><RouteOutlet /></AppShell>
        {/* THROWAWAY prototype for #172 — do not merge */}
        <TableExportVariantSwitcher />
      </PlatformProvider>
    </I18nProvider>
  </StrictMode>,
);
