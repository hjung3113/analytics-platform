// Persisted pins stay immutable; their read projection must not disclose a hidden knowledge chain.
import type { LogDatasetsDeps } from './deps.js';
import type { ProfilePin } from './domain/baseline-input.js';

export async function visibleProfilePin(deps: LogDatasetsDeps, actor: { workspace_id: string; actor_id: string }, pin: ProfilePin): Promise<ProfilePin> {
  const spec = pin.specPin;
  if (!spec) return pin;
  const { workspace_id: ws, actor_id: viewer } = actor;
  const model = await deps.knowledgeLookup.getModel(deps.db, ws, spec.modelId, viewer);
  const software = !spec.softwareId || await deps.knowledgeLookup.getSoftware(deps.db, ws, spec.modelId, spec.softwareId, viewer);
  if (model && software) return pin;
  const { specPin: _hidden, ...visible } = pin;
  return visible;
}
