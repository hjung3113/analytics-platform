import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockAdapter, getRole, setRole, type RoleId } from '@ap/mock-server';
import { resetOnboardingMock } from '@ap/menu-topview-studio/mock';
import { MOCK_ACTIONS, MOCK_ENDPOINTS } from './mock-assembly';
import { registry } from '../menus';
import { modulePermissions } from '../modules';

// The 설비 온보딩 mock import as the app assembles it (#1658): an uploaded batch is read by id as the uploader and judged by the dev tool's
// own `@eqv/core` code (`checkSampleWindowImport`, `buildInventory`). Batches are the synthetic assets, edited in memory.
const assets = join(process.cwd(), '../../packages/eqv/assets/observations');
const asset = (equipmentId: string): Record<string, unknown> => {
  const dir = join(assets, equipmentId, 'windows');
  return JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]!), 'utf8')) as Record<string, unknown>;
};
/** eq-synth-02's batch as another equipment's: every record names the target equipment. */
const asEquipment = (equipmentId: string) => JSON.parse(JSON.stringify(asset('eq-synth-02')).replaceAll('"eq-synth-02"', JSON.stringify(equipmentId))) as Record<string, unknown>;
/** A reprocessed Data Generation of the same range (EV#105): other content, so another hash. */
const reprocessed = (batch: Record<string, unknown>) => JSON.parse(JSON.stringify(batch).replaceAll('"dataGeneration":"g1"', '"dataGeneration":"g7"')) as Record<string, unknown>;

const adapter = createMockAdapter({ endpoints: MOCK_ENDPOINTS, actions: MOCK_ACTIONS, registry, permissions: [...registry.permissions, ...modulePermissions(registry)] });
const previous = getRole();
beforeEach(() => { resetOnboardingMock(); setRole('engineer'); });
afterEach(() => setRole(previous));

const upload = async (batch: unknown, role: RoleId = 'engineer') => {
  setRole(role);
  const answer = await adapter.uploadFile!({ file: new Blob([JSON.stringify(batch)], { type: 'application/json' }), name: 'w.batch.json', idempotencyKey: crypto.randomUUID() });
  setRole('engineer');
  return answer.data!.id;
};
const importWindow = (equipmentId: string, uploadId: string) =>
  adapter.menuAction({ action: 'eqv.importSampleWindow', context: {}, input: { equipmentId, uploadId }, idempotencyKey: crypto.randomUUID() });
const read = async <T,>(endpoint: string, params: Record<string, unknown>) => (await adapter.menuQuery({ endpoint, context: {}, params })).data as T;
type Rows = { rows: { hash: string; state: string; counterpart: string | null; dataGeneration: string }[] };

describe('설비 온보딩 mock Sample Window import with @eqv/core', () => {
  it('stores a valid batch for an equipment without windows and serves the Inventory core builds from it', async () => {
    const answer = await importWindow('eq-synth-03', await upload(asEquipment('eq-synth-03')));
    expect(answer).toMatchObject({ outcome: 'ok', data: { state: 'active', dataGeneration: 'g1', occurrences: 29, timeDomain: 'site-synth', from: '2026-01-01T10:00:00.000' } });
    const hash = (answer.data as { hash: string }).hash;
    expect((await read<Rows>('eqv.sampleWindows', { equipmentId: 'eq-synth-03' })).rows.map((w) => w.hash)).toEqual([hash]);
    const inventory = await read<{ equipmentId: string; aliases: unknown[] }>('eqv.observedInventory', { equipmentId: 'eq-synth-03', windowHash: hash.slice(7) });
    expect(inventory.equipmentId).toBe('eq-synth-03');
    expect(inventory.aliases.length).toBeGreaterThan(0);
  });

  it('stages a reprocessed generation of the active window\'s range against it', async () => {
    const answer = await importWindow('eq-synth-02', await upload(reprocessed(asset('eq-synth-02'))));
    const rows = (await read<Rows>('eqv.sampleWindows', { equipmentId: 'eq-synth-02' })).rows;
    expect(answer).toMatchObject({ outcome: 'ok', data: { state: 'staged', dataGeneration: 'g7', counterpart: rows[0]!.hash } });
    expect(rows.map((w) => w.state)).toEqual(['active', 'staged']);
  });

  it('answers the stored row for the same content again', async () => {
    const answer = await importWindow('eq-synth-02', await upload(asset('eq-synth-02')));
    expect(answer).toMatchObject({ outcome: 'ok', data: { state: 'active', dataGeneration: 'g1' } });
    expect((await read<Rows>('eqv.sampleWindows', { equipmentId: 'eq-synth-02' })).rows).toHaveLength(1);
  });

  it('refuses another equipment\'s batch with core\'s issue codes, and another user\'s upload id', async () => {
    const wrong = await importWindow('eq-synth-03', await upload(asset('eq-synth-02')));
    expect(wrong.outcome).toBe('invalid');
    expect(wrong.fieldErrors).toContainEqual({ path: ['file', 'equipmentId'], code: 'equipment-mismatch' });
    expect(await importWindow('eq-synth-03', await upload(asEquipment('eq-synth-03'), 'admin'))).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['uploadId'], code: 'not_found' }] });
    expect((await read<Rows>('eqv.sampleWindows', { equipmentId: 'eq-synth-03' })).rows).toEqual([]);
  });
});
