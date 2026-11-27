import { useMemo, type ReactNode } from 'react';
import { HostSeamProvider, type HostSeam } from '../../lib/host/host-seam';

const noNavigate = () => undefined;

/**
 * Native menu-query host for the dataset screens: it carries only the Kernel instant notation (`time`, #2587). The screens
 * navigate through `ScreenProps.navigate` and never through the seam's links or notices, so those stay inert.
 */
export function DatasetHost({ time, children }: { time?: HostSeam['time']; children: ReactNode }) {
  const host = useMemo<HostSeam>(() => ({ canLink: () => false, Link: ({ children }) => <span>{children}</span>, notifyError: () => undefined, notifySuccess: () => undefined, useNavigate: () => noNavigate, ...(time ? { time } : {}) }), [time]);
  return <HostSeamProvider value={host}>{children}</HostSeamProvider>;
}
