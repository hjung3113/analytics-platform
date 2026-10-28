// Test-local host adapter around retained Cluster screens.
// /voc-clusters — ADR-0020 ListShell cluster list + right detail panel.
// URL wiring only: the screen lives in features/voc-cluster; after a create this route opens the new cluster's path.

import { ClusterListScreen } from '@/features/voc-cluster/components/ClusterListScreen';
import { useNavigate } from '@tanstack/react-router';
import type * as React from 'react';

export {
  vocClustersSearchSchema,
  validateVocClustersSearch,
} from '@/features/voc-cluster/lib/cluster-search';

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the page exported for
// tests while letting the route component split into its own chunk.

export function VocClusterListPage(): React.ReactElement {
  const navigate = useNavigate({ from: '/voc-clusters/' });
  return (
    <ClusterListScreen
      onCreated={(id) => {
        void navigate({
          to: '/voc-clusters/$clusterId',
          params: { clusterId: id },
        });
      }}
    />
  );
}
