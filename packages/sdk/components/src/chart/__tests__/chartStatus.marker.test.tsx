import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartStatusLegend } from '../ChartStatusLegend';
import { STATUS_GLYPHS, statusGlyph, statusMarker, statusText, type ChartStatus } from '../chartStatus';
import { frameStatusCsvLabel } from '../linePointStatus';

const low: ChartStatus = { tone: 'warning', label: '하한 미달', reason: 'PM1', marker: '▼' };

describe('status glyphs (#2363)', () => {
  it('default glyphs say severity only, never a direction', () => {
    expect(STATUS_GLYPHS).toEqual({ danger: '●', warning: '◆', neutral: '○' });
    expect(Object.values(STATUS_GLYPHS).join('')).not.toMatch(/[▲▼◀▶]/);
  });
  it('a menu-declared marker replaces the tone glyph in text, chart label, legend and line CSV', () => {
    expect(statusGlyph(low)).toBe('▼');
    expect(statusText(low)).toBe('▼ 하한 미달 · PM1');
    expect(statusMarker(low).formatter).toBe('{status|▼}');
    const { container } = render(<ChartStatusLegend statuses={[low]} />);
    expect(container.querySelector('svg text')?.textContent).toBe('▼');
    expect(frameStatusCsvLabel({ id: 'l', name: 'L', kind: 'line', points: [] } as never, false, low)).toBe('▼ 하한 미달');
  });
  it('an unusable marker falls back to the tone glyph', () => {
    for (const marker of ['', '▼▼', 'ab', ' ', '{', '}', '|']) expect(statusGlyph({ ...low, marker })).toBe('◆');
    expect(statusText({ tone: 'danger', label: 'X', marker: '}' })).toBe('● X');
  });
});
