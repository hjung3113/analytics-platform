import { PlatformPage } from '@ap/components';
import { usePlatform } from '@ap/kernel';
import { FoBridge, RejectedPage, inboxRoute, operatorHostLinks, useInboxHere, useInboxSearch } from '@ap/fo-bridge';
import { InboxScreen } from '@fops/frontend/operator-screens/voc-inbox';
import { useRejectedValue } from './RejectedPage';
import { VocDetailDrawer } from './VocDetailDrawer';

/** Module level: `FoBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;
/** FO's `ListShell` would hand a returned node to the shell slot, which renders it outside the FeedbackOps providers; the page draws the detail itself, inside `FoBridge`. */
const noDetail = () => undefined;

/** 수신함 (ADR-0081, #761): FeedbackOps' operator VOC inbox through the bridge; the title is the manifest label and the screen owns its actions. `focus` opens the VOC detail in the shell detail slot. */
export default function FoInbox() {
  const { pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  const managedSystem = pageParam('managedSystem');
  const rejected = useRejectedValue(inboxRoute);
  // A value FeedbackOps would drop is rejected and preserved, not replaced by a default query (06 §6.4); nothing is requested for it.
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill">
    <FoBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useInboxSearch} useHere={useInboxHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col"><InboxScreen view="inbox" renderDetail={noDetail} /></div>
      </div>
      {focus !== null && <VocDetailDrawer key={focus} vocId={focus} {...(managedSystem !== null ? { managedSystemId: managedSystem } : {})} onClose={() => setPage({ focus: null })} />}
    </FoBridge>
  </PlatformPage>;
}
