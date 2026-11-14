import { useMessages, usePlatform } from '@ap/kernel';
import { DASHBOARD_MESSAGES } from '../messages';
import { PlatformPage } from '@ap/components';
import { Button } from '@ap/ui';
import { RefreshCw } from 'lucide-react';
import { FeatureBridge, RejectedPage, featureQueryClient, isUuid, operatorHostLinks, useFeatureSession } from '@ap/feature-bridge';
import { DashboardScreen, refreshDashboard } from '@ap/feature-screens/operator-screens/dashboard';

/** The dashboard reaches the survey menus, 내 VOC and the VOC 수신함/Triage queues; every other operator route stays non-interactive until its menu exists, and so does one whose menu this registry lacks. Module level: `FeatureBridge` memoizes on these identities. */
export const dashboardLinks = operatorHostLinks;
const { canLink, Link, targetOf } = dashboardLinks;

/** 대시보드 (ADR-0081, #759): the feature screens' operator dashboard through the bridge; the title is the manifest label. The `managedSystem` page key scopes it; a value that is not a uuid (or is empty) is rejected and kept in the URL: `RejectedPage`, nothing mounted or requested (ADR-0071 decision 9, 06 §6.4). */
export default function FeatureDashboard() {
  const m = useMessages(DASHBOARD_MESSAGES);
  const { pageParam } = usePlatform();
  const session = useFeatureSession();
  const raw = pageParam('managedSystem');
  if (raw !== null && !isUuid(raw)) return <RejectedPage rejected={{ key: 'managedSystem' }} />;
  const managedSystem = raw ?? undefined;
  return <PlatformPage
    primaryAction={<Button type="button" variant="secondary" size="sm" disabled={session.status !== 'ready'} onClick={() => refreshDashboard(featureQueryClient, managedSystem)}><RefreshCw className="size-3.5" aria-hidden />{m('featureDashboardRefresh')}</Button>}>
    <FeatureBridge canLink={canLink} Link={Link} targetOf={targetOf}><DashboardScreen {...(managedSystem !== undefined ? { managedSystemId: managedSystem } : {})} /></FeatureBridge>
  </PlatformPage>;
}
