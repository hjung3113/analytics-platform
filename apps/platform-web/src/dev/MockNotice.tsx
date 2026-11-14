import { useMessages } from '@ap/kernel';
import { DEV_MESSAGES } from './messages';

/** The mock assembly's sidebar notice: the shell holds no data-source text, so the mock build says it through `PlatformSlots.sidebarNotice`. */
export function MockNotice() {
  const m = useMessages(DEV_MESSAGES);
  return <>{m('mockNoticeIntegratedPrototypeSyntheticData')}</>;
}
