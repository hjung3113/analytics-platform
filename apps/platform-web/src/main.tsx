import '@fontsource-variable/inter';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/500.css';
import '@fontsource/noto-sans-kr/600.css';
import './style.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { DevTools } from './dev/DevTools';
import { registry } from './menus';
import { mockAdapter } from '@ap/mock-server';
import { AppShell, GlobalContextBar, RouteOutlet } from '@ap/shell';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <PlatformProvider adapter={mockAdapter} registry={registry} slots={{ contextBar: <GlobalContextBar />, topBarTools: <DevTools /> }}>
        <AppShell><RouteOutlet /></AppShell>
      </PlatformProvider>
    </I18nProvider>
  </StrictMode>,
);
