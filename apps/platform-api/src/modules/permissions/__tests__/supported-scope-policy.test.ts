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
  it.each(['knowledge.catalog.manage', 'knowledge.catalog.import'] as const)(
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

  it.each(['knowledge.catalog.manage', 'knowledge.catalog.import'] as const)(
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
