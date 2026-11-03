// Unit tests for the per-process upload semaphore (#1266 b4).

import { describe, expect, it } from 'vitest';

import { createUploadAdmission } from '../upload-admission.js';

describe('createUploadAdmission', () => {
  it('grants up to the limit and refuses the next acquire without queueing', () => {
    const admission = createUploadAdmission(2);
    const a = admission.tryAcquire();
    const b = admission.tryAcquire();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(admission.inFlight).toBe(2);
    expect(admission.tryAcquire()).toBeNull();
    expect(admission.inFlight).toBe(2);
  });

  it('frees a slot on release and treats a double release as one', () => {
    const admission = createUploadAdmission(1);
    const release = admission.tryAcquire();
    release?.();
    release?.();
    expect(admission.inFlight).toBe(0);
    const again = admission.tryAcquire();
    expect(again).not.toBeNull();
    // The stale release above must not have freed the new holder's slot.
    release?.();
    expect(admission.inFlight).toBe(1);
    expect(admission.tryAcquire()).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects the limit %s', (limit) => {
    expect(() => createUploadAdmission(limit)).toThrow();
  });
});
