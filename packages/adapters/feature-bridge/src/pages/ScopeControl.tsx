import { usePlatform } from '@ap/kernel';
import { FeatureScreenRoot, type HostSeam } from '@ap/feature-screens/global-screens/core';
import { ManagedSystemScopeControl } from '@ap/feature-screens/operator-screens/scope-picker';
import { UnlinkedLink } from '../feature/FeatureBridge';
import { useListScope } from '../feature/list-scope';
import { featureQueryClient, useFeatureSession } from '../feature/session';
import { ignoresListScope } from '../operator-menus';

// The picker renders no linked or toasting screen; `FeatureScreenRoot` is its QueryClient provider (same shape as the notification count).
const SEAM: HostSeam = { canLink: () => false, Link: UnlinkedLink, notifyError: () => undefined, notifySuccess: () => undefined };

/** The sidebar `목록 범위` for a ready session: the `managedSystem` page key in, the picker's choice out (replace, so a scope change is not a history step). */
export default function ScopeControl({ collapsed }: { collapsed: boolean }) {
  const { route } = usePlatform();
  const session = useFeatureSession();
  const { value, change } = useListScope();
  // ADR-0081 d4: the `기능 관리` group's screens are not scoped by Managed System. The picker shows its disabled `워크스페이스 전체` and screen's explanation; the carried `managedSystem` stays in the URL, untouched.
  const off = ignoresListScope(route?.menu ?? null);
  return <FeatureScreenRoot client={featureQueryClient} host={SEAM} key={session.status === 'ready' ? session.epoch : 0}>
    <ManagedSystemScopeControl {...(value !== undefined ? { value } : {})} collapsed={collapsed} onChange={change} {...(off ? { disabled: true } : {})} />
  </FeatureScreenRoot>;
}
