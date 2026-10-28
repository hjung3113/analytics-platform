import { FeatureScreenPage, entityLinksRoute, useEntityLinksHere, useEntityLinksSearch } from '@ap/feature-bridge';
import { LinksScreen } from '@ap/feature-screens/operator-screens/entity-links';
import { isIntegrationLinksSearchValueValid } from '@ap/feature-screens/operator-screens/integration-search';

/** 엔티티 링크 (ADR-0081, #762): FeedbackOps' entity-link inventory through the bridge; no detail. Its search box and row checkboxes are FeedbackOps' own unwired controls, moved unchanged (D8). Links accepts any string for `managedSystem`. */
export default function FoEntityLinks() {
  return <FeatureScreenPage route={entityLinksRoute} isValid={isIntegrationLinksSearchValueValid} useSearch={useEntityLinksSearch} useHere={useEntityLinksHere}><LinksScreen /></FeatureScreenPage>;
}
