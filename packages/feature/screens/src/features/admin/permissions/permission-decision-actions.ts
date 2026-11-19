import type { PermissionRequestAdminDetail } from '@ap/feature-shared';

export function hasPermissionDecisionActions(request: PermissionRequestAdminDetail) {
  return (request.status === 'pending' || request.status === 'needs_more_info') &&
    request.allowed_actions.length > 0;
}
