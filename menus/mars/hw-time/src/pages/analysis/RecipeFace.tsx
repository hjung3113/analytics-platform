import { lazy, Suspense, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { Text } from '@ap/kernel';

export const RECIPE_ITEM: Text = { ko: '이 패널 만든 방법', en: 'How this panel is built' };

/** The recipe back and its source-counting model load only when a panel is turned over,
 * so the HW Time screen chunk carries no `?raw` sources (v0.40 review-quality Q3).
 */
const RecipeBackFor = lazy(() => import('./PanelRecipe'));

/** Panel frame that turns over to its recipe; the front stays while the back loads. */
export function RecipePanel({ id, open, context, onClose, children }: { id: string; open: boolean; context: Readonly<Record<string, unknown>>; onClose: () => void; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  useLayoutEffect(() => {
    if (open || !returnFocus.current) return;
    returnFocus.current = false;
    const target = root.current;
    if (target && (document.activeElement === document.body || target.contains(document.activeElement))) target.focus({ preventScroll: true });
  }, [open]);
  const close = () => {
    returnFocus.current = root.current?.contains(document.activeElement) ?? false;
    onClose();
  };
  return <div ref={root} tabIndex={-1} className="h-full min-h-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
    {open ? <Suspense fallback={children}><RecipeBackFor id={id} context={context} onClose={close} fallback={children} /></Suspense> : children}
  </div>;
}
