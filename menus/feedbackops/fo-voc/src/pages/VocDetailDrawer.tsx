import { useI18n } from '@ap/kernel';
import { DetailDrawer } from '@ap/components';
import { useVocDetailParts } from '@fops/frontend/operator-screens/voc-detail';

/**
 * The operator VOC detail in the shell detail slot. It renders inside `FoBridge` (the FeedbackOps providers) and portals into the slot through
 * `DetailDrawer`; `onClose` is the confirmed close (`requestClose` asks first while a composer holds an unsent draft). Key it on the VOC.
 */
export function VocDetailDrawer({ vocId, managedSystemId, onClose }: { vocId: string; managedSystemId?: string; onClose: () => void }) {
  const { lang } = useI18n();
  const parts = useVocDetailParts({ vocId, onClose, ...(managedSystemId !== undefined ? { managedSystemId } : {}) });
  return <DetailDrawer title={parts.title} {...(parts.subtitle !== undefined ? { subtitle: parts.subtitle } : {})} {...(parts.headerActions !== undefined ? { headerActions: parts.headerActions } : {})}
    onClose={parts.requestClose}
    tabs={[{ id: 'detail', label: lang === 'ko' ? '상세' : 'Detail', content: parts.body }]} />;
}
