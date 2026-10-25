import { usePlatform } from '@ap/kernel';
import { FoScreenRoot, type HostSeam } from '@fops/frontend/global-screens/core';
import { ManagedSystemScopeControl } from '@fops/frontend/operator-screens/scope-picker';
import { UnlinkedLink } from '../fo/FoBridge';
import { foQueryClient, useFoSession } from '../fo/session';
import { isUuid } from '../fo/uuid';

// The picker renders no linked or toasting screen; `FoScreenRoot` is its QueryClient provider (same shape as the notification count).
const SEAM: HostSeam = { canLink: () => false, Link: UnlinkedLink, notifyError: () => undefined, notifySuccess: () => undefined };

/** The sidebar `목록 범위` for a ready session: the `managedSystem` page key in, the picker's choice out (replace, so a scope change is not a history step). */
export default function ScopeControl({ collapsed }: { collapsed: boolean }) {
  const { pageParam, setPage } = usePlatform();
  const session = useFoSession();
  const raw = pageParam('managedSystem');
  // A value that is not a uuid is rejected on the page; the picker never receives it as a selection.
  const value = raw !== null && isUuid(raw) ? raw : undefined;
  return <FoScreenRoot client={foQueryClient} host={SEAM} key={session.status === 'ready' ? session.epoch : 0}>
    <ManagedSystemScopeControl {...(value !== undefined ? { value } : {})} collapsed={collapsed} onChange={id => setPage({ managedSystem: id ?? null }, { replace: true })} />
  </FoScreenRoot>;
}
