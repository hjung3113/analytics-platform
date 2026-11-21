import { ManagedSystemScopeControl, type ManagedSystemScopeControlProps } from '@ap/feature-screens/operator-screens/scope-picker';
import { usePlatform } from '@ap/kernel';
import { useListScope } from '../feature/list-scope';
import { listScopeCapability } from '../operator-menus';

/** The `목록 범위` picker a page draws in its own filter area (내 Task). It runs inside `FeatureBridge`, whose `FeatureScreenRoot` already provides the feature QueryClient and session. */
export default function ListScope({ capability: override }: { capability?: ManagedSystemScopeControlProps['capability'] | undefined }) {
  const { route } = usePlatform();
  const { value, change } = useListScope();
  const capability = override ?? listScopeCapability(route?.menu ?? null);
  return <ManagedSystemScopeControl {...(value !== undefined ? { value } : {})} {...(capability !== undefined ? { capability } : {})} onChange={change} />;
}
