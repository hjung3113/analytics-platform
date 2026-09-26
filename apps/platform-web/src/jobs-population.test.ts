import { describe, expect, it } from 'vitest';
import { computeKpis, trendBuckets } from './pages/analytics/productivityData';
import { percentile, population } from './pages/analytics/cycleData';
import { cycleMinutes, EQUIPMENT, jobsInPeriod } from '@ap/mock-server';
import { emptyGlobal } from '@ap/contracts';

const FROM = '2026-09-20T00:00:00';
const TO = '2026-09-25T00:00:00';
const DAY_FROM = '2026-09-25T09:00:00';
const DAY_TO = '2026-09-26T09:00:00';

function ich(room?: string) {
  return EQUIPMENT.filter(e => e.site === 'ICH' && (!room || e.room === room)).slice(0, room ? 4 : 6);
}

describe('screen 11 and 12 share one job population', () => {
  it('matches completed counts for several equipment sets and periods', () => {
    const cases = [
      { equipment: ich('PH-101'), from: FROM, to: TO },
      { equipment: ich('ET-102').slice(0, 1), from: FROM, to: TO },
      { equipment: ich(), from: DAY_FROM, to: DAY_TO },
    ];
    for (const { equipment, from, to } of cases) {
      const jobs = jobsInPeriod(equipment, from, to);
      const kpi = computeKpis(equipment, from, to);
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
    const equipment = ich('PH-101').slice(0, 2);
    const kpi = computeKpis(equipment, FROM, TO);
    const v4 = population(equipment, { ...emptyGlobal, from: FROM, to: TO }, '4');
    const v3 = population(equipment, { ...emptyGlobal, from: FROM, to: TO }, '3');
    expect(percentile(v4.map(row => row.cycleMin), 0.5)).toBe(kpi.cycle.p50);
    expect(percentile(v4.map(row => row.cycleMin), 0.95)).toBe(kpi.cycle.p95);
    expect(percentile(v3.map(row => row.cycleMin), 0.5)).not.toBe(kpi.cycle.p50);
    expect(v4.every((row, i) => row.cycleMin >= v3[i].cycleMin)).toBe(true);
  });

  it('sums the same jobs at hour, day, and week', () => {
    const equipment = ich('PH-101').slice(0, 3);
    const kpi = computeKpis(equipment, FROM, TO);
    for (const grain of ['hour', 'day', 'week'] as const) {
      const total = trendBuckets(equipment, FROM, TO, grain).reduce((sum, bucket) => sum + (bucket.jobs ?? 0), 0);
      expect(total).toBe(kpi.throughput.jobs);
    }
  });

  it('uses v4 minutes only when the version is 4', () => {
    const equipment = ich().slice(0, 1);
    const [job] = jobsInPeriod(equipment, DAY_FROM, DAY_TO);
    expect(cycleMinutes(job, '4')).toBe(job.cycleMinV4);
    expect(cycleMinutes(job, '3')).toBe(job.cycleMinV3);
    expect(job.cycleMinV4).toBeGreaterThan(job.cycleMinV3);
    expect(job.anchor < '2026-09-26T08:00:00').toBe(true);
  });
});
