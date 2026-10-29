import { FeatureScreenPage, entityLinksRoute, useEntityLinksHere, useEntityLinksSearch } from '@ap/feature-bridge';
import { LinksScreen } from '@ap/feature-screens/operator-screens/entity-links';
import { isIntegrationLinksSearchValueValid } from '@ap/feature-screens/operator-screens/integration-search';

/** 엔티티 링크 (ADR-0081, #762): the feature screens' entity-link inventory through the bridge; no detail. Its search box and row checkboxes are the feature screens' own unwired controls, moved unchanged (D8). Links accepts any string for `managedSystem`. */
export default function FeatureEntityLinks() {
  return <FeatureScreenPage route={entityLinksRoute} isValid={isIntegrationLinksSearchValueValid} useSearch={useEntityLinksSearch} useHere={useEntityLinksHere}><LinksScreen /></FeatureScreenPage>;
}
