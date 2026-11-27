import { useMemo, type ReactNode } from 'react';
import { HostSeamProvider, type HostNavigate, type HostSeam } from './host-seam';

const noNavigate: HostNavigate = () => undefined;
const InertLink: HostSeam['Link'] = ({ children }) => <span>{children}</span>;
const noNotice = () => undefined;
const cannotLink = () => false;

/**
 * Host for an operator screen that a menu mounts natively with `useMenuQuery` (no feature REST session): it carries only
 * navigation and the Kernel instant notation (`time`, #2587). Links and notices stay inert because these screens reach other
 * pages through `navigate` and raise notices through the platform. Without `navigate`, navigation does nothing (#3195).
 */
export function MenuQueryHost({ navigate = noNavigate, time, children }: { navigate?: HostNavigate; time?: HostSeam['time']; children: ReactNode }) {
  const host = useMemo<HostSeam>(() => ({ canLink: cannotLink, Link: InertLink, notifyError: noNotice, notifySuccess: noNotice, useNavigate: () => navigate, ...(time ? { time } : {}) }), [navigate, time]);
  return <HostSeamProvider value={host}>{children}</HostSeamProvider>;
}
