import { PlatformPage } from '@ap/components';
import { usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';
import { RefreshCw } from 'lucide-react';
import { FoBridge, foQueryClient, hostLinks, surveyTarget, useFoSession, vocListTarget } from '@ap/fo-bridge';
import { DashboardScreen, refreshDashboard } from '@fops/frontend/operator-screens/dashboard';

/** The dashboard reaches the survey menus and 내 VOC; every operator route stays non-interactive until its menu exists. Module level: `FoBridge` memoizes on these identities. */
export const dashboardLinks = hostLinks(surveyTarget, vocListTarget);
const { canLink, Link } = dashboardLinks;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 대시보드 (ADR-0081, #759): FeedbackOps' operator dashboard through the bridge; the title is the manifest label. The `managedSystem` page key scopes it; a value that is not a uuid is not sent but stays in the URL (ADR-0071 decision 9). */
export default function FoDashboard() {
  const { pageParam } = usePlatform();
  const session = useFoSession();
  const raw = pageParam('managedSystem');
  const managedSystem = raw !== null && UUID.test(raw) ? raw : undefined;
  return <PlatformPage
    primaryAction={<Button type="button" variant="secondary" size="sm" disabled={session.status !== 'ready'} onClick={() => refreshDashboard(foQueryClient, managedSystem)}><RefreshCw className="size-3.5" aria-hidden />새로고침</Button>}>
    <FoBridge canLink={canLink} Link={Link}><DashboardScreen {...(managedSystem !== undefined ? { managedSystemId: managedSystem } : {})} /></FoBridge>
  </PlatformPage>;
}
