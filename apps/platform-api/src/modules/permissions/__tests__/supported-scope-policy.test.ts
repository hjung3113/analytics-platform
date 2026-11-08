import type { Capability } from '@ap/feature-shared';
import { describe, expect, it } from 'vitest';

import type { Tx } from '../../../db/tx.js';
import { isOrdinarilyRequestable, validateSupportedScope } from '../supported-scope-policy.js';

describe('isOrdinarilyRequestable', () => {
  it.each([
    ['workspace.admin', false],
    ['finding.manage', true],
    ['survey.export', true],
    ['knowledge.catalog.manage', true],
    ['knowledge.catalog.import', true],
    ['knowledge.item.publish', true],
    ['knowledge.spec.publish', true],
    ['improvement.manage', true],
    ['lifecycle.project.manage', true],
    ['lifecycle.round.manage', true],
    ['knowledge.draft.create', true],
    ['explorer.source.read', true],
    ['explorer.export', true],
    ['explorer.investigate', true],
    ['dataset.manage', true],
    ['knowledge.access.manage', true],
    ['voc.read_public', true],
    ['voc.create', true],
  ] as const)('%s → %s', (capability: Capability, expected) => {
    expect(isOrdinarilyRequestable(capability)).toBe(expected);
  });

  it('validateSupportedScope rejects an ordinary request exactly when the predicate is false', async () => {
    const tx = {} as Tx;
    await expect(
      validateSupportedScope(tx, 'ws', 'workspace.admin', null, null, null),
    ).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(
      validateSupportedScope(tx, 'ws', 'workspace.admin', null, null, null, { approval: true }),
    ).resolves.toBeUndefined();
  });
});

describe('recipient role for the log knowledge capabilities (ADR-0107 decision 3)', () => {
  const tx = {} as Tx;
  it.each(['knowledge.catalog.manage', 'knowledge.catalog.import', 'knowledge.item.publish', 'knowledge.spec.publish', 'improvement.manage', 'lifecycle.project.manage', 'lifecycle.round.manage', 'explorer.investigate', 'dataset.manage', 'knowledge.access.manage'] as const)(
    '%s: a User recipient is refused on the ordinary and the approval path',
    async (capability) => {
      await expect(
        validateSupportedScope(tx, 'ws', capability, null, null, null, { recipientRole: 'user' }),
      ).rejects.toMatchObject({ code: 'validation.failed' });
      await expect(
        validateSupportedScope(tx, 'ws', capability, null, null, null, {
          approval: true,
          recipientRole: 'user',
        }),
      ).rejects.toMatchObject({ code: 'validation.failed' });
    },
  );

  it.each(['knowledge.catalog.manage', 'knowledge.catalog.import', 'knowledge.item.publish', 'knowledge.spec.publish', 'improvement.manage', 'lifecycle.project.manage', 'lifecycle.round.manage', 'explorer.investigate', 'dataset.manage', 'knowledge.access.manage'] as const)(
    '%s: a Developer or Admin recipient passes',
    async (capability) => {
      for (const recipientRole of ['developer', 'admin']) {
        await expect(
          validateSupportedScope(tx, 'ws', capability, null, null, null, { recipientRole }),
        ).resolves.toBeUndefined();
      }
    },
  );
});

describe('recipient role for knowledge.draft.create (owner answer #1198 Q2)', () => {
  const tx = {} as Tx;
  it.each(['user', 'developer', 'admin'])('a %s recipient passes on the ordinary and the approval path', async (recipientRole) => {
    await expect(
      validateSupportedScope(tx, 'ws', 'knowledge.draft.create', null, null, null, { recipientRole }),
    ).resolves.toBeUndefined();
    await expect(
      validateSupportedScope(tx, 'ws', 'knowledge.draft.create', null, null, null, { approval: true, recipientRole }),
    ).resolves.toBeUndefined();
  });
});
