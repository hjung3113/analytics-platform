/// <reference types="vite/client" />
/**
 * #52 prototype — variant switcher bar (throwaway, dev only). Not part of any variant's design. It rewrites only the
 * `variant` query value (replace), so scope, period and page keys stay as they are.
 */
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { usePlatform } from '@ap/kernel';
import { getScenario, setScenario, subscribeServer } from '@ap/mock-server';
import { cn } from '@ap/ui';
import type { Variant } from './drawer';

export const VARIANTS: Variant[] = ['A', 'B', 'C'];
export const VARIANT_LABEL: Record<Variant, string> = { A: 'A — Linear/Vercel', B: 'B — Datadog/Grafana', C: 'C — Stripe Dashboard' };

/** Swap (or drop) the variant value without re-encoding any other query value. */
export function withVariant(url: string, variant: Variant | null): string {
  const [path, query = ''] = url.split('?');
  const rest = query.split('&').filter(p => p && !p.startsWith('variant='));
  if (variant) rest.push(`variant=${variant}`);
  return rest.length ? `${path}?${rest.join('&')}` : path;
}

const navFocus = () => !!document.activeElement?.closest('input,textarea,select,[contenteditable="true"],[role="listbox"],[role="menu"],[role="radiogroup"],[role="tablist"],[role="dialog"]');

export function Switcher({ variant, onExit }: { variant: Variant; onExit: () => void }) {
  const { url, navigate } = usePlatform();
  const scenario = useSyncExternalStore(subscribeServer, getScenario);
  const index = VARIANTS.indexOf(variant);
  const go = (step: number) => navigate(withVariant(url, VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length]), { replace: true });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || navFocus()) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!import.meta.env.DEV) return null;
  const errorOn = scenario === 'error';
  return <div role="toolbar" aria-label="Design variant" className="fixed bottom-4 left-1/2 z-[70] flex h-9 -translate-x-1/2 items-center rounded-full bg-[#111827] pl-1 pr-1 text-[12px] text-white shadow-[0_6px_20px_rgba(17,24,39,.28)]"
    style={{ fontFamily: '"Inter Variable", "Noto Sans KR", sans-serif' }}>
    <button type="button" onClick={() => go(-1)} aria-label="Previous variant (←)" title="←" className="grid size-7 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"><ChevronLeft className="size-4" aria-hidden /></button>
    <span aria-live="polite" className="min-w-[164px] px-1 text-center font-medium tabular-nums">{VARIANT_LABEL[variant]}</span>
    <span className="mr-1 text-[10px] tabular-nums text-white/40">{index + 1}/3</span>
    <button type="button" onClick={() => go(1)} aria-label="Next variant (→)" title="→" className="grid size-7 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"><ChevronRight className="size-4" aria-hidden /></button>
    <span aria-hidden className="mx-2 h-4 w-px bg-[#3f3f46]" />
    <button type="button" role="switch" aria-checked={errorOn} onClick={() => setScenario(errorOn ? 'normal' : 'error')}
      className="flex h-7 items-center gap-2 rounded-full px-2 text-white/80 hover:bg-white/10 hover:text-white">
      <span>위젯 오류</span>
      <span aria-hidden className={cn('relative h-4 w-7 rounded-full transition-colors', errorOn ? 'bg-[#ef4444]' : 'bg-white/20')}>
        <span className={cn('absolute top-0.5 size-3 rounded-full bg-white transition-[left]', errorOn ? 'left-[14px]' : 'left-0.5')} />
      </span>
    </button>
    <span aria-hidden className="mx-1 h-4 w-px bg-[#3f3f46]" />
    <button type="button" onClick={onExit} aria-label="Exit prototype" title="Exit prototype (drop ?variant)" className="grid size-7 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"><X className="size-3.5" aria-hidden /></button>
  </div>;
}
