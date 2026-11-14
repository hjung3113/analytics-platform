import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { Cpu, Factory, GitBranch, Package } from 'lucide-react';
import { HierarchyFailure, isHierarchyFailure, type ApiResponse, type HierarchyNode, type HierarchyPage, type HierarchySource } from '@ap/contracts';
import { useMenuFetch } from '@ap/kernel';
import { endpoints, isUuid } from './endpoints';

type Fetch = (params: Record<string, unknown>, signal?: AbortSignal) => Promise<ApiResponse<unknown>>;
export function createModelHierarchySource(fetch: Fetch): HierarchySource {
  async function read<T>(params: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    try {
      const response = await fetch(params, signal);
      signal?.throwIfAborted();
      if (response.outcome === 'forbidden') throw new HierarchyFailure('forbidden');
      if (response.outcome !== 'ok' && response.outcome !== 'empty') throw new HierarchyFailure('error');
      const data = response.data;
      if (data && typeof data === 'object' && 'failure' in data) {
        throw new HierarchyFailure(data.failure === 'deleted' ? 'deleted' : data.failure === 'forbidden' ? 'forbidden' : 'error');
      }
      if (data === null) throw new HierarchyFailure('deleted');
      return data as T;
    } catch (error) {
      signal?.throwIfAborted();
      if (isHierarchyFailure(error)) throw error;
      throw new HierarchyFailure('error');
    }
  }
  return {
    listChildren: ({ signal, ...params }) => read<HierarchyPage>({ op: 'children', ...params }, signal),
    resolveAncestors: (nodeId, signal) => read<HierarchyNode[]>({ op: 'ancestors', nodeId }, signal),
    searchNodes: ({ signal, ...params }) => read<HierarchyPage>({ op: 'search', ...params }, signal),
  };
}

/** The shell owns mounting/session lifetime; this component neither reads screen Context nor fetches during render. */
export function ModelHierarchySource({ children }: { children: (source: HierarchySource) => ReactNode }) {
  const { fetch } = useMenuFetch(endpoints.hierarchy!);
  const fetchRef = useRef(fetch);
  useLayoutEffect(() => {
    fetchRef.current = fetch;
  }, [fetch]);
  const source = useMemo(
    () => createModelHierarchySource((params, signal) => fetchRef.current(params, signal)),
    [],
  );
  return children(source);
}
const icons = { vendor: Factory, process: GitBranch, model: Cpu, software: Package };
export const modelHierarchyIcon = (kind: string) => icons[kind as keyof typeof icons];

/** A placement contains object IDs only; labels and transient tree state never enter URLs. */
export function isModelHierarchyNodeId(value: string): boolean {
  const parts = value.split('/');
  return (parts.length === 6 || parts.length === 8)
    && parts[0] === 'v' && isUuid(parts[1]!)
    && parts[2] === 'p' && (parts[3] === 'none' || isUuid(parts[3]!))
    && parts[4] === 'm' && isUuid(parts[5]!)
    && (parts.length === 6 || (parts[6] === 's' && isUuid(parts[7]!)));
}

/** Complete URL placements need no lookup. Bare project links still require an SDK resolution seam. */
export function modelHierarchyCurrentNode(location: { menuId: string; params: Record<string, string>; page: (key: string) => string | null }): string | null {
  if (location.menuId === 'log-model-project' || location.menuId === 'log-model-round') {
    const node = location.page('node');
    return node && isModelHierarchyNodeId(node) ? node.toLowerCase() : null;
  }
  if (location.menuId !== 'log-models') return null;
  const vendor = location.page('vendorId'), process = location.page('processId'), model = location.page('modelId');
  if (!vendor || !isUuid(vendor)) return null;
  const root = `v/${vendor.toLowerCase()}`;
  if (!process) return root;
  if (process !== 'none' && !isUuid(process)) return null;
  const parent = `${root}/p/${process.toLowerCase()}`;
  return model && isUuid(model) ? `${parent}/m/${model.toLowerCase()}` : parent;
}
