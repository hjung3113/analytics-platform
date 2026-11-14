// Resolves a mention's stored `actor_id` to a display name for RichEditor /
// RichContentRenderer (`resolveMentionLabel`). The document keeps only the id;
// names come from the cached workspace actor list. Unknown ids return null so
// the SDK shows its fixed fallback instead of the id.
//
// The resolver identity changes when the list arrives, so renderers redraw
// with names. RichEditor does not redraw already-drawn chips on a change, and a
// composer's chips are inserted from MentionPickerButton, which only lists
// actors once the same cached list is loaded.

import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import * as React from 'react';

export function useMentionLabelResolver(
  options: { enabled?: boolean } = {},
): (actorId: string) => string | null {
  const { actors } = useWorkspaceActors(options.enabled === undefined ? {} : { enabled: options.enabled });
  return React.useMemo(() => {
    const names = new Map((actors ?? []).map((a) => [a.id, a.display_name]));
    return (actorId: string) => names.get(actorId) ?? null;
  }, [actors]);
}
