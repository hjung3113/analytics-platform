import { FeatureScreenPage, managedSystemsRoute, useManagedSystemsHere, useManagedSystemsSearch } from '@ap/feature-bridge';
import { ManagedSystemsAdminPage } from '@ap/feature-screens/operator-screens/managed-systems';

/** The route table maps no key, so the check has nothing to refuse (the carried `managedSystem` is ignored by this screen, ADR-0081 decision 4). */
const acceptsAll = () => true;

/** Managed System (ADR-0081, #764 p2): FeedbackOps' Managed System registry through the bridge, for admins; the host owns the title. */
export default function FoManagedSystems() {
  return <FeatureScreenPage route={managedSystemsRoute} isValid={acceptsAll} useSearch={useManagedSystemsSearch} useHere={useManagedSystemsHere}><ManagedSystemsAdminPage /></FeatureScreenPage>;
}
