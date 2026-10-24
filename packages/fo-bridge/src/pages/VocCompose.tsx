import { useCallback } from 'react';
import type { VocComposeProps } from '@ap/kernel';
import { VocComposeScreen } from '@fops/frontend/global-screens';
import { FoBridge } from '../fo/FoBridge';
import { foQueryClient } from '../fo/session';

/**
 * The `VOC 등록` form from FeedbackOps in the rail drawer (ADR-0070 decisions 4–5, ADR-0071). The frozen Context becomes the `화면 정보` block of the
 * description; the screen reads it when the form is submitted, so a chip removed after typing leaves the typed values alone. Without a FeedbackOps API
 * (mock preview) it shows `실서버 필요` and requests nothing.
 */
export default function VocCompose({ context, onSubmitted, onCancel, onDirtyChange, managedSystemFor }: VocComposeProps & { managedSystemFor: (spaceId: string | null) => string | null }) {
  const submitted = useCallback((result: { vocId: string; displayId: string }) => {
    // The new VOC belongs in 내 VOC; a list that is not cached has nothing to refresh.
    void foQueryClient.invalidateQueries({ queryKey: ['vocs', 'my'] });
    onSubmitted(result);
  }, [onSubmitted]);
  return <div className="h-full min-h-0">
    <FoBridge>
      <VocComposeScreen contextBlock={{ items: context.items.map(({ label, value }) => ({ label, value })), href: context.href }} initialManagedSystemId={managedSystemFor(context.spaceId)}
        onSubmitted={submitted} onCancel={onCancel} onDirtyChange={onDirtyChange} />
    </FoBridge>
  </div>;
}
