import type { ActionOutcome, ActionResponse, DeleteNoticeInput, Notice, PlatformAdapter, SaveNoticeInput } from '@ap/contracts';

/**
 * Targeted query invalidation owned by the app composition (ADR-0098 §4, #1106). A notice write goes through the
 * adapter port, not a menu action, so the Kernel's `ActionSpec.invalidates` never runs for it: the Home banner
 * would stay stale until something else refreshed it. The app declares which of its endpoints a write affects and
 * the bridge (`EndpointInvalidationBridge`) hands the ids to `refreshEpochs.bump`. The Kernel learns no menu name.
 */
export type EndpointInvalidationSource = {
  subscribe: (listener: (endpointIds: readonly string[]) => void) => () => void;
};

export type EndpointInvalidation = EndpointInvalidationSource & {
  emit: (endpointIds: readonly string[]) => void;
};

export function createEndpointInvalidation(): EndpointInvalidation {
  const listeners = new Set<(endpointIds: readonly string[]) => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    emit(endpointIds) {
      for (const listener of [...listeners]) listener(endpointIds);
    },
  };
}

/** The Home banner's endpoint id (`platform/home` `noticesEndpoint`); a test pins it against the declaration. */
export const NOTICE_AFFECTED_ENDPOINTS = ['home.notices'] as const;

/** A write may have applied after these answers; a judged `invalid`/`forbidden`/`not_found`/`error` changed nothing. */
const MAY_HAVE_CHANGED: readonly ActionOutcome[] = ['ok', 'conflict', 'unknown'];

/**
 * The adapter with `saveNotice` / `deleteNotice` wrapped: same arguments (input key and version, signal), same
 * result, same errors. After the write settles, the affected endpoints are emitted when it may have changed the
 * notices — also when the call rejects (an aborted request may still have been applied). Create it once per
 * bootstrap; a new wrapper per render would hand the Kernel a new adapter identity each time.
 */
export function withNoticeInvalidation(adapter: PlatformAdapter, invalidation: Pick<EndpointInvalidation, 'emit'>): PlatformAdapter {
  const emit = () => invalidation.emit(NOTICE_AFFECTED_ENDPOINTS);
  const settle = async <T>(call: () => Promise<ActionResponse<T>>): Promise<ActionResponse<T>> => {
    let result: ActionResponse<T>;
    try {
      result = await call();
    } catch (error) {
      emit();
      throw error;
    }
    if (MAY_HAVE_CHANGED.includes(result.outcome)) emit();
    return result;
  };
  return {
    ...adapter,
    saveNotice: (input: SaveNoticeInput, signal?: AbortSignal): Promise<ActionResponse<Notice>> => settle(() => adapter.saveNotice(input, signal)),
    deleteNotice: (input: DeleteNoticeInput, signal?: AbortSignal): Promise<ActionResponse<{ id: string }>> => settle(() => adapter.deleteNotice(input, signal)),
  };
}
