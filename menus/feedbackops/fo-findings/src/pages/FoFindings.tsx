import { usePlatform } from '@ap/kernel';
import { FoScreenPage, findingsRoute, useFindingsHere, useFindingsSearch } from '@ap/fo-bridge';
import { FindingsScreen } from '@fops/frontend/operator-screens/findings';
import { isFindingsSearchValueValid } from '@fops/frontend/operator-screens/findings-search';
import { FindingDetailDrawer } from './FindingDrawer';

/** FO's `ListShell` would hand a returned node to the shell slot, which renders it outside the FeedbackOps providers (and over the list's denied and empty states); the page draws the detail itself, inside `FoBridge`. */
const noDetail = () => undefined;

/**
 * 전체 Finding (ADR-0081, #762): the FeedbackOps Findings list; `focus` opens the Finding detail in the shell detail slot (URL-only selection, nothing auto-selects).
 * A value FeedbackOps' Findings search schema refuses is rejected (`focus` is its `selected`, a UUID; `managedSystem` a UUID or `all`).
 */
export default function FoFindings() {
  const { pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  return <FoScreenPage route={findingsRoute} isValid={isFindingsSearchValueValid} useSearch={useFindingsSearch} useHere={useFindingsHere}
    detail={focus !== null && <FindingDetailDrawer key={focus} findingId={focus} onClose={() => setPage({ focus: null })} />}>
    <FindingsScreen renderDetail={noDetail} />
  </FoScreenPage>;
}
