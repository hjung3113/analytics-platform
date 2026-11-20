import { describe, expect, it } from 'vitest';
import { managedSystemLabels } from '../managed-system-label';

describe('managedSystemLabels', () => {
  it('shows the name alone when it is unique, and adds the slug only to shared names', () => {
    const labels = managedSystemLabels([
      { id: 'p', name: '플랫폼', slug: 'platform' },
      { id: 'a', name: 'Power BI', slug: 'power-bi' },
      { id: 'b', name: 'Power BI', slug: 'power-bi-2' },
      { id: 't', name: 'Tableau', slug: 'tableau' },
    ]);
    expect([...labels.values()]).toEqual(['플랫폼', 'Power BI (power-bi)', 'Power BI (power-bi-2)', 'Tableau']);
  });

  it('decorates a plain name that reads like another system\'s decorated label, so no two labels look the same', () => {
    const labels = managedSystemLabels([
      { id: 'a', name: 'Power BI', slug: 'power-bi' },
      { id: 'b', name: 'Power BI', slug: 'other' },
      { id: 'c', name: 'Power BI (power-bi)', slug: 'spoof' },
    ]);
    expect(labels.get('c')).toBe('Power BI (power-bi) (spoof)');
    expect(new Set(labels.values()).size).toBe(3);
  });

  it('keeps decorating until no two labels match, even when a decorated label equals a third plain name', () => {
    const labels = managedSystemLabels([
      { id: 'a', name: 'P', slug: 'x' },
      { id: 'b', name: 'P', slug: 'y' },
      { id: 'c', name: 'P (x)', slug: 'z' },
      { id: 'd', name: 'P (x) (z)', slug: 'w' },
    ]);
    expect(labels.get('d')).toBe('P (x) (z) (w)');
    expect(new Set(labels.values()).size).toBe(4);
  });
});
