import { describe, expect, it } from 'vitest';
import { EQUIPMENT } from '../../world';
import { findJobByAnchor, jobsForEquipmentDay } from '../jobs';

const DAYS = ['2026-09-24', '2026-09-25'];

describe('job anchor is a RecordSequence', () => {
  it('is a unique decimal string per equipment and ascends with startedAt', () => {
    for (const equipment of EQUIPMENT.slice(0, 6)) {
      const jobs = DAYS.flatMap(day => jobsForEquipmentDay(equipment, day));
      expect(jobs.every(job => /^[1-9][0-9]*$/.test(job.anchor))).toBe(true);
      expect(new Set(jobs.map(job => job.anchor)).size).toBe(jobs.length);
      const byStart = [...jobs].sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0));
      for (let i = 1; i < byStart.length; i++) {
        expect(BigInt(byStart[i].anchor) > BigInt(byStart[i - 1].anchor)).toBe(true);
      }
    }
  });

  it('finds a job by (equipment, anchor) and returns null for a time string or an unknown sequence', () => {
    const equipment = EQUIPMENT[0];
    const job = jobsForEquipmentDay(equipment, DAYS[1])[5];
    expect(findJobByAnchor(equipment, job.anchor)).toBe(job);
    expect(findJobByAnchor(equipment, job.startedAt)).toBeNull();
    expect(findJobByAnchor(equipment, '999999999')).toBeNull();
    expect(findJobByAnchor(equipment, '')).toBeNull();
  });

  it('keeps the start time as the old time string', () => {
    for (const job of jobsForEquipmentDay(EQUIPMENT[0], DAYS[0])) {
      expect(job.startedAt).toMatch(/^2026-09-24T\d{2}:\d{2}:\d{2}$/);
    }
  });
});
