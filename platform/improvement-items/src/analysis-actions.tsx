import { HeaderOverflowItem } from '@ap/components';
import { usePlatform, type AnalysisActionsProps, type AnalysisActionsSlot } from '@ap/kernel';
import { useCopy } from './copy';
import { IMPROVEMENT_ITEMS_MENU_ID, MANAGE_PERMISSION } from './endpoints';

/** App-injected analysis action; source page keys never share the destination's control namespace. */
export function ImprovementAnalysisActions({ menuId, global, page }: AnalysisActionsProps) {
  const c = useCopy(), { resolveLink, navigate, can } = usePlatform();
  const sourcePage = Object.fromEntries(Object.entries(page).filter(([key]) => key !== 'returnTo'));
  const resolution = resolveLink(IMPROVEMENT_ITEMS_MENU_ID, { global, page: { focus: 'new', origin: menuId, originPage: JSON.stringify(sourcePage) } });
  // Not registered in this assembly: draw no entry (06 §22 `none`), not a permission reason.
  if (resolution.kind === 'none') return null;
  // Same UI gate as the list's create button; the server stays the authority (improvement:manage).
  const allowed = resolution.allowed && can(MANAGE_PERMISSION);
  return <HeaderOverflowItem label={c.create} allowed={allowed} reason={resolution.allowed ? c.entryNoManage : c.entryDenied} onSelect={() => { if (allowed) navigate(resolution.href); }} />;
}
export const improvementAnalysisActions: AnalysisActionsSlot = { Actions: ImprovementAnalysisActions };
