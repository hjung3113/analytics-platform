import {
  type ComponentType,
  type ReactElement,
  type ReactNode,
  createContext,
  useContext,
} from 'react';

/** `to` is an FeedbackOps app-relative path with its query, e.g. `/vocs?view=inbox&selected=…`. */
export type HostLinkProps = {
  to: string;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
} & Record<string, unknown>;

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
};

const HostSeamContext = createContext<HostSeam | null>(null);

export const HostSeamProvider = HostSeamContext.Provider;

export function useHostSeam(): HostSeam {
  const seam = useContext(HostSeamContext);
  if (seam === null) throw new Error('HostSeamProvider is missing');
  return seam;
}

/** Passes every prop (and the ref React 19 forwards as a prop) through: Radix `asChild` injects them. */
export function HostLink(props: HostLinkProps): ReactElement {
  const { Link } = useHostSeam();
  return <Link {...props} />;
}
