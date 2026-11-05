/**
 * Hook-level data access of the Item subject picker (#1196 f): the model's current published spec is the picker's tree.
 * The item write itself stays `itemCreate` / `itemRevise` with `subjects[]` (`ItemSubjectInput`).
 */
import { useMenuQuery, type QueryState } from '@ap/kernel';
import { modelSpecEndpoint, type ModelSpecData, type ModelSpecEffective, type ModelSpecUnchanged } from '../../endpoints';

/** The owner model's published spec (`null` data = the model has no published spec: any well-formed key is accepted and reads back `no_spec`). */
export function useSubjectPickerSpec(modelId: string | null, enabled = true): QueryState<ModelSpecData | ModelSpecUnchanged | ModelSpecEffective | null> {
  return useMenuQuery(modelSpecEndpoint, { modelId: modelId ?? '' }, enabled && !!modelId);
}
