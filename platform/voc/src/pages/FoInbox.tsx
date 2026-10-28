import { usePlatform } from '@ap/kernel';
import { FeatureScreenPage, inboxRoute, useInboxHere, useInboxSearch } from '@ap/feature-bridge';
import { InboxScreen } from '@ap/feature-screens/operator-screens/voc-inbox';
import { isVocSearchValueValid } from '@ap/feature-screens/operator-screens/voc-search';
import { VocDetailDrawer } from './VocDetailDrawer';

/** FO's `ListShell` would hand a returned node to the shell slot, which renders it outside the FeedbackOps providers; the page draws the detail itself, inside `FeatureBridge`. */
const noDetail = () => undefined;

/**
 * 수신함 (ADR-0081, #761): FeedbackOps' operator VOC inbox through the bridge; the title is the manifest label and the screen owns its actions. `focus` opens the VOC detail in the shell detail slot.
 * A value FeedbackOps' VOC search schema refuses is rejected (`focus` is its `selected`, a UUID).
 */
export default function FoInbox() {
  const { pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  const managedSystem = pageParam('managedSystem');
  return <FeatureScreenPage route={inboxRoute} isValid={isVocSearchValueValid} useSearch={useInboxSearch} useHere={useInboxHere}
    detail={focus !== null && <VocDetailDrawer key={focus} vocId={focus} {...(managedSystem !== null ? { managedSystemId: managedSystem } : {})} onClose={() => setPage({ focus: null })} />}>
    <InboxScreen view="inbox" renderDetail={noDetail} />
  </FeatureScreenPage>;
}
