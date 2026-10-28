import type { ReactNode } from 'react';
import { DetailDrawer } from '@ap/components';
import { useI18n } from '@ap/kernel';

/** The parts of a FeedbackOps detail (`DetailParts` in the FeedbackOps `lib/host/detail-parts.ts`): the host places them in its own drawer. */
export type FeatureDetailParts = { title: ReactNode; subtitle?: ReactNode; headerActions?: ReactNode; body: ReactNode };

/**
 * A FeedbackOps detail in the shell detail slot. It renders inside `FeatureBridge` (the FeedbackOps providers) and portals into the slot through `DetailDrawer`.
 * `requestClose` is the confirmed close of a detail that asks first (an unsent draft); without it `onClose` is the close itself. Key it on the record.
 */
export function FeatureDetailDrawer({ parts, onClose, requestClose }: { parts: FeatureDetailParts; onClose: () => void; requestClose?: () => void }) {
  const { lang } = useI18n();
  return <DetailDrawer title={parts.title} {...(parts.subtitle !== undefined ? { subtitle: parts.subtitle } : {})} {...(parts.headerActions !== undefined ? { headerActions: parts.headerActions } : {})}
    onClose={requestClose ?? onClose}
    tabs={[{ id: 'detail', label: lang === 'ko' ? '상세' : 'Detail', content: <div className="fo-detail-body flex min-h-0 flex-1 flex-col">{parts.body}</div> }]} />;
}
