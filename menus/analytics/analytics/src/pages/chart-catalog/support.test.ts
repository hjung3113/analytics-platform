import { describe, expect, it } from 'vitest';
import { CHART_KINDS } from '../../endpoints';
import { manifests } from '../../index';
import { supportFor, supportCounts } from './support';

describe('catalog support source of truth (06 §16)', () => {
  it.each(CHART_KINDS)('%s has eight actions, explained limits and matching marks/counts', kind => {
    const row = supportFor(kind, manifests.find(menu => menu.id === 'chart-catalog')!.features);
    expect(row).toHaveLength(8);
    for (const cell of row) {
      expect(cell.reference).toBe('06 §16');
      if (cell.status !== 'supported') {
        expect(cell.reason.ko.length).toBeGreaterThan(0);
        expect(cell.reason.en.length).toBeGreaterThan(0);
      }
    }
    const counts = supportCounts(row);
    expect(counts.supported + counts.conditional + counts.unsupported).toBe(8);
    expect(row.find(cell => cell.id === 'drill')!.status).toBe(kind === 'line' || kind === 'bar' ? 'unsupported' : 'conditional');
  });
  it.each(['line', 'bar'] as const)('%s follows feature flags for Compare/Annotate/Export', kind => {
    const off = supportFor(kind, { compare: false, annotate: false, export: false });
    for (const id of ['compare', 'annotate', 'export']) expect(off.find(cell => cell.id === id)!.status).toBe('unsupported');
    const on = supportFor(kind, { compare: true, annotate: true, export: true });
    expect(on.find(cell => cell.id === 'compare')!.status).toBe('supported');
    expect(on.find(cell => cell.id === 'annotate')!.status).toBe('conditional');
  });
});
