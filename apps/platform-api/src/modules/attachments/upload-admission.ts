// Per-process admission bound for POST /attachments (#1266 b4).
//
// Each upload is buffered in memory (up to MAX_ATTACHMENT_BYTES) before the
// storage put, so concurrent uploads are the process memory bound. A slot is
// taken BEFORE buffering and released in a `finally`; when none is free the
// caller is refused at once (no queue): a queued upload would hold its socket
// and request budget while waiting.

export interface UploadAdmission {
  /** Returns a release function, or null when every slot is taken. */
  tryAcquire(): (() => void) | null;
  /** Slots currently held (tests and diagnostics). */
  readonly inFlight: number;
}

export function createUploadAdmission(limit: number): UploadAdmission {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('upload admission limit must be a positive integer');
  }
  let held = 0;
  return {
    tryAcquire() {
      if (held >= limit) return null;
      held += 1;
      let released = false;
      return () => {
        // Idempotent: a double release must not free another request's slot.
        if (released) return;
        released = true;
        held -= 1;
      };
    },
    get inFlight() {
      return held;
    },
  };
}
