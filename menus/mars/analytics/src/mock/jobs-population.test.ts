import { describe, expect, it } from 'vitest';
import { computeKpis, trendBuckets } from './productivity';
import { percentile, population } from './cycle';
import { cycleMinutes, EQUIPMENT, jobsInPeriod } from '@ap/mock-server';
import { emptyGlobal } from '@ap/contracts';

const FROM = '2026-09-20T00:00:00';
const TO = '2026-09-25T00:00:00';
const DAY_FROM = '2026-09-25T09:00:00';
const DAY_TO = '2026-09-26T09:00:00';

function mem(room?: string) {
  return EQUIPMENT.filter(e => e.site === 'MEM' && (!room || e.room === room)).slice(0, room ? 4 : 6);
}

describe('screen 11 and 12 share one job population', () => {
  it('matches completed counts for several equipment sets and periods', () => {
    const cases = [
      { equipment: mem('PHOTO'), from: FROM, to: TO },
      { equipment: mem('ETCH').slice(0, 1), from: FROM, to: TO },
      { equipment: mem(), from: DAY_FROM, to: DAY_TO },
    ];
    for (const { equipment, from, to } of cases) {
      const jobs = jobsInPeriod(equipment, from, to);
      const kpi = computeKpis(equipment, from, to, emptyGlobal);
      const v3 = population(equipment, { ...emptyGlobal, from, to }, '3');
      const v4 = population(equipment, { ...emptyGlobal, from, to }, '4');
      expect(jobs.length).toBeGreaterThan(0);
      expect(kpi.throughput.jobs).toBe(jobs.length);
      expect(v3.length).toBe(jobs.length);
      expect(v4.length).toBe(jobs.length);
      expect(v3.map(row => row.anchor).sort()).toEqual(v4.map(row => row.anchor).sort());
      expect(v3.some((row, i) => row.cycleMin !== v4[i].cycleMin)).toBe(true);
    }
  });

  it('matches v4 P50/P95 and keeps v3 minutes different', () => {
    const equipment = mem('PHOTO').slice(0, 2);
    const kpi = computeKpis(equipment, FROM, TO, emptyGlobal);
    const v4 = population(equipment, { ...emptyGlobal, from: FROM, to: TO }, '4');
    const v3 = population(equipment, { ...emptyGlobal, from: FROM, to: TO }, '3');
    expect(percentile(v4.map(row => row.cycleMin), 0.5)).toBe(kpi.cycle.p50);
    expect(percentile(v4.map(row => row.cycleMin), 0.95)).toBe(kpi.cycle.p95);
    expect(percentile(v3.map(row => row.cycleMin), 0.5)).not.toBe(kpi.cycle.p50);
    expect(v4.every((row, i) => row.cycleMin >= v3[i].cycleMin)).toBe(true);
  });

  it('sums the same jobs at hour, day, and week', () => {
    const equipment = mem('PHOTO').slice(0, 3);
    const kpi = computeKpis(equipment, FROM, TO, emptyGlobal);
    for (const grain of ['hour', 'day', 'week'] as const) {
      const total = trendBuckets(equipment, FROM, TO, grain, emptyGlobal).reduce((sum, bucket) => sum + (bucket.jobs ?? 0), 0);
      expect(total).toBe(kpi.throughput.jobs);
    }
  });

  it('uses v4 minutes only when the version is 4', () => {
    const equipment = mem().slice(0, 1);
    const [job] = jobsInPeriod(equipment, DAY_FROM, DAY_TO);
    expect(cycleMinutes(job, '4')).toBe(job.cycleMinV4);
    expect(cycleMinutes(job, '3')).toBe(job.cycleMinV3);
    expect(job.cycleMinV4).toBeGreaterThan(job.cycleMinV3);
    expect(job.startedAt < '2026-09-26T08:00:00').toBe(true);
  });

  it('varies hourly throughput deterministically with shift-boundary dips and a maintenance trough', () => {
    const equipment = EQUIPMENT.filter(e => e.site === 'MEM' && ['PHOTO', 'ETCH', 'CVD'].includes(e.room));
    const from = '2026-09-25T00:00:00';
    const to = '2026-09-26T00:00:00';
    const trend = trendBuckets(equipment, from, to, 'hour', emptyGlobal);
    expect(trend).toHaveLength(24);
    expect(trendBuckets(equipment, from, to, 'hour', emptyGlobal)).toEqual(trend);

    const counts = trend.map(bucket => bucket.jobs ?? 0);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    expect(min).toBeGreaterThan(0);
    expect(max / min).toBeGreaterThanOrEqual(2);

    for (const shiftHour of [6, 14, 22]) {
      expect(counts[shiftHour]).toBeLessThan(counts[shiftHour - 1]);
      expect(counts[shiftHour]).toBeLessThan(counts[shiftHour + 1]);
    }
    for (const maintHour of [2, 3]) {
      expect(counts[maintHour]).toBeLessThan(counts[1]);
      expect(counts[maintHour]).toBeLessThan(counts[4]);
    }
  });
});
