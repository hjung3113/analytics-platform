import { useContext } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { isCapability, isDeclaredCapabilityId } from '@ap/feature-shared';
import { PERMISSION_REVIEW_TEXT as COPY } from '../../../lib/copy/admin-permissions';
import { useHostSeam } from '../../../lib/host/host-seam';
import { useDeclaredCapabilities } from '../../../lib/api/declared-capabilities';
import { CAPABILITY_LABELS_EN, getCapabilityDisplayLabel } from '../../../lib/copy/capabilities';

/**
 * ADR-0157 decision 9: a declared capability's display name from the server read (plain text), or its id until the read
 * is loaded. Mounted only for a declared-prefix name, so platform rows never issue the read.
 */
export function DeclaredCapabilityName({ id }: { id: string }) {
  const declared = useDeclaredCapabilities();
  return <span>{getCapabilityDisplayLabel(id, declared)}</span>;
}

function DeclaredReviewName({ id, fallback }: { id: string; fallback: string }) {
  const declared = useDeclaredCapabilities();
  const name = declared.find(item => item.id === id)?.display_name;
  return name && name !== id ? name : fallback;
}

export function ReviewCapabilityName({ id }: { id: string }) {
  const queryClient = useContext(QueryClientContext);
  const { lang = 'ko' } = useHostSeam();
  if (isCapability(id)) return lang === 'en' ? CAPABILITY_LABELS_EN[id] : getCapabilityDisplayLabel(id);
  const fallback = COPY.unknownCapability[lang];
  return queryClient && isDeclaredCapabilityId(id) ? <DeclaredReviewName id={id} fallback={fallback} /> : fallback;
}
