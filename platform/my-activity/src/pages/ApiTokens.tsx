import { useState } from 'react';
import { PlatformPage } from '@ap/components';
import { ApiTokensScreen, type ApiTokenDrawerParts, type ApiTokenTableParts } from '@ap/feature-screens/global-screens';
import { FeatureBridge, FeatureDataTable, FeatureDetailDrawer, FeaturePrimaryActionTargetProvider } from '@ap/feature-bridge';

const renderTable = (parts: ApiTokenTableParts) => <FeatureDataTable {...parts} />;
const renderDrawer = (parts: ApiTokenDrawerParts) => <FeatureDetailDrawer parts={parts} onClose={parts.requestClose} />;

export default function ApiTokens() {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return <PlatformPage primaryAction={<div ref={setTarget} data-feature-primary-action />}>
    <FeaturePrimaryActionTargetProvider value={target}><FeatureBridge>
      <ApiTokensScreen renderTable={renderTable} renderDrawer={renderDrawer} />
    </FeatureBridge></FeaturePrimaryActionTargetProvider>
  </PlatformPage>;
}
