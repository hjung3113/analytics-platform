import { useCallback, type ComponentProps } from 'react';
import { FacetedSetDialog } from '@ap/components';

// The dialog's virtual list (@tanstack/virtual) stays out of the start-up chunks.
export default function TargetPickerDialog({ dialogId, saveSlot, ...props }: ComponentProps<typeof FacetedSetDialog> & {
  dialogId: string;
}) {
  const identifyDialog = useCallback((anchor: HTMLSpanElement | null) => {
    const content = anchor?.closest('[role="dialog"]');
    if (content) content.id = dialogId;
  }, [dialogId]);

  // The faceted dialog exposes footer content but does not accept a content ID.
  return <FacetedSetDialog {...props} saveSlot={slot => <>
    <span hidden ref={identifyDialog} />
    {saveSlot?.(slot)}
  </>} />;
}
