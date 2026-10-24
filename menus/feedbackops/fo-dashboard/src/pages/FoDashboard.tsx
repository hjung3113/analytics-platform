import { PlatformPage } from '@ap/components';
import { usePlatform } from '@ap/kernel';
import { Button } from '@ap/ui';
import { FoBridge, foQueryClient, useFoSession } from '@ap/fo-bridge';
import { DashboardScreen, refreshDashboard } from '@fops/frontend/operator-screens/dashboard';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 대시보드 (ADR-0081, #759): FeedbackOps' operator dashboard through the bridge; the title is the manifest label. The `managedSystem` page key scopes it; a value that is not a uuid is not sent but stays in the URL (ADR-0071 decision 9). */
export default function FoDashboard() {
  const { pageParam } = usePlatform();
  const session = useFoSession();
  const raw = pageParam('managedSystem');
  const managedSystem = raw !== null && UUID.test(raw) ? raw : undefined;
  return <PlatformPage
    primaryAction={<Button type="button" size="sm" disabled={session.status !== 'ready'} onClick={() => refreshDashboard(foQueryClient, managedSystem)}>새로고침</Button>}>
    <FoBridge><DashboardScreen {...(managedSystem !== undefined ? { managedSystemId: managedSystem } : {})} /></FoBridge>
  </PlatformPage>;
}
