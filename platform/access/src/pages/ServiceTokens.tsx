import { useMemo, useState } from 'react';
import { PlatformPage } from '@ap/components';
import { usePlatform } from '@ap/kernel';
import { ApiTokensScreen, type ApiTokenDrawerParts, type ApiTokenTableParts } from '@ap/feature-screens/global-screens';
import { FeatureBridge, FeatureDataTable, FeatureDetailDrawer, FeaturePrimaryActionTargetProvider } from '@ap/feature-bridge';

// Stable host URL hooks, like the other feature administration screens.
function useSearch() {
  const { page, url } = usePlatform();
  return useMemo(() => { void url; return Object.fromEntries(page); }, [page, url]);
}
function useNavigate() {
  const { navigate, linkTo } = usePlatform();
  return (to: string, options?: { replace?: boolean }) => {
    const query = new URL(to, 'https://platform.invalid').searchParams;
    navigate(linkTo('service-tokens', { page: Object.fromEntries(query) }), options);
  };
}

const renderTable = (parts: ApiTokenTableParts) => <FeatureDataTable {...parts} />;
const renderDrawer = (parts: ApiTokenDrawerParts) => <FeatureDetailDrawer parts={parts} onClose={parts.requestClose} />;

export default function ServiceTokens() {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const { session } = usePlatform();
  return <PlatformPage primaryAction={<div ref={setTarget} data-feature-primary-action />}>
    <FeaturePrimaryActionTargetProvider value={target}><FeatureBridge useSearch={useSearch} useNavigate={useNavigate}>
      <ApiTokensScreen service canManageService={session.user.permissions.includes('console:access')} renderTable={renderTable} renderDrawer={renderDrawer} />
    </FeatureBridge></FeaturePrimaryActionTargetProvider>
  </PlatformPage>;
}
