import { useMemo, type ReactNode } from 'react';
import { HostSeamProvider, useHostNavigate, type HostNavigate, type HostSeam } from '../../lib/host/host-seam';

/** Native menu-query host needs navigation only; it shares the existing feature host seam without a REST session. */
export function LifecycleHost({ navigate, children }: { navigate: HostNavigate; children: ReactNode }) {
  const host = useMemo<HostSeam>(() => ({ canLink: () => false, Link: ({ children }) => <span>{children}</span>, notifyError: () => undefined, notifySuccess: () => undefined, useNavigate: () => navigate }), [navigate]);
  return <HostSeamProvider value={host}>{children}</HostSeamProvider>;
}
export function useLifecycleNavigate() {
  const navigate = useHostNavigate();
  return (menu: 'project' | 'round' | 'models' | 'requests' | 'model-profile', id?: string, extra?: string, page?: { request?: string; attempt?: string }) => {
    if (menu === 'models') navigate('/log/models');
    if (menu === 'project' && id) navigate(`/log/models/${encodeURIComponent(id)}`);
    if (menu === 'round' && id && extra) navigate(`/log/models/${encodeURIComponent(id)}/rounds/${encodeURIComponent(extra)}${page ? `?${new URLSearchParams(Object.entries(page).filter((entry): entry is [string, string] => entry[1] !== undefined))}` : ''}`);
    if (menu === 'requests') navigate(`/log/validation-requests${id ? `?request=${encodeURIComponent(id)}` : ''}`);
    if (menu === 'model-profile' && id) navigate(`/log/knowledge/models/${encodeURIComponent(id)}`);
  };
}
