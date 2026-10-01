// THROWAWAY prototype for #172 — do not merge
/**
 * #172 prototype switcher bar (dev chrome only, never shipped): rewrites only the `variant` query
 * value with `replace`, so scope, period and page keys stay untouched. Same approach as the #52
 * switcher (`.review/old-switcher-reference.tsx.txt`), minus the scenario toggle.
 */
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect } from 'react';
import { clearTableExportVariant, TABLE_EXPORT_VARIANTS, TABLE_EXPORT_VARIANT_LABELS, type TableExportVariant } from '@ap/components';
import { usePlatform } from '@ap/kernel';
import { isProductionEnv } from '@ap/ui';

/** Swap (or drop) the variant value without re-encoding any other query value. */
function withVariant(url: string, variant: TableExportVariant | null): string {
  const [path, query = ''] = url.split('?');
  const rest = query.split('&').filter(pair => pair && !pair.startsWith('variant='));
  if (variant) rest.push(`variant=${variant}`);
  return rest.length ? `${path}?${rest.join('&')}` : path;
}

const navFocus = () => !!document.activeElement?.closest('input,textarea,select,[contenteditable="true"],[role="listbox"],[role="menu"],[role="radiogroup"],[role="tablist"],[role="dialog"]');

export function TableExportVariantSwitcher() {
  const { url, navigate } = usePlatform();
  const raw = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '').get('variant');
  const current = TABLE_EXPORT_VARIANTS.find(v => v === raw) ?? null;
  const index = current ? TABLE_EXPORT_VARIANTS.indexOf(current) : -1;
  const go = (step: number) => navigate(withVariant(url, TABLE_EXPORT_VARIANTS[(index + step + TABLE_EXPORT_VARIANTS.length) % TABLE_EXPORT_VARIANTS.length]), { replace: true });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || navFocus()) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Same dev/prod gate as @ap/ui Button (no vite/client types in this app): visible in dev, absent in production builds.
  if (isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) return null;

  return <div role="toolbar" aria-label="표 내보내기 프로토타입 변형 (#172)" className="fixed bottom-4 left-1/2 z-[70] flex h-9 -translate-x-1/2 items-center rounded-pill bg-nav pl-1 pr-1 text-[12px] text-nav-text shadow-lg">
    <button type="button" onClick={() => go(-1)} aria-label="이전 변형 (←)" className="grid size-7 place-items-center rounded-pill text-nav-text hover:bg-nav-hover hover:text-text-on-accent"><ChevronLeft className="size-4" aria-hidden /></button>
    <span aria-live="polite" className="min-w-44 px-1 text-center font-medium tabular">{current ? TABLE_EXPORT_VARIANT_LABELS[current] : '변형 없음 (?variant 없음)'}</span>
    <span className="mr-1 text-[10px] tabular text-nav-text-faint">{index + 1}/3</span>
    <button type="button" onClick={() => go(1)} aria-label="다음 변형 (→)" className="grid size-7 place-items-center rounded-pill text-nav-text hover:bg-nav-hover hover:text-text-on-accent"><ChevronRight className="size-4" aria-hidden /></button>
    <span aria-hidden className="mx-2 h-4 w-px bg-nav-divider" />
    <button type="button" onClick={() => { clearTableExportVariant(); navigate(withVariant(url, null), { replace: true }); }} aria-label="프로토타입 종료 (?variant 제거)" className="grid size-7 place-items-center rounded-pill text-nav-text-faint hover:bg-nav-hover hover:text-text-on-accent"><X className="size-3.5" aria-hidden /></button>
  </div>;
}
