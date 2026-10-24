import { projectContext, type ApiResponse, type EndpointSpec } from '@ap/contracts';
import { usePlatform, usePlatformQuery } from '@ap/kernel';
import { hwTime, type HwTimeDrill, type HwTimeLevelData, type HwTimeTrendData } from '../endpoints';

function useHwTimeQuery<P, T>(endpoint: EndpointSpec<P, T>, params: P) {
  const { adapter, global, scope, session } = usePlatform();
  const context = projectContext(endpoint, global);
  const scopeReady = !endpoint.requiresScope || (
    scope.status === 'valid' && scope.scopeId === global.scopeId && scope.validatedFor === session
  );
  const periodReady = endpoint.context.time !== 'apply' || (global.from !== null && global.to !== null);
  return usePlatformQuery<T>(
    signal => adapter.menuQuery({ endpoint: endpoint.id, context, params }, signal) as Promise<ApiResponse<T>>,
    [endpoint.id, context, params],
    scopeReady && periodReady,
  );
}

export function useHwTimeLevel(drill: HwTimeDrill) {
  return useHwTimeQuery(hwTime.levelRows, drill);
}

export function useHwTimeTrend(rowIds: string[]) {
  return useHwTimeQuery(hwTime.trend, { rowIds });
}
