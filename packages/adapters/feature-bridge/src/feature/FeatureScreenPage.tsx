import type { ReactNode } from 'react';
import { PlatformPage } from '@ap/components';
import { usePlatform } from '@ap/kernel';
import { FeatureBridge } from './FeatureBridge';
import { operatorHostLinks } from './operator-links';
import type { OperatorRoute } from './operator-route';
import { RejectedPage } from './RejectedPage';

/** Module level: `FeatureBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;

/**
 * The page every operator bridge menu draws (ADR-0081): the address check, then one feature screen in a fill-height `PlatformPage` inside `FeatureBridge`.
 * A value `isValid` (the feature screens' own search schema for that screen; it imports a feature entry, so the menu passes it) refuses is rejected and preserved,
 * not replaced by a default query (06 §6.4): `RejectedPage` is drawn and `children`/`detail` are never mounted, so nothing is requested for it.
 * `detail` is a drawer drawn after the screen, inside `FeatureBridge`.
 */
export function FeatureScreenPage({ route, isValid, useSearch, useHere, children, detail }: {
  route: OperatorRoute; isValid: (key: string, value: string) => boolean; useSearch: () => Readonly<Record<string, string>>; useHere: () => string; children: ReactNode; detail?: ReactNode;
}) {
  const { pageParam } = usePlatform();
  const rejected = route.rejectedKey(pageParam, isValid);
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill">
    <FeatureBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useSearch} useHere={useHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col">{children}</div>
      </div>
      {detail}
    </FeatureBridge>
  </PlatformPage>;
}
