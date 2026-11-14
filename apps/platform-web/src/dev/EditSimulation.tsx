import { DEV_MESSAGES } from './messages';
import { useState } from 'react';
import { useI18n, useUnsavedGuard } from '@ap/kernel';
import { Button, Checkbox, Input, Label } from '@ap/ui';

/**
 * Mock-only stand-in for a screen with unsaved edits (#1388 node c). Real screens (the create drawer, the status move, the model spec drawer)
 * now adopt `useUnsavedGuard`; this fixture stays until the E2E moves to one of them, and still reaches the shell's leave dialog from the demo tools.
 * It registers exactly like a consumer would: dirty registers, clearing the draft or switching it off unregisters.
 * State lives in `DevTools` (always mounted in the rail), so it survives the popover closing and every navigation.
 */
const CUSTOM_MESSAGE = DEV_MESSAGES.editSimulation3ChangesInTheSpecEditorAre;
const copy = {
  title: DEV_MESSAGES.editSimulationSimulateEditing,
  hint: DEV_MESSAGES.editSimulationTurnOnAndTypeAChangeTo,
  draft: DEV_MESSAGES.editSimulationChanges,
  custom: DEV_MESSAGES.editSimulationCustomMessage,
  reset: DEV_MESSAGES.editSimulationReset,
};

export function useEditSimulation() {
  const [enabled, setEnabled] = useState(false);
  const [draft, setDraft] = useState('');
  const [custom, setCustom] = useState(false);
  useUnsavedGuard(enabled && draft !== '', { message: custom ? CUSTOM_MESSAGE : undefined, onDiscard: () => setDraft('') });
  return { enabled, setEnabled, draft, setDraft, custom, setCustom };
}

export function EditSimulationSection({ sim }: { sim: ReturnType<typeof useEditSimulation> }) {
  const { tx } = useI18n();
  return <section aria-label={tx(copy.title)} data-testid="edit-simulation" className="mt-3 border-t border-border-subtle pt-3">
    <div className="flex items-center gap-2">
      <Checkbox id="edit-sim-enabled" checked={sim.enabled} onCheckedChange={next => sim.setEnabled(next === true)} />
      <Label htmlFor="edit-sim-enabled">{tx(copy.title)}</Label>
    </div>
    <p className="mb-2 mt-1 text-tiny text-text-secondary">{tx(copy.hint)}</p>
    {sim.enabled && <div className="space-y-2">
      <div className="space-y-1">
        <Label htmlFor="edit-sim-draft">{tx(copy.draft)}</Label>
        <Input id="edit-sim-draft" data-testid="edit-simulation-draft" value={sim.draft} onChange={event => sim.setDraft(event.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="edit-sim-custom" checked={sim.custom} onCheckedChange={next => sim.setCustom(next === true)} />
        <Label htmlFor="edit-sim-custom">{tx(copy.custom)}</Label>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => sim.setDraft('')}>{tx(copy.reset)}</Button>
    </div>}
  </section>;
}
