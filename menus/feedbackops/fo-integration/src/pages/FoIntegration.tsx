import type { ComponentProps } from 'react';
import { PlatformPage } from '@ap/components';
import { FoBridge, FoDetailDrawer, RejectedPage, integrationDashboardRoute, operatorHostLinks, useIntegrationDashboardHere, useIntegrationDashboardSearch } from '@ap/fo-bridge';
import { IntegrationDashboardScreen, renderRecoveryRequestAccess } from '@fops/frontend/operator-screens/integration-dashboard';
import { isIntegrationDashboardSearchValueValid } from '@fops/frontend/operator-screens/integration-search';
import { useRejectedValue } from './RejectedPage';

/** Module level: `FoBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;
/** The screen owns the selected item and its close (`focus` is its `selected`), so the drawer's close is `requestClose`. */
const renderDetail: ComponentProps<typeof IntegrationDashboardScreen>['renderDetail'] = parts => <FoDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** 연동 액션 대시보드 (ADR-0081, #762): FeedbackOps' recovery queue through the bridge; `focus` is the selected recovery item, rendered in the shell detail slot from the screen's own parts. */
export default function FoIntegration() {
  const rejected = useRejectedValue(integrationDashboardRoute, isIntegrationDashboardSearchValueValid);
  // A value FeedbackOps would drop is rejected and preserved, not replaced by a default query (06 §6.4); nothing is requested for it.
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill">
    <FoBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useIntegrationDashboardSearch} useHere={useIntegrationDashboardHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col"><IntegrationDashboardScreen renderDetail={renderDetail} renderRequestAccess={renderRecoveryRequestAccess} /></div>
      </div>
    </FoBridge>
  </PlatformPage>;
}
