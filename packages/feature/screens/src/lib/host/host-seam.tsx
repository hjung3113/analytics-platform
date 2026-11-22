import {
  type ButtonHTMLAttributes,
  type ComponentType,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefObject,
  createContext,
  useContext,
} from 'react';
import type { PermissionBlockedPanelProps } from '@ap/ui';

import type { HostSearch } from './search';

/** `to` is an feature app-relative path with its query, e.g. `/vocs?view=inbox&selected=…`. */
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

type PermissionRequestReturn = (intent: string | null) => (() => void) | null;

type HostPermissionLinks = {
  permissionRequestHref?: (prefill: { capability?: string; managedSystemId?: string }) => string | null;
  permissionHomeHref?: string | null;
};

type RequestReadState = {
  pending: boolean;
  statusHref: string | null;
  requestHref?: string | null;
  approvedPartial?: boolean;
  read?: 'checking' | 'error';
  retry?: () => void;
};

type RequestReadPresentation = {
  phase: 'pending' | 'request' | 'checking' | 'error';
  checking: boolean;
  href: string | null | undefined;
  requestStatus: NonNullable<PermissionBlockedPanelProps['requestStatus']>;
  label: string;
  readMessage: string | undefined;
  showRetry: boolean;
  retryLabel: string;
  focusProps: Pick<HTMLAttributes<HTMLElement>, 'onFocus' | 'onBlur'>;
  busyProps: Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-busy' | 'aria-disabled' | 'onClick'>;
  retryProps: Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-busy' | 'aria-disabled' | 'onClick'>;
};

/**
 * What a screen that is mounted in more than one host (standalone app, platform
 * bridge) needs from its host. Screens exported through `src/global-screens`
 * use this instead of TanStack Router and `sonner`.
 */
export type HostSeam = HostPermissionLinks & {
  /** Stable SDK hook supplied by hosts that open the permission request page. */
  useAccessRequestState?: (state: RequestReadState, options: {
    lang: 'ko' | 'en';
    kind: 'link';
    container: RefObject<HTMLElement | null>;
  }) => RequestReadPresentation;
  /** Resolves a stored permission request address to a host action if the menu can be opened. */
  usePermissionRequestReturn?: () => PermissionRequestReturn;
  /** Stable hook for links that depend on the current navigation. */
  usePermissionLinks?: () => HostPermissionLinks;
  /**
   * Stable hook. Follows an href this seam handed out (`permissionRequestHref`, `permissionHomeHref`) inside the host, without reloading the app,
   * and returns true; false when the host cannot, and the caller loads the href. Absent = always false (#2638).
   */
  useFollowHostHref?: () => (href: string) => boolean;
  canLink(to: string): boolean;
  lang?: 'ko' | 'en';
  time?: {
    list(at: string): string;
    summary(at: string): string;
    feed(at: string): { text: string; title?: string };
  };
  Link: ComponentType<HostLinkProps>;
  notifyError(message: string): void;
  notifySuccess(message: string): void;
  /** Retires cached VOC reads and refreshes counts after a denied Inbox read. */
  clearDeniedVocRead?: (listKeyHash: string) => void;
  /**
   * Hooks, optional so a seam that only links and notifies stays valid. A seam's hooks are stable functions (hook
   * order never changes). `to` is the complete feature path+query: a key absent from it is cleared.
   */
  useNavigate?: () => HostNavigate;
  /** The current screen's search as semantic strings, a new object per navigation (even back to the same URL). */
  useSearch?: () => HostSearch;
  /** Sets the document title while the caller is mounted; `null` releases it. */
  useTitle?: (title: string | null) => void;
  /** Shows a notice and returns its id; `dismiss(id)` removes it early. */
  notify?: (notice: HostNotice) => string;
  dismiss?: (id: string) => void;
  /** The current screen as an feature path+query (+ hash), parseable against any origin. */
  useHere?: () => string;
  /** True when the host already shows the screen's identity (its own page title), so a screen drops its inline route kicker. Absent = the screen shows it. */
  hostOwnsTitle?: boolean;
  /** True when the host carries the return path itself (the platform's `returnTo`), so a screen adds no feature `returnTo` to an outbound href and draws no feature-only back link. Absent = the screen does. */
  hostCarriesReturn?: boolean;
  /**
   * Hook, stable like the others. The element in the host's page head where a screen draws its one primary action (create/register), or `null` when the host has none
   * (standalone app, a gated page): the screen then keeps the action in its own toolbar. See `HostPrimaryAction`.
   */
  usePrimaryActionTarget?: () => HTMLElement | null;
  /** Registers a screen's unsaved value with the host navigation guard; no credential is passed. */
  useUnsavedGuard?: (dirty: boolean, options?: { message?: string; onDiscard?: () => void }) => void;
  /** An absolute URL for the feature path `to` (copy-link actions), or `null` when this host has no address to give. */
  absoluteHref?: (to: string) => string | null;
};

export type HostNavigate = (to: string, options?: { replace?: boolean }) => void;

const useNoPermissionRequestReturn = () => null;

export function useHostPermissionRequestReturn(): PermissionRequestReturn | null {
  const { usePermissionRequestReturn = useNoPermissionRequestReturn } = useHostSeam();
  return usePermissionRequestReturn();
}

const HostSeamContext = createContext<HostSeam | null>(null);

export const HostSeamProvider = HostSeamContext.Provider;

let defaultHost: HostSeam | null = null;

/** The seam `useHostSeam()` falls back to without a provider: the standalone app and the screen test setup register one; the bridge never does. */
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

const useNoPermissionLinks = () => undefined;

export function useHostPermissionLinks(): HostPermissionLinks {
  const host = useHostSeam();
  const { usePermissionLinks = useNoPermissionLinks } = host;
  return usePermissionLinks() ?? host;
}

export function useHostNavigate(): HostNavigate {
  const { useNavigate } = useHostSeam();
  if (useNavigate === undefined) throw new Error('HostSeamProvider is missing');
  return useNavigate();
}

const useNoNavigate = (): null => null;
const noFollow = () => false;
const useNoFollowHostHref = () => noFollow;

/** See `HostSeam.useFollowHostHref`. */
export function useFollowHostHref(): (href: string) => boolean {
  const { useFollowHostHref: useFollow = useNoFollowHostHref } = useHostSeam();
  return useFollow();
}

/** Navigation hook for optional destinations such as a toast action. */
export function useOptionalHostNavigate(): HostNavigate | null {
  const { useNavigate = useNoNavigate } = useHostSeam();
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

const useNoPrimaryActionTarget = (): HTMLElement | null => null;

/** The host's primary-action element, or `null` when the seam has none. */
export function useHostPrimaryActionTarget(): HTMLElement | null {
  const { usePrimaryActionTarget = useNoPrimaryActionTarget } = useHostSeam();
  return usePrimaryActionTarget();
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

const useNoUnsavedGuard = (_dirty: boolean, _options?: { message?: string; onDiscard?: () => void }) => {};

export function useHostUnsavedGuard(dirty: boolean, options?: { message?: string; onDiscard?: () => void }): void {
  const { useUnsavedGuard = useNoUnsavedGuard } = useHostSeam();
  useUnsavedGuard(dirty, options);
}
