import { useCallback } from 'react';
import { spaceId } from '@ap/contracts';
import type { VocComposeProps } from '@ap/kernel';
import { VocComposeScreen } from '@ap/feature-screens/global-screens';
import { FeatureBridge } from '../fo/FeatureBridge';
import { featureQueryClient } from '../fo/session';
import { isUuid } from '../fo/uuid';

const FEEDBACKOPS = spaceId('feedbackops');

/**
 * The form's initial Managed System (ADR-0070 decision 5): a FeedbackOps screen's carried `managedSystem` when it is one UUID, otherwise the
 * app's `managedSystemFor`. The screen still uses it only when the user's list holds it.
 */
export function initialManagedSystem(context: Pick<VocComposeProps['context'], 'spaceId' | 'carried'>, managedSystemFor: (spaceId: string | null) => string | null): string | null {
  const carried = context.carried.managedSystem;
  if (context.spaceId === FEEDBACKOPS && carried !== undefined && isUuid(carried)) return carried;
  return managedSystemFor(context.spaceId);
}

/**
 * The `VOC 등록` form from FeedbackOps in the rail drawer (ADR-0070 decisions 4–5, ADR-0071). The frozen Context becomes the `화면 정보` block of the
 * description; the screen reads it when the form is submitted, so a chip removed after typing leaves the typed values alone. Without a FeedbackOps API
 * (mock preview) it shows `실서버 필요` and requests nothing.
 */
export default function VocCompose({ context, onSubmitted, onCancel, onDirtyChange, managedSystemFor }: VocComposeProps & { managedSystemFor: (spaceId: string | null) => string | null }) {
  const submitted = useCallback((result: { vocId: string; displayId: string }) => {
    // The new VOC belongs in 내 VOC; a list that is not cached has nothing to refresh.
    void featureQueryClient.invalidateQueries({ queryKey: ['vocs', 'my'] });
    onSubmitted(result);
  }, [onSubmitted]);
  return <div className="h-full min-h-0">
    <FeatureBridge>
      <VocComposeScreen contextBlock={{ items: context.items.map(({ label, value }) => ({ label, value })), href: context.href }} initialManagedSystemId={initialManagedSystem(context, managedSystemFor)}
        onSubmitted={submitted} onCancel={onCancel} onDirtyChange={onDirtyChange} />
    </FeatureBridge>
  </div>;
}
