import type { ComponentProps, ReactNode, RefObject } from 'react';
import { DetailDrawer } from '@ap/components';
import { useI18n } from '@ap/kernel';

/** The parts of a feature detail (`DetailParts` in the feature `lib/host/detail-parts.ts`): the host places them in its own drawer. */
export type FeatureDetailParts = { id?: string; title?: ReactNode; objectTitle?: ReactNode; subtitle?: ReactNode; headerActions?: ReactNode; body: ReactNode; footer?: ReactNode; returnFocusRef?: RefObject<HTMLElement | null> };

type DrawerOptions = Pick<ComponentProps<typeof DetailDrawer>, 'fullPageHref' | 'copyPage' | 'isInList' | 'listFocusRef'>;

/**
 * A feature detail in the shell detail slot. It renders inside `FeatureBridge` (the feature providers) and portals into the slot through `DetailDrawer`.
 * `requestClose` is the confirmed close of a detail that asks first (an unsent draft); without it `onClose` is the close itself. Key it on the record.
 */
export function FeatureDetailDrawer({ parts, onClose, requestClose, ...options }: DrawerOptions & { parts: FeatureDetailParts; onClose: () => void; requestClose?: () => void }) {
  const { lang } = useI18n();
  return <DetailDrawer id={parts.id} title={parts.objectTitle ?? parts.title} {...options}
    subtitle={parts.subtitle} headerActions={parts.headerActions}
    footer={parts.footer} returnFocusRef={parts.returnFocusRef} onClose={requestClose ?? onClose}
    tabs={[{ id: 'detail', label: lang === 'ko' ? '상세' : 'Detail', content: <div className="fo-detail-body flex min-h-0 flex-1 flex-col overflow-y-auto">{parts.body}</div> }]} />;
}
