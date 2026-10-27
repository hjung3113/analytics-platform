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

  it.each(['0', '1', '100000000001', '999999999999', '9999999999999999999', '3652059073', '3652059000', '2456001'])(
    'answers null for the unknown or out-of-range sequence %s without throwing',
    anchor => {
      expect(() => findJobByAnchor(EQUIPMENT[0], anchor)).not.toThrow();
      expect(findJobByAnchor(EQUIPMENT[0], anchor)).toBeNull();
    },
  );

  it('answers null for a rank past the 72 slots of a day and for a day past 9999-12-31', () => {
    const job = jobsForEquipmentDay(EQUIPMENT[0], DAYS[0])[0];
    expect(findJobByAnchor(EQUIPMENT[0], String(BigInt(job.anchor) + 1000n - BigInt(job.anchor) % 1000n + 73n))).toBeNull();
    const last = jobsForEquipmentDay(EQUIPMENT[0], '9999-12-31')[0];
    expect(findJobByAnchor(EQUIPMENT[0], last.anchor)).toBe(last);
    expect(findJobByAnchor(EQUIPMENT[0], String(BigInt(last.anchor) + 1000n))).toBeNull();
  });

  it.each(['1999-06-15', '2019-12-31', '2020-01-01', '0100-01-01', '9999-12-31'])('round-trips every anchor of %s', day => {
    const equipment = EQUIPMENT[0];
    const jobs = jobsForEquipmentDay(equipment, day);
    expect(jobs.every(job => /^[1-9][0-9]{0,12}$/.test(job.anchor))).toBe(true);
    for (const job of jobs) expect(findJobByAnchor(equipment, job.anchor)).toBe(job);
    expect(jobs[0].startedAt.startsWith(day)).toBe(true);
  });

  it('keeps the start time as the old time string', () => {
    for (const job of jobsForEquipmentDay(EQUIPMENT[0], DAYS[0])) {
      expect(job.startedAt).toMatch(/^2026-09-24T\d{2}:\d{2}:\d{2}$/);
    }
  });
});
