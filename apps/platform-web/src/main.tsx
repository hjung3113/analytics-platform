import '@fontsource-variable/inter';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/500.css';
import '@fontsource/noto-sans-kr/600.css';
import './style.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { DevTools } from './dev/DevTools';
import { registry } from './menus';
import { mockAdapter } from './mock/adapter';
import { GlobalContextBar } from './shell/GlobalContextBar';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <PlatformProvider adapter={mockAdapter} registry={registry} slots={{ contextBar: <GlobalContextBar />, topBarTools: <DevTools /> }}>
        <App />
      </PlatformProvider>
    </I18nProvider>
  </StrictMode>,
);
