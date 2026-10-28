import type { ComponentProps } from 'react';
import { FeatureDetailDrawer, FeatureScreenPage, integrationDashboardRoute, useIntegrationDashboardHere, useIntegrationDashboardSearch } from '@ap/feature-bridge';
import { IntegrationDashboardScreen, renderRecoveryRequestAccess } from '@ap/feature-screens/operator-screens/integration-dashboard';
import { isIntegrationDashboardSearchValueValid } from '@ap/feature-screens/operator-screens/integration-search';

/** The screen owns the selected item and its close (`focus` is its `selected`), so the drawer's close is `requestClose`. */
const renderDetail: ComponentProps<typeof IntegrationDashboardScreen>['renderDetail'] = parts => <FeatureDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** 연동 액션 대시보드 (ADR-0081, #762): FeedbackOps' recovery queue through the bridge; `focus` is the selected recovery item (an opaque recovery queue item id in FeedbackOps' 연동 search schema;`managedSystem` a UUID or `all`), rendered in the shell detail slot from the screen's own parts. */
export default function FoIntegration() {
  return <FeatureScreenPage route={integrationDashboardRoute} isValid={isIntegrationDashboardSearchValueValid} useSearch={useIntegrationDashboardSearch} useHere={useIntegrationDashboardHere}>
    <IntegrationDashboardScreen renderDetail={renderDetail} renderRequestAccess={renderRecoveryRequestAccess} />
  </FeatureScreenPage>;
}
