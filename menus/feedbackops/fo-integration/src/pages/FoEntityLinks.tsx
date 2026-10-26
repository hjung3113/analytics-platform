import { FoScreenPage, entityLinksRoute, useEntityLinksHere, useEntityLinksSearch } from '@ap/fo-bridge';
import { LinksScreen } from '@fops/frontend/operator-screens/entity-links';
import { isIntegrationLinksSearchValueValid } from '@fops/frontend/operator-screens/integration-search';

/** 엔티티 링크 (ADR-0081, #762): FeedbackOps' entity-link inventory through the bridge; no detail. Its search box and row checkboxes are FeedbackOps' own unwired controls, moved unchanged (D8). Links accepts any string for `managedSystem`. */
export default function FoEntityLinks() {
  return <FoScreenPage route={entityLinksRoute} isValid={isIntegrationLinksSearchValueValid} useSearch={useEntityLinksSearch} useHere={useEntityLinksHere}><LinksScreen /></FoScreenPage>;
}
