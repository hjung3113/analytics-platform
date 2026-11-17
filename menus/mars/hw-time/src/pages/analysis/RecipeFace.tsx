import { lazy, type ReactNode } from 'react';
import { PanelRecipeFrame } from '@ap/components';

/** The recipe back and its source-counting model load only when a panel is turned over,
 * so the HW Time screen chunk carries no `?raw` sources (v0.40 review-quality Q3).
 */
const RecipeBackFor = lazy(() => import('./PanelRecipe'));

/** Panel frame that turns over to its recipe; the front stays while the back loads. */
export function RecipePanel({ id, open, context, onClose, children }: { id: string; open: boolean; context: Readonly<Record<string, unknown>>; onClose: () => void; children: ReactNode }) {
  return <PanelRecipeFrame open={open} onClose={onClose} back={close => <RecipeBackFor id={id} context={context} onClose={close} fallback={children} />}>{children}</PanelRecipeFrame>;
}
