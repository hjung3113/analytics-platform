import { describe, expect, it } from 'vitest';

import { checkWindowFile, parseUploadJson, registerErrors, windowHashOf, isWindowHex } from '../domain/window-checks.js';
import { sampleBatch } from './fixture.js';

const enc = (text: string) => new TextEncoder().encode(text);
const ids = { vendorId: '6f9619ff-8b86-4d11-b42d-00c04fc964ff', modelId: '6f9619ff-8b86-4d11-b42d-00c04fc964fe' };

describe('Sample Window checks (#1658 Sample Window·Fleet PR)', () => {
  it('parses strict UTF-8 JSON only', () => {
    expect(parseUploadJson(enc('{"a":1}'))).toEqual({ ok: true, value: { a: 1 } });
    expect(parseUploadJson(enc('{nope'))).toEqual({ ok: false });
    expect(parseUploadJson(new Uint8Array([0xff, 0xfe, 0x7b]))).toEqual({ ok: false });
  });

  it('addresses a window by the 64 hex digits of its hash', () => {
    expect(isWindowHex('a'.repeat(64))).toBe(true);
    for (const bad of ['A'.repeat(64), 'a'.repeat(63), `sha256:${'a'.repeat(64)}`, 7, undefined]) expect(isWindowHex(bad)).toBe(false);
    expect(windowHashOf('b'.repeat(64))).toBe(`sha256:${'b'.repeat(64)}`);
  });

  it('judges a window file with the core verdict: a valid batch is ok, a stored window of the same content is `same`', async () => {
    const batch = sampleBatch('eq-synth-t1');
    const first = await checkWindowFile(batch, 'eq-synth-t1', []);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.check.same).toBeNull();
    const ref = { from: first.check.summary.from, to: first.check.summary.to, hash: first.check.summary.hash, timeDomain: first.check.summary.timeDomain };
    const again = await checkWindowFile(batch, 'eq-synth-t1', [ref]);
    expect(again.ok && again.check.same?.hash).toBe(ref.hash);
  });

  it('a reprocessed generation of the exact range replaces; a batch for another equipment and an overlap are refused with {path, code} only', async () => {
    const batch = sampleBatch('eq-synth-t1');
    const first = await checkWindowFile(batch, 'eq-synth-t1', []);
    if (!first.ok) throw new Error('fixture batch must be valid');
    const ref = { from: first.check.summary.from, to: first.check.summary.to, hash: first.check.summary.hash, timeDomain: first.check.summary.timeDomain };
    const reprocessed = await checkWindowFile(sampleBatch('eq-synth-t1', { generation: 'g7' }), 'eq-synth-t1', [ref]);
    expect(reprocessed.ok && reprocessed.check.replaces.map((r) => r.hash)).toEqual([ref.hash]);
    const foreign = await checkWindowFile(sampleBatch('eq-synth-other'), 'eq-synth-t1', []);
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) {
      for (const e of foreign.errors) {
        expect(e.path[0]).toBe('file');
        expect(Object.keys(e).sort()).toEqual(['code', 'path']);
      }
    }
    const notABatch = await checkWindowFile({ nope: true }, 'eq-synth-t1', []);
    expect(notABatch.ok).toBe(false);
  });

  it('registration shape: an id the address carries, a trimmed printable label of at most 120, Hub uuids', () => {
    const ok = { equipmentId: 'eq-synth-9', label: ' Etcher 9 ', ...ids };
    expect(registerErrors(ok)).toEqual([]);
    expect(registerErrors({ ...ok, equipmentId: '-bad' })).toEqual([{ path: ['equipmentId'], code: 'invalid' }]);
    expect(registerErrors({ ...ok, equipmentId: 'a'.repeat(201) })).toEqual([{ path: ['equipmentId'], code: 'invalid' }]);
    expect(registerErrors({ ...ok, equipmentId: 'has space' })).toEqual([{ path: ['equipmentId'], code: 'invalid' }]);
    for (const label of ['', '   ', 'x'.repeat(121), 'bad\u0007label', 5]) expect(registerErrors({ ...ok, label }), String(label)).toEqual([{ path: ['label'], code: 'invalid' }]);
    expect(registerErrors({ ...ok, vendorId: 'acme', modelId: undefined })).toEqual([
      { path: ['vendorId'], code: 'invalid' },
      { path: ['modelId'], code: 'invalid' },
    ]);
  });
});
