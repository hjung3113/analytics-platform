import { ManagedSystemScopeControl } from '@ap/feature-screens/operator-screens/scope-picker';
import { useListScope } from '../feature/list-scope';

/** The `목록 범위` picker a page draws in its own filter area (내 Task). It runs inside `FeatureBridge`, whose `FeatureScreenRoot` already provides the feature QueryClient and session. */
export default function ListScope() {
  const { value, change } = useListScope();
  return <ManagedSystemScopeControl {...(value !== undefined ? { value } : {})} onChange={change} />;
}
