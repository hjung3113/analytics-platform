import { useEffect } from 'react';
import { isBoardPath, usePlatform, type PageProps } from '@ap/kernel';
import HwTimePage from './HwTimePage';

export function LegacyHwTimeView(props: PageProps) {
  const { location, url, pathname, route, linkTo, navigate } = usePlatform();
  // Public location is the main address; a pane's virtual URL is independent of the board address.
  const inBoard = isBoardPath((location.read() ?? '').split('?')[0]!);
  const queryAt = url.indexOf('?');
  const search = queryAt === -1 ? '' : url.slice(queryAt + 1);
  // Preserve old Context, drill and return origin; obsolete page keys are ignored by the screen.
  const target = `${linkTo('hw-time').split('?')[0]}${search ? `?${search}` : ''}`;
  const canonical = pathname === route?.menu.path;
  useEffect(() => {
    // Accepted Kernel limit #2330: recent visit and usage entry may record the legacy id before this replace.
    if (!inBoard && canonical) navigate(target, { replace: true });
  }, [inBoard, canonical, navigate, target]);
  return inBoard ? <HwTimePage {...props} /> : null;
}
