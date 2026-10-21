/** #575 PoC (throwaway): the floating `?variant=` switcher from the prototype skill (UI.md §4). Dev only. */
import { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isProductionEnv } from '@ap/ui';

export type PrototypeVariant = { key: string | null; label: string };

export function PrototypeSwitcher({ variants, current, onChange }: { variants: readonly PrototypeVariant[]; current: string | null; onChange: (key: string | null) => void }) {
  const index = Math.max(0, variants.findIndex(variant => variant.key === current));
  const step = (delta: number) => { onChange(variants[(index + delta + variants.length) % variants.length].key); };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="tablist"], [role="separator"]')) return;
      if (event.key === 'ArrowLeft') step(-1);
      else if (event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  });
  if (isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) return null;
  return <div role="group" aria-label="Prototype variants" data-prototype-switcher
    className="fixed bottom-14 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border-strong bg-text-primary px-2 py-1 text-xs text-surface-card shadow-lg">
    <button type="button" aria-label="Previous variant" className="grid size-6 place-items-center rounded-full hover:bg-surface-card/20" onClick={() => { step(-1); }}><ChevronLeft className="size-4" aria-hidden /></button>
    <span className="min-w-36 text-center tabular" aria-live="polite">{variants[index].label}</span>
    <button type="button" aria-label="Next variant" className="grid size-6 place-items-center rounded-full hover:bg-surface-card/20" onClick={() => { step(1); }}><ChevronRight className="size-4" aria-hidden /></button>
  </div>;
}
