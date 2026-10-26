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
  const { pageParam, setPage, route } = usePlatform();
  const session = useFoSession();
  const raw = pageParam('managedSystem');
  // A value that is not a uuid is rejected on the page; the picker never receives it as a selection.
  const value = raw !== null && isUuid(raw) ? raw : undefined;
  // Mirrors FO `_authed.tsx:421-449`: a specific system drops the Analytics Area filter (unless `unset`), any change drops a scope-bound cursor.
  // FO drops `cursor` by path (evidence, coverage, integration, home); "the menu declares `cursor`" matches that list only while those are the only menus declaring it (#762 Design 8).
  const onChange = (id: string | undefined) => {
    const declares = (key: string) => route?.menu.pageKeys.includes(key) === true;
    const patch: Record<string, string | null> = { managedSystem: id ?? null };
    if (id !== undefined && declares('area') && pageParam('area') !== 'unset') patch['area'] = null;
    if (declares('cursor')) patch['cursor'] = null;
    setPage(patch, { replace: true });
  };
  return <FoScreenRoot client={foQueryClient} host={SEAM} key={session.status === 'ready' ? session.epoch : 0}>
    <ManagedSystemScopeControl {...(value !== undefined ? { value } : {})} collapsed={collapsed} onChange={onChange} />
  </FoScreenRoot>;
}
