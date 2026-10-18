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
import { registry } from './menus';
import { appSlots } from './slots';
import { AppShell, RouteOutlet } from '@ap/shell';
// THROWAWAY #423 — never merge.
import { PrototypeVariants } from './proto/PrototypeVariants';

// Composition root owns the FeedbackOps origin (issue #60 §4): menus never read the env, the adapter
// never carries it. Missing env → null → the /voc links render disabled and the data still loads.
setFeedbackOpsOrigin(readFeedbackOpsOrigin(import.meta.env.VITE_FEEDBACKOPS_ORIGIN));

// The build picks the assembly (#153, ADR-0009): mock + DevTools in dev/--mode mock, the real adapter in production.
const assembly = createAssembly({ registry });
const location = import.meta.env.BASE_URL === '/' ? undefined : createBasePathLocation(import.meta.env.BASE_URL);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <PlatformProvider adapter={assembly.adapter} registry={registry} location={location} slots={appSlots(assembly)}>
        <PrototypeVariants><AppShell><RouteOutlet /></AppShell></PrototypeVariants>
      </PlatformProvider>
    </I18nProvider>
  </StrictMode>,
);
