import {
  type ComponentType,
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
} from 'react';

import type { HostSearch } from './search';

/** `to` is an FeedbackOps app-relative path with its query, e.g. `/vocs?view=inbox&selected=…`. */
export type HostLinkProps = {
  to: string;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
} & Record<string, unknown>;

/** One notice a screen raises through its host: a plain toast, one with a single action, or the undo look. */
export type HostNotice = {
  tone: 'success' | 'error' | 'warning' | 'info';
  message: string;
  description?: string;
  action?: { label: string; onAction: () => void };
  durationMs?: number;
  /** `undo` is the standalone app's undo toast (`action` is its button); a host without that look may draw it as any action notice. */
  variant?: 'undo';
};

/**
 * What a screen that is mounted in more than one host (standalone app, platform
 * bridge) needs from its host. Screens exported through `src/global-screens`
 * use this instead of TanStack Router and `sonner`.
 */
export type HostSeam = {
  canLink(to: string): boolean;
  Link: ComponentType<HostLinkProps>;
  notifyError(message: string): void;
  notifySuccess(message: string): void;
  /**
   * Hooks, optional so a seam that only links and notifies stays valid. A seam's hooks are stable functions (hook
   * order never changes). `to` is the complete FeedbackOps path+query: a key absent from it is cleared.
   */
  useNavigate?: () => HostNavigate;
  /** The current screen's search as raw URL strings. */
  useSearch?: () => HostSearch;
  /** Sets the document title while the caller is mounted; `null` releases it. */
  useTitle?: (title: string | null) => void;
  /** Shows a notice and returns its id; `dismiss(id)` removes it early. */
  notify?: (notice: HostNotice) => string;
  dismiss?: (id: string) => void;
  /** The current screen as an FeedbackOps path+query (+ hash), parseable against any origin. */
  useHere?: () => string;
};

export type HostNavigate = (to: string, options?: { replace?: boolean }) => void;

const HostSeamContext = createContext<HostSeam | null>(null);

export const HostSeamProvider = HostSeamContext.Provider;

let defaultHost: HostSeam | null = null;

/** The seam `useHostSeam()` falls back to without a provider: the standalone app and the FO test setup register one; the bridge never does. */
export function registerDefaultHost(seam: HostSeam): void {
  defaultHost = seam;
}

export function clearDefaultHost(): void {
  defaultHost = null;
}

export function useHostSeam(): HostSeam {
  const seam = useContext(HostSeamContext) ?? defaultHost;
  if (seam === null) throw new Error('HostSeamProvider is missing');
  return seam;
}

export function useHostNavigate(): HostNavigate {
  const { useNavigate } = useHostSeam();
  if (useNavigate === undefined) throw new Error('HostSeamProvider is missing');
  return useNavigate();
}

export function useHostSearch(): HostSearch {
  const { useSearch } = useHostSeam();
  if (useSearch === undefined) throw new Error('HostSeamProvider is missing');
  return useSearch();
}

export function useHostTitle(title: string | null): void {
  const { useTitle } = useHostSeam();
  if (useTitle === undefined) throw new Error('HostSeamProvider is missing');
  useTitle(title);
}

export function useHostNotice(): {
  notify: (notice: HostNotice) => string;
  dismiss: (id: string) => void;
} {
  const { notify, dismiss } = useHostSeam();
  if (notify === undefined || dismiss === undefined) throw new Error('HostSeamProvider is missing');
  return { notify, dismiss };
}

export function useHostHere(): string {
  const { useHere } = useHostSeam();
  if (useHere === undefined) throw new Error('HostSeamProvider is missing');
  return useHere();
}

/** Passes every prop (and the ref React 19 forwards as a prop) through: Radix `asChild` injects them. */
export function HostLink(props: HostLinkProps): ReactElement {
  const { Link } = useHostSeam();
  return <Link {...props} />;
}
