import { describe, expect, it } from 'vitest';
import { rowsForExport } from './pages/cycleData';
import { getRole, setRole } from './api';
import { emptyGlobal } from '@ap/contracts';

// Export used to read the population directly, bypassing serve()'s per-request
// permission check: a role without analytics:view got rows. It must go through
// serve() and be rejected like any other read.
const global = { ...emptyGlobal, scopeId: 'ICH', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };

describe('export path re-validates permission through serve', () => {
  it('rejects a role without analytics:view', async () => {
    const before = getRole();
    try {
      setRole('viewer');
      const result = await rowsForExport(global, '3');
      expect(result.status).toBe('rejected');
    } finally {
      setRole(before);
    }
  });

  it('exports rows for a role with analytics:view', async () => {
    const before = getRole();
    try {
      setRole('engineer');
      const result = await rowsForExport(global, '3');
      if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`);
      expect(result.rows.length).toBeGreaterThan(0);
    } finally {
      setRole(before);
    }
  });
});
