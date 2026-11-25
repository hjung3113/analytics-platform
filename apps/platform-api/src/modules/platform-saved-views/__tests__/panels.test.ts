import { storedPanelCases } from '@ap/contracts/testing/saved-view-panels';
import { savedViewResponseSchemas } from '@ap/contract-schemas';
import { expect, it, vi } from 'vitest';

import type { Db } from '../../../db/client.js';
import type { CheckService } from '../../permissions/check-service.js';
import type { ViewRecord } from '../acl.js';
import * as repo from '../repository.js';
import { createSavedViewService } from '../service.js';

vi.mock('../repository.js', () => ({
  lockWorkspace: vi.fn(),
  standingsOf: vi.fn(),
  viewById: vi.fn(),
  viewsOfMenu: vi.fn(),
  writeView: vi.fn(),
}));

const session = { actorId: 'actor', workspaceId: 'workspace', roleLevel: 'user' };
const checkService = { checkCapability: async () => ({ allow: false }) } as unknown as CheckService;
const db = { transaction: async (work: () => Promise<unknown>) => work() } as unknown as Db;
const id = '11111111-1111-4111-8111-111111111111';
const version = 1;

it.each(storedPanelCases)('projects $label panels and preserves the stored value on rename', async ({ stored, read, rename }) => {
  let row: ViewRecord = {
    id, ownerId: session.actorId, kind: 'menu-view', menuId: 'menu', name: 'Original', version, updatedAt: 1,
    visibilityKind: 'private', approval: 'none', approvalNote: null, pending: null, people: [], groupIds: [],
    content: { menuSchemaVersion: 1, context: {}, page: [], chartOptions: {}, layout: null, panels: stored },
  };
  vi.mocked(repo.standingsOf).mockResolvedValue(new Map());
  vi.mocked(repo.viewById).mockImplementation(async () => row);
  vi.mocked(repo.viewsOfMenu).mockImplementation(async () => [row]);
  vi.mocked(repo.writeView).mockImplementation(async (_tx, _workspace, next, updatedAt) => {
    row = { ...next, version: next.version + 1, updatedAt };
    return row;
  });
  const { execute } = createSavedViewService({ db, checkService });
  const get = savedViewResponseSchemas.get.parse(await execute(session, { version, op: 'get', id }));
  const list = savedViewResponseSchemas.list.parse(await execute(session, { version, op: 'list', key: { menuId: row.menuId } }));
  const expected = {
    id, ownerId: session.actorId, kind: 'menu-view', menuId: 'menu', name: 'Original', schemaVersion: 1, version, updatedAt: 1,
    visibility: { kind: 'private' }, approval: 'none', menuSchemaVersion: 1, context: {}, page: [], chartOptions: {}, layout: null, ...read,
  };
  expect(get).toStrictEqual({ view: expected, capabilities: expect.any(Object) });
  expect(list).toEqual([get]);
  expect(row.content.panels).toEqual(stored);
  const updated = savedViewResponseSchemas.update.parse(await execute(session, {
    version, op: 'update', id, expectedVersion: version, patch: { name: rename },
  }));
  expect(updated).toStrictEqual({ ok: true, value: {
    view: { ...expected, name: rename, version: 2, updatedAt: expect.any(Number) },
    capabilities: expect.any(Object),
  } });
  expect(row.content.panels).toEqual(stored);
});
