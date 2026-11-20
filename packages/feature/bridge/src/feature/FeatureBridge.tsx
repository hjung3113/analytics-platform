import { useMemo, type ComponentType, type ReactNode } from 'react';
import { ServerOff } from 'lucide-react';
import { UNDO_WINDOW_MS, formatFeedTime, formatListTime, formatSummaryTime, useI18n, usePlatform, useUnsavedGuard } from '@ap/kernel';
import { StateMessage } from '@ap/components';
import { FeatureScreenRoot, type HostLinkProps, type HostNavigate, type HostNotice, type HostSearch, type HostSeam } from '@ap/feature-screens/global-screens/core';
import type { TargetOf } from './links';
import { usePrimaryActionTarget } from './primary-action-target';
import { isReachable } from './reachable';
import { featureQueryClient, useFeatureSession } from './session';

// `UnlinkedLink` lives in its own module so the link maps (`links.tsx`, `operator-links.ts`) never import this file back.
import { UnlinkedLink } from './unlinked-link';
import { notificationHostLinks } from './operator-links';

export { UnlinkedLink };

/**
 * Hosts feature screens. Without a feature API (mock preview) nothing from feature mounts and nothing is
 * requested. With one, the subtree renders only for the current (adapter, revision, user) generation and until a feature 401 retires it: a change
 * unmounts the old subtree in that commit, clears the cache before the new one mounts, and remounts it (ADR-0071 decision 5).
 */
const noLink = () => false;
const noNavigate: HostNavigate = () => undefined;
const useNoNavigate = () => noNavigate;
const noSearch: HostSearch = {};
const useNoSearch = () => noSearch;
const useNoTitle = (_title: string | null) => undefined;
const useNoHere = () => '';

const TONE = { success: 'info', info: 'info', warning: 'warning', error: 'danger' } as const satisfies Record<HostNotice['tone'], 'info' | 'warning' | 'danger'>;

const usePermissionLinks: NonNullable<HostSeam['usePermissionLinks']> = () => {
  const { registry, resolveLink, location, route, accessibleSpaces } = usePlatform();
  const home = registry.platformHome;
  const homeLink = home ? resolveLink(home.id) : null;
  const currentSpace = route ? registry.spaceOf(route.menu) : null;
  const spaceHome = (accessibleSpaces.find(space => space.id === currentSpace?.id) ?? accessibleSpaces[0])?.homeMenuId;
  const fallback = !homeLink?.allowed && spaceHome ? resolveLink(spaceHome) : null;
  const allowedHome = homeLink?.allowed ? homeLink : fallback;
  return {
    permissionRequestHref: ({ capability, managedSystemId }) => {
      const menuId = 'permission-requests';
      if (!isReachable(registry, { menuId })) return null;
      const link = capability === undefined ? resolveLink(menuId) : resolveLink(menuId, {
        page: { capability, managedSystem: managedSystemId ?? null },
        returnTo: true,
      });
      return link.allowed ? location.href(link.href) : null;
    },
    permissionHomeHref: allowedHome?.allowed ? location.href(allowedHome.href) : null,
  };
};

/**
 * A stored return intent is a platform address (`/flow/…`, from a platform page) or a feature path (`/findings`, `/vocs?view=triage`, from a
 * feature screen's in-place request dialog, #2637). A feature path is mapped through the same destinations the notification links use, and
 * rebuilt with `linkTo` from the mapped target only (which carries the current page's context like any link), then checked by `safeReturnTo` like a stored platform address; an unmapped path, or one whose menu is not in this registry, offers no return.
 */
const usePermissionRequestReturn: NonNullable<HostSeam['usePermissionRequestReturn']> = () => {
  const { registry, canOpen, navigate, pathname, linkTo } = usePlatform();
  const platformHref = (intent: string | null): string | null => {
    const href = registry.safeReturnTo(intent);
    if (href !== null || intent === null) return href;
    const target = notificationHostLinks.targetOf(intent);
    // The rebuilt address passes `safeReturnTo` too, so a hidden detail menu is refused the same as when it was stored as a platform address.
    return isReachable(registry, target) ? registry.safeReturnTo(linkTo(target.menuId, { params: target.params, page: target.page })) : null;
  };
  return intent => {
    const href = platformHref(intent);
    if (href === null) return null;
    const [path = ''] = href.split('?');
    const route = registry.matchRoute(path);
    if (route === null || !canOpen(route.menu.id)) return null;
    return () => { navigate(href, { via: 'link', ...(path !== pathname ? { focus: 'page' } : {}) }); };
  };
};

/** `useNavigate`/`useSearch`/`useTitle`/`useHere` must be module-level hooks (stable identities): the seam is memoized on them, so an unrelated render never rebuilds it (with `targetOf`, a navigation does: see `hrefLinkTo`). */
export function FeatureBridge({ children, canLink = noLink, Link = UnlinkedLink, targetOf, useNavigate = useNoNavigate, useSearch = useNoSearch, useTitle = useNoTitle, useHere = useNoHere }: { children: ReactNode; canLink?: HostSeam['canLink']; targetOf?: TargetOf; Link?: ComponentType<HostLinkProps>; useNavigate?: () => HostNavigate; useSearch?: () => HostSearch; useTitle?: (title: string | null) => void; useHere?: () => string }) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  const { toast, dismissToast, registry, linkTo, absoluteUrl } = usePlatform();
  const session = useFeatureSession();
  // `linkTo`/`absoluteUrl` change with each navigation. A copy-link address rendered in a screen must be built from the navigation of that same render, and a ref
  // refreshed after commit would hand it the previous one; so `absoluteHref` closes over them and the seam is rebuilt per navigation, but only when it has `absoluteHref` (`targetOf`).
  const hrefLinkTo = targetOf ? linkTo : null;
  const hrefAbsoluteUrl = targetOf ? absoluteUrl : null;

  const seam = useMemo<HostSeam>(() => ({
    // With `targetOf`, a path is linkable only when its menu is in this registry (`hostLinks` applies the same rule to `Link`).
    canLink: targetOf ? to => isReachable(registry, targetOf(to)) : canLink,
    ...(targetOf && hrefLinkTo && hrefAbsoluteUrl ? {
      absoluteHref: (to: string) => {
        const target = targetOf(to);
        return isReachable(registry, target) ? hrefAbsoluteUrl(hrefLinkTo(target.menuId, { params: target.params, page: target.page })) : null;
      },
    } : {}),
    Link,
    lang,
    time: {
      list: at => formatListTime(at),
      summary: at => formatSummaryTime(at, lang),
      feed: at => formatFeedTime(at, lang),
    },
    usePermissionLinks,
    usePermissionRequestReturn,
    // The platform page head carries the menu title, so a screen drops its own route kicker (UX-5).
    hostOwnsTitle: true,
    // The platform carries the return path as its own `returnTo`, so a screen adds no feature one (Design 6).
    hostCarriesReturn: true,
    notifyError: message => toast(message, 'danger'),
    notifySuccess: message => toast(message, 'info'),
    useNavigate,
    useSearch,
    useTitle,
    // One look on the platform: `variant` is ignored, the action is the kernel toast's single button.
    // screen's two action lifetimes (D5, #886): no duration is screen's short undo window (standalone 4 s) — the platform keeps its 8 s undo window;
    // `Infinity` is screen's "stay" — the kernel's action default, which stays until acted on or dismissed (06 Toast). A finite duration passes through.
    notify: ({ tone, message, description, action, durationMs }) =>
      String(toast(message, TONE[tone], description, { ...(action ? { action } : {}), ...(durationMs === undefined ? (action ? { durationMs: UNDO_WINDOW_MS } : {}) : Number.isFinite(durationMs) ? { durationMs } : {}) })),
    dismiss: id => dismissToast(Number(id)),
    useHere,
    // The head element `FeatureScreenPage` offers for a screen's one primary action (null outside it); a module-level hook, so the seam stays stable.
    usePrimaryActionTarget,
    useUnsavedGuard,
  }), [canLink, targetOf, hrefLinkTo, hrefAbsoluteUrl, registry, Link, lang, toast, dismissToast, useNavigate, useSearch, useTitle, useHere]);

  if (session.status === 'no-api') {
    return <StateMessage icon={<ServerOff className="size-4" aria-hidden />}
      title={ko ? '실서버 필요' : 'Real server required'}
      body={ko ? '이 화면은 플랫폼 서버가 있어야 열립니다. 지금 미리보기에는 서버가 없습니다.' : 'This screen requires the platform server. No server is available in this preview.'} />;
  }
  if (session.status === 'pending') return null;
  if (session.status === 'retired') {
    return <StateMessage icon={<ServerOff className="size-4" aria-hidden />}
      title={ko ? '세션이 만료되었습니다' : 'Your session has expired'}
      body={ko ? '로그인 화면으로 이동합니다.' : 'Redirecting to the sign-in page.'} />;
  }
  return <FeatureScreenRoot client={featureQueryClient} host={seam} key={session.epoch}>{children}</FeatureScreenRoot>;
}
