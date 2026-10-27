import type { PanelSection } from '@ap/ui';
import type { VocDetailEnvelope } from '@fops/shared';
import type * as React from 'react';

import { VOC_DETAIL_BODY_LABEL } from '@/lib/copy/voc';
import { DetailHeader } from './DetailHeader';

export interface FullDetailViewProps {
  voc: VocDetailEnvelope;
  vocId: string;
  onClose: () => void;
  /** `VocDetailBody`, placed under the standalone header. */
  children: React.ReactNode;
}

// ADR-0057 A2 amendment localizes Korean navigation while preserving domain nouns.
// Prototype deviation (screen-voc.jsx:175-185): issue #519 and the user's Option C decision
// pin the core navigation and move Description/Conversation into an overflow menu.
// Execution section only shown when there's an active finding/task (Slice 4+).
export const VOC_DETAIL_SECTIONS: PanelSection[] = [
  { id: 'overview', label: '요약' },
  { id: 'triage', label: 'Triage' },
  { id: 'description', label: VOC_DETAIL_BODY_LABEL, overflow: true },
  { id: 'trail', label: '이력' },
  { id: 'conversation', label: '대화', overflow: true },
  { id: 'compose', label: '작성' },
];

/** The standalone panel frame: the VOC header over the body the detail parts hold. */
export function FullDetailView({
  voc,
  vocId,
  onClose,
  children,
}: FullDetailViewProps): React.ReactElement {
  return (
    <div className="flex flex-col h-full" data-testid="voc-detail-panel">
      <DetailHeader vocId={vocId} displayId={voc.display_id} onClose={onClose} />
      {children}
    </div>
  );
}
