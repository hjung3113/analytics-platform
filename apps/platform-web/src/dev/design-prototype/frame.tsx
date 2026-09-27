/**
 * #52 prototype — frame (throwaway). Reads `variant` from usePlatform().url. Without it the app renders exactly as
 * before (AppShell + RouteOutlet). With it: a data-variant wrapper, that variant's shell, CommandPalette, local
 * toasts (AppShell is not modified) and the switcher.
 *
 * In-app links are built by linkTo(), which never copies unregistered keys, so `variant` would be dropped on the
 * first click. The variant therefore sticks for this page lifetime (memory only) and is re-appended with replace;
 * a fresh load without ?variant, or the switcher's ×, leaves the prototype.
 */
import './tokens.css';
import { AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useI18n, usePlatform } from '@ap/kernel';
import { AppShell, CommandPalette, GlobalContextBar, RouteOutlet } from '@ap/shell';
import type { Variant } from './drawer';
import { ShellA } from './shell-a';
import { Switcher, VARIANT_LABEL, withVariant } from './switcher';

let sticky: Variant | null = null;

function parse(url: string): Variant | null {
  const m = /[?&]variant=([ABC])(?:&|$)/.exec(url);
  return m ? (m[1] as Variant) : null;
}

export function useVariant(): Variant | null {
  const { url } = usePlatform();
  const v = parse(url);
  if (v) sticky = v;
  return v ?? sticky;
}

/** Provider slot: the legacy Context bar only when no variant is active (the variant shells own Context). */
export function ContextBarSlot() {
  return useVariant() ? null : <GlobalContextBar />;
}

export function Frame() {
  const { url, navigate } = usePlatform();
  const variant = useVariant();
  const inUrl = parse(url);

  useEffect(() => {
    if (variant && !inUrl) navigate(withVariant(url, variant), { replace: true });
  }, [variant, inUrl, url, navigate]);
  useEffect(() => {
    if (!variant) return;
    document.body.dataset.variant = variant;
    return () => { delete document.body.dataset.variant; };
  }, [variant]);

  if (!variant) return <AppShell><RouteOutlet /></AppShell>;
  const exit = () => { sticky = null; navigate(withVariant(url, null), { replace: true }); };
  return <div data-variant={variant} className="h-full">
    {variant === 'A' ? <ShellA /> : <PartTwo variant={variant} />}
    <CommandPalette />
    <LocalToasts />
    <Switcher variant={variant} onExit={exit} />
  </div>;
}

function PartTwo({ variant }: { variant: Variant }) {
  return <div className="grid h-full place-items-center bg-[#f4f5f7] text-[13px] text-[#6b7280]">
    <p><span className="font-semibold text-[#111827]">{VARIANT_LABEL[variant]}</span> · part 2</p>
  </div>;
}

function LocalToasts() {
  const { toasts, dismissToast } = usePlatform();
  const { lang } = useI18n();
  return <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,90vw)] flex-col gap-2">
    {toasts.map(tst => {
      const Icon = tst.tone === 'danger' ? XCircle : tst.tone === 'warning' ? AlertTriangle : Info;
      const tone = tst.tone === 'danger' ? 'var(--dp-danger)' : tst.tone === 'warning' ? 'var(--dp-warning)' : 'var(--dp-muted)';
      return <div key={tst.id} role={tst.tone === 'danger' ? 'alert' : 'status'}
        className="dp-pop pointer-events-auto flex items-start gap-2 rounded-(--dp-radius-lg) border border-(--dp-border) bg-(--dp-surface) px-3 py-2.5 text-[12px] leading-[18px] shadow-[0_8px_24px_rgba(24,24,27,.10)]">
        <Icon className="mt-0.5 size-3.5 shrink-0" style={{ color: tone }} aria-hidden />
        <span className="flex-1 text-(--dp-text)">{tst.text}</span>
        <button type="button" aria-label={lang === 'ko' ? '닫기' : 'Dismiss'} onClick={() => dismissToast(tst.id)} className="text-(--dp-muted) hover:text-(--dp-text)"><X className="size-3.5" aria-hidden /></button>
      </div>;
    })}
  </div>;
}
