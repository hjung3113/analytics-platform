import { describe, expect, it } from 'vitest';
import { rowIdLabel } from './format';

describe('rowIdLabel', () => {
  it('reads a row id the way the detail labels and the trend legend do', () => {
    expect(rowIdLabel('EQ-001.H1')).toBe('EQ-001 · H1');
  });
});
