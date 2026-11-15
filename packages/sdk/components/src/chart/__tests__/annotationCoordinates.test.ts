import { expect, it } from 'vitest';
import { overlapsHalfOpen, parseDateTime, wallClockEpochMs } from '@ap/contracts';
import { baselineInput } from '../__fixtures__/baselineInput';
import { buildChartOption } from '../buildChartOption';

it.each(['2026-02-28T12:34:56', '0100-01-01T00:00:00', '0099-01-01T00:00:00', '2026-02-30T00:00:00', 'bad', '2026-01-01T00:00:00Z'])('shares throwing and nonthrowing wall-clock validation for %s', value => {
  let expected: number | null = null;
  try { expected = parseDateTime(value, 'annotation').getTime(); } catch { /* Invalid input is represented by null by the nonthrowing API. */ }
  expect(wallClockEpochMs(value)).toBe(expected);
});
it('draws annotations from resolved coordinates without parsing raw annotation strings', () => {
  const option = buildChartOption(baselineInput({ xType: 'time', horizontal: false, displayed: [], annotations: [{ text: 'Resolved note', from: 'raw category', to: 'raw category' }], noteSpans: [{ from: 100, to: 200 }], noteLevels: [0] })) as { series: { markArea?: { data: unknown[] } }[] };
  expect(option.series.flatMap(s => s.markArea?.data ?? [])).toMatchObject([[{ xAxis: 100 }, { xAxis: 200 }]]);
});
it.each([
  ['range ending at the query start', 0, 10, false],
  ['range starting at the query end', 20, 30, false],
  ['range crossing the query start', 5, 15, true],
  ['point at the query start', 10, 10, true],
  ['point at the query end', 20, 20, false],
  ['reversed range', 15, 12, false],
] as const)('half-open overlap with [10, 20): %s', (_label, from, to, expected) => {
  expect(overlapsHalfOpen(from, to, 10, 20)).toBe(expected);
});
