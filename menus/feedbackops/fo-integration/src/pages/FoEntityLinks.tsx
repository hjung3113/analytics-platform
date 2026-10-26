import { PlatformPage } from '@ap/components';
import { FoBridge, RejectedPage, entityLinksRoute, operatorHostLinks, useEntityLinksHere, useEntityLinksSearch } from '@ap/fo-bridge';
import { LinksScreen } from '@fops/frontend/operator-screens/entity-links';
import { isIntegrationLinksSearchValueValid } from '@fops/frontend/operator-screens/integration-search';
import { useRejectedValue } from './RejectedPage';

/** Module level: `FoBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;

/** 엔티티 링크 (ADR-0081, #762): FeedbackOps' entity-link inventory through the bridge; no detail. Its search box and row checkboxes are FeedbackOps' own unwired controls, moved unchanged (D8). */
export default function FoEntityLinks() {
  const rejected = useRejectedValue(entityLinksRoute, isIntegrationLinksSearchValueValid);
  // A value FeedbackOps would drop is rejected and preserved, not replaced by a default query (06 §6.4); nothing is requested for it.
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill">
    <FoBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useEntityLinksSearch} useHere={useEntityLinksHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col"><LinksScreen /></div>
      </div>
    </FoBridge>
  </PlatformPage>;
}
