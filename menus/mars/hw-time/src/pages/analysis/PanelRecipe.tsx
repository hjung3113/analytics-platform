import type { ReactNode } from 'react';
import { usePlatform } from '@ap/kernel';
import { PanelRecipeBack } from '@ap/components';
import { manifests } from '../../index';
import { panelRecipe } from './recipeModel';

/** Lazy back for `RecipePanel`: the SDK recipe of the registered panel, or the front when the Registry has none. */
export default function RecipeBackFor({ id, context, onClose, fallback }: { id: string; context: Readonly<Record<string, unknown>>; onClose: () => void; fallback: ReactNode }) {
  const { registry } = usePlatform();
  const recipe = panelRecipe(registry.panels(manifests[0]!.id).find(panel => panel.id === id), context, { primary: false });
  return recipe ? <PanelRecipeBack recipe={recipe} onClose={onClose} /> : <>{fallback}</>;
}
