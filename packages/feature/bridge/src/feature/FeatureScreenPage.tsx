import { useState, type ReactNode } from 'react';
import { PlatformPage } from '@ap/components';
import { usePlatform } from '@ap/kernel';
import { FeatureBridge } from './FeatureBridge';
import { operatorHostLinks } from './operator-links';
import { PrimaryActionTargetProvider } from './primary-action-target';
import type { OperatorRoute } from './operator-route';
import { RejectedPage } from './RejectedPage';

/** Module level: `FeatureBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;

/**
 * The page every operator bridge menu draws (ADR-0081): the address check, then one feature screen in a fill-height `PlatformPage` inside `FeatureBridge`.
 * A value `isValid` (the feature screens' own search schema for that screen; it imports a feature entry, so the menu passes it) refuses is rejected and preserved,
 * not replaced by a default query (06 §6.4): `RejectedPage` is drawn and `children`/`detail` are never mounted, so nothing is requested for it.
 * `detail` is a drawer drawn after the screen, inside `FeatureBridge`.
 * The body is edge-to-edge (`bodyInset="none"`: the screens' own `ListShell` draws its padding) and the page head carries an empty primary-action slot a screen
 * portals its create/register button into through the seam's `usePrimaryActionTarget`; the slot is not drawn while the page shows a gate, so the screen keeps the button in its toolbar (ADR-0081 decision 5, #1291).
 */
export function FeatureScreenPage({ route, isValid, useSearch, useHere, children, detail }: {
  route: OperatorRoute; isValid: (key: string, value: string) => boolean; useSearch: () => Readonly<Record<string, string>>; useHere: () => string; children: ReactNode; detail?: ReactNode;
}) {
  const { pageParam } = usePlatform();
  // State, not a ref object: a screen that mounts before the head element must re-render once it exists (and fall back when a gate removes it).
  const [actionTarget, setActionTarget] = useState<HTMLElement | null>(null);
  const rejected = route.rejectedKey(pageParam, isValid);
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill" bodyInset="none" primaryAction={<span data-feature-primary-action className="contents" ref={setActionTarget} />}>
    <PrimaryActionTargetProvider value={actionTarget}>
      <FeatureBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useSearch} useHere={useHere}>
        <div className="relative h-full">
          <div className="absolute inset-0 flex flex-col">{children}</div>
        </div>
        {detail}
      </FeatureBridge>
    </PrimaryActionTargetProvider>
  </PlatformPage>;
}
