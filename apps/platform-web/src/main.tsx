import '@fontsource-variable/inter';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/500.css';
import '@fontsource/noto-sans-kr/600.css';
import './style.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { I18nProvider } from './kernel/i18n';
import { DevTools } from './dev/DevTools';
import { PlatformProvider } from './kernel/platform';
import { mockAdapter } from './mock/adapter';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <PlatformProvider adapter={mockAdapter} devTools={<DevTools />}>
        <App />
      </PlatformProvider>
    </I18nProvider>
  </StrictMode>,
);
