import { Button } from '@ap/ui';

import { PERMISSION_REQUEST_FLOW_COPY } from '../lib/copy/permission-requests';
import type { PermissionCheckStatus } from '../lib/cross-system/permission-check-status';
import { useHostSeam } from '../lib/host/host-seam';

export function PermissionRecheckAction({ status, retry }: {
  status: PermissionCheckStatus;
  retry: () => void;
}) {
  const { lang = 'ko' } = useHostSeam();
  const copy = PERMISSION_REQUEST_FLOW_COPY[lang];
  if (status === 'pending') return <span role="status">{copy.checkingEligibility}</span>;
  if (status === 'success') return null;
  return <>
    <span role="alert">{copy.eligibilityCheckError}</span>
    <Button type="button" size="sm" variant="secondary" onClick={retry}>{copy.retry}</Button>
  </>;
}
