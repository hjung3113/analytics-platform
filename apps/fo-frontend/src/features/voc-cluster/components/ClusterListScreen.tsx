// /voc-clusters — ADR-0020 ListShell cluster list + right detail panel, as a screen any host mounts (standalone route,
// platform bridge). Selection and the Managed System scope are the host's search (`selected`, `managedSystem`) read and
// written through the host seam; where a created cluster opens is the host's call (`onCreated`).

import { VocClusterListShell } from '@/features/voc-cluster/components/detail/VocClusterListShell';
import { CreateClusterModal } from '@/features/voc-cluster/components/modals/CreateClusterModal';
import { useVocClusterList } from '@/features/voc-cluster/hooks/useVocClusterList';
import { vocClustersSearchSchema } from '@/features/voc-cluster/lib/cluster-search';
import { useMeBridge } from '@/lib/api/me';
import { useHostNavigate, useHostSearch } from '@/lib/host/host-seam';
import { searchHref } from '@/lib/host/search';
import { parseRouteSearch } from '@/lib/host/search-fields';
import { Button } from '@ap/ui';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { useState } from 'react';

export function ClusterListScreen({
  onCreated,
  renderDetail,
}: {
  /** Called with the new cluster's id once the create dialog succeeded. */
  onCreated: (id: string) => void;
  /** A host that draws the cluster detail itself (the platform); absent = the built-in side panel. */
  renderDetail?: (
    clusterId: string,
    options: { onClose: () => void },
  ) => React.ReactNode | undefined;
}): React.ReactElement {
  const [createOpen, setCreateOpen] = useState(false);
  const [suggestionMode, setSuggestionMode] = useState(false);
  const [preserveSuggestionSelection, setPreserveSuggestionSelection] = useState(false);
  const changeSuggestionMode = React.useCallback(
    (active: boolean, options?: { preserveSelection: boolean }) => {
      setSuggestionMode(active);
      setPreserveSuggestionSelection(options?.preserveSelection === true);
    },
    [],
  );
  const hostSearch = useHostSearch();
  const search = parseRouteSearch(vocClustersSearchSchema, hostSearch);
  const navigate = useHostNavigate();
  // The host's navigate and search are new values each render; the callbacks below feed effects, so they read the
  // latest through a ref (layout effect: the shell's effects run before this component's passive ones).
  const latest = React.useRef({ search, navigate });
  React.useLayoutEffect(() => {
    latest.current = { search, navigate };
  });
  const selectedId = search.selected ?? null;
  const managedSystemId = search.managedSystem === 'all' ? undefined : search.managedSystem;
  // Shared with the shell's identical call — react-query dedupes by key.
  const listQuery = useVocClusterList(managedSystemId);
  const { data: me } = useMeBridge();
  const canCreate = me?.actor.role_level === 'admin' || me?.actor.role_level === 'developer';

  const selectCluster = React.useCallback((id: string): void => {
    const { search: current, navigate: go } = latest.current;
    go(searchHref('/voc-clusters', { ...current, selected: id }));
  }, []);

  // The shell reports whether it is reconciling a selection that left the
  // VISIBLE list (tab filter or refetch) or the user closed the panel. A
  // reconcile replaces (no Back trap); a genuine close pushes so Back re-opens.
  const closeDetail = React.useCallback((opts?: { reconcile?: boolean }): void => {
    const { search: current, navigate: go } = latest.current;
    const { selected: _selected, ...rest } = current;
    go(searchHref('/voc-clusters', rest), { replace: opts?.reconcile === true });
  }, []);

  // First-row defaulting (original UI behavior): only on the FIRST successful
  // load, only when the URL carries no explicit `selected`, via replace so a
  // deep link / Back is never overridden and closing does not re-open.
  const appliedDefaultRef = React.useRef(false);
  React.useEffect(() => {
    if (
      suggestionMode ||
      preserveSuggestionSelection ||
      !listQuery.isSuccess ||
      appliedDefaultRef.current
    )
      return;
    appliedDefaultRef.current = true;
    if (selectedId === null) {
      const first = listQuery.data?.items[0];
      if (first) {
        const { search: current, navigate: go } = latest.current;
        go(searchHref('/voc-clusters', { ...current, selected: first.id }), { replace: true });
      }
    }
  }, [
    suggestionMode,
    preserveSuggestionSelection,
    listQuery.data,
    listQuery.isSuccess,
    selectedId,
  ]);

  return (
    <>
      <VocClusterListShell
        selectedId={selectedId}
        onSelect={selectCluster}
        onCloseDetail={closeDetail}
        defaultToFirst={false}
        onSuggestionModeChange={changeSuggestionMode}
        managedSystemId={managedSystemId}
        {...(renderDetail !== undefined ? { renderDetail } : {})}
        toolbarActions={
          canCreate ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCreateOpen(true)}
              data-testid="cluster-create-button"
            >
              <Plus className="h-4 w-4" />
              Cluster 생성
            </Button>
          ) : (
            <span className="text-xs text-text-muted" data-testid="cluster-create-hint">
              관리자 또는 개발자 권한이 필요합니다.
            </span>
          )
        }
      />

      {canCreate && (
        <CreateClusterModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            onCreated(id);
          }}
        />
      )}
    </>
  );
}
