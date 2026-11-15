import { useEffect } from 'react';
import { isBoardPath, usePlatform, type PageProps } from '@ap/kernel';
import { HwTimeViewContent } from './HwTimePage';
import type { HwTimeView } from './views';

export function LegacyHwTimeView({ view, ...props }: PageProps & { view: HwTimeView }) {
  const { location, url, pathname, route, linkTo, navigate } = usePlatform();
  // Public location is the main address; a pane's virtual URL is independent of the board address.
  const inBoard = isBoardPath((location.read() ?? '').split('?')[0]!);
  const queryAt = url.indexOf('?');
  const search = queryAt === -1 ? '' : url.slice(queryAt + 1);
  // Keep the old search bytes, including Context and return origin; only the new View pair is appended.
  const target = `${linkTo('hw-time').split('?')[0]}?${search ? `${search}&` : ''}view=${view}`;
  const canonical = pathname === route?.menu.path;
  useEffect(() => {
    // Accepted Kernel limit #2330: recent visit and usage entry may record the legacy id before this replace.
    if (!inBoard && canonical) navigate(target, { replace: true });
  }, [inBoard, canonical, navigate, target]);
  return inBoard ? <HwTimeViewContent {...props} view={view} /> : null;
}
export const LegacySteps = (props: PageProps) => <LegacyHwTimeView {...props} view="steps" />;
export const LegacyCompare = (props: PageProps) => <LegacyHwTimeView {...props} view="compare" />;
export const LegacyOverview = (props: PageProps) => <LegacyHwTimeView {...props} view="overview" />;
export const LegacyTable = (props: PageProps) => <LegacyHwTimeView {...props} view="table" />;
