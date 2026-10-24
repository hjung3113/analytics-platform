// DetailHeader — panel header wired with the canonical VOC URL.

import { useHostSeam } from '@/lib/host/host-seam';
import { searchHref } from '@/lib/host/search';
import { DetailPanelHeader, DetailPanelHeaderActions } from '@fops/ui';
import type * as React from 'react';

export interface DetailHeaderProps {
  vocId: string;
  displayId: string;
  onClose: () => void;
}

/** The copy-link / more actions; the copy URL is the host's address of the VOC, so a host without one shows no actions. */
export function VocHeaderActions({
  vocId,
  displayId,
}: Pick<DetailHeaderProps, 'vocId' | 'displayId'>): React.ReactElement | null {
  const { absoluteHref } = useHostSeam();
  const canonicalUrl =
    absoluteHref?.(searchHref('/vocs', { view: 'inbox', selected: vocId })) ?? null;
  if (canonicalUrl === null) return null;
  return <DetailPanelHeaderActions entityKind="voc" entityId={displayId} copyUrl={canonicalUrl} />;
}

export function DetailHeader({ vocId, displayId, onClose }: DetailHeaderProps): React.ReactElement {
  return (
    <DetailPanelHeader
      kind="voc"
      id={displayId}
      onClose={onClose}
      extras={<VocHeaderActions vocId={vocId} displayId={displayId} />}
    />
  );
}
