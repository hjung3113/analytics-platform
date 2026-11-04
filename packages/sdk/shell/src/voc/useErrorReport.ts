import { useContext } from 'react';
import type { VocAvailability } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { VocDrawerContext } from './VocDrawer';

/** The client error id the VOC `trace_id` accepts (`vocTraceIdSchema`: `client-` prefix, at most 80 characters). */
const TRACE_ID = /^client-[A-Za-z0-9._-]+$/;
const TRACE_ID_MAX = 80;

export type ErrorReport = {
  /** `available` = the report link may show; `denied` = the actor cannot file a VOC; `off` = no VOC form here (no slot, no server, a Managed System without VOC, an id that cannot be sent, or a failed lookup). */
  status: VocAvailability;
  /** Opens the real docked VOC drawer with the screen's frozen Context plus the trace and menu chips. Does nothing unless `status` is `available`. */
  open: (traceId: string) => void;
  /** True once the report for this `traceId` was filed; a new error (a new id) starts false. */
  submitted: boolean;
};

/**
 * What a screen's error view needs to offer 「이 오류 신고」 (#606): the gate, the opener and the filed state. It never throws: any failure while
 * resolving the gate reads as `off`, so the error screen itself cannot break. `traceId` is the screen's client error id, or null while it is not known yet.
 */
export function useErrorReport(traceId: string | null): ErrorReport {
  const voc = useContext(VocDrawerContext);
  const { route, registry } = useHostPlatform();
  let status: VocAvailability = 'off';
  try {
    if (voc !== null && traceId !== null && traceId.length <= TRACE_ID_MAX && TRACE_ID.test(traceId)) {
      status = voc.slot.availability?.({ spaceId: route === null ? null : registry.spaceOf(route.menu)?.id ?? null, menuId: route?.menu.id ?? null }) ?? 'available';
    }
  } catch {
    status = 'off';
  }
  return {
    status,
    open: id => { if (voc !== null && status === 'available') voc.openError(id); },
    submitted: voc !== null && traceId !== null && voc.submittedTrace === traceId,
  };
}
