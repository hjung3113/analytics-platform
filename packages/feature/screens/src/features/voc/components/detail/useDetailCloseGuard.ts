import * as React from 'react';

/** REV-1 #6: the composer reports its dirty state; closing the panel while dirty asks for confirmation first. */
export function useDetailCloseGuard(onClose: () => void, recordKey: string) {
  const [composerDirty, setComposerDirty] = React.useState(false);
  const [dirtyConfirmOpen, setDirtyConfirmOpen] = React.useState(false);
  // A different record starts clean (the guard outlives the keyed body that reports into it).
  const [guardedKey, setGuardedKey] = React.useState(recordKey);
  if (guardedKey !== recordKey) {
    setGuardedKey(recordKey);
    setComposerDirty(false);
    setDirtyConfirmOpen(false);
  }

  function requestClose() {
    if (composerDirty) {
      setDirtyConfirmOpen(true);
    } else {
      onClose();
    }
  }

  function confirmClose() {
    setDirtyConfirmOpen(false);
    setComposerDirty(false);
    onClose();
  }

  function cancelClose() {
    setDirtyConfirmOpen(false);
  }

  return { setComposerDirty, dirtyConfirmOpen, requestClose, confirmClose, cancelClose };
}

export type DetailCloseGuard = ReturnType<typeof useDetailCloseGuard>;
