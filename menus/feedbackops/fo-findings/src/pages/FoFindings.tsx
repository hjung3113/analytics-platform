import { PlatformPage } from '@ap/components';
import { usePlatform } from '@ap/kernel';
import { FoBridge, RejectedPage, findingsRoute, operatorHostLinks, useFindingsHere, useFindingsSearch } from '@ap/fo-bridge';
import { FindingsScreen } from '@fops/frontend/operator-screens/findings';
import { FindingDetailDrawer } from './FindingDrawer';
import { useRejectedValue } from './RejectedPage';

/** Module level: `FoBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;
/** FO's `ListShell` would hand a returned node to the shell slot, which renders it outside the FeedbackOps providers (and over the list's denied and empty states); the page draws the detail itself, inside `FoBridge`. */
const noDetail = () => undefined;

/** 전체 Finding (ADR-0081, #762): the FeedbackOps Findings list; `focus` opens the Finding detail in the shell detail slot (URL-only selection, nothing auto-selects). */
export default function FoFindings() {
  const { pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  const rejected = useRejectedValue(findingsRoute);
  // A value FeedbackOps would drop is rejected and preserved, not replaced by a default query (06 §6.4); nothing is requested for it.
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill">
    <FoBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useFindingsSearch} useHere={useFindingsHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col"><FindingsScreen renderDetail={noDetail} /></div>
      </div>
      {focus !== null && <FindingDetailDrawer key={focus} findingId={focus} onClose={() => setPage({ focus: null })} />}
    </FoBridge>
  </PlatformPage>;
}
