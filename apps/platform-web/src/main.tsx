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
import { ContextBarSlot, Frame } from './dev/design-prototype/frame';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      {/* #52 design prototype: Frame renders AppShell + RouteOutlet unless ?variant= is set; ContextBarSlot is null then. */}
      <PlatformProvider adapter={mockAdapter} registry={registry} slots={{ contextBar: <ContextBarSlot />, topBarTools: <DevTools /> }}>
        <Frame />
      </PlatformProvider>
    </I18nProvider>
  </StrictMode>,
);
