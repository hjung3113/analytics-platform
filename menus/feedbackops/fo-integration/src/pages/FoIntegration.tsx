import type { ComponentProps } from 'react';
import { FoDetailDrawer, FoScreenPage, integrationDashboardRoute, useIntegrationDashboardHere, useIntegrationDashboardSearch } from '@ap/fo-bridge';
import { IntegrationDashboardScreen, renderRecoveryRequestAccess } from '@fops/frontend/operator-screens/integration-dashboard';
import { isIntegrationDashboardSearchValueValid } from '@fops/frontend/operator-screens/integration-search';

/** The screen owns the selected item and its close (`focus` is its `selected`), so the drawer's close is `requestClose`. */
const renderDetail: ComponentProps<typeof IntegrationDashboardScreen>['renderDetail'] = parts => <FoDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** 연동 액션 대시보드 (ADR-0081, #762): FeedbackOps' recovery queue through the bridge; `focus` is the selected recovery item (a UUID for FeedbackOps' 연동 search schema; `managedSystem` a UUID or `all`), rendered in the shell detail slot from the screen's own parts. */
export default function FoIntegration() {
  return <FoScreenPage route={integrationDashboardRoute} isValid={isIntegrationDashboardSearchValueValid} useSearch={useIntegrationDashboardSearch} useHere={useIntegrationDashboardHere}>
    <IntegrationDashboardScreen renderDetail={renderDetail} renderRequestAccess={renderRecoveryRequestAccess} />
  </FoScreenPage>;
}
