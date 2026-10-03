import '@fontsource-variable/inter';
import '@fontsource/noto-sans-kr/400.css';
import '@fontsource/noto-sans-kr/500.css';
import '@fontsource/noto-sans-kr/600.css';
// PROTOTYPE (#52): FeedbackOps webfonts (unlayered, ADR-0058) — used only by the B·C stylesheet's font stack.
import '@fontsource-variable/jetbrains-mono';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
// PROTOTYPE (#52): one stylesheet per design variant — A = the platform's own, B·C = FeedbackOps contract + platform extension.
import platformCss from './style.css?inline';
import fopsCss from './proto/fops-theme.css?inline';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { setFeedbackOpsOrigin } from '@ap/menu-notice-voc/feedbackops-origin';
import { createAssembly } from '#platform-assembly';
import { readFeedbackOpsOrigin } from './feedbackops-origin';
import { registry } from './menus';
import { AppShell, GlobalContextBar, PrototypeSwitcher, RouteOutlet } from '@ap/shell';
import { getProtoVariant, subscribeProtoVariant } from '@ap/ui';

function applyVariantStylesheet() {
  const variant = getProtoVariant();
  let el = document.getElementById('proto-theme') as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = 'proto-theme'; document.head.appendChild(el); }
  el.textContent = variant === 'A' ? platformCss : fopsCss;
  document.documentElement.dataset.protoVariant = variant;
}
applyVariantStylesheet();
subscribeProtoVariant(applyVariantStylesheet);

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
        <PrototypeSwitcher />
      </PlatformProvider>
    </I18nProvider>
  </StrictMode>,
);
