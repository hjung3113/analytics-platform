import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { JudgementSummary, worstJudgement } from './JudgementSummary';
import type { HtmJudgement } from '../endpoints';
const unjudgeable: HtmJudgement = { value: 2, lower: null, upper: null, status: 'unjudgeable', reason: 'recipe-unsplit' };
describe('server judgement presentation', () => {
  it('uses the common unjudgeable wording with its reason', () => {
    const html = renderToStaticMarkup(<I18nProvider><JudgementSummary block={{ series: [], totals: { values: {}, total: 2 }, rows: [{ id: 'MEM-PHOTO-0103', equipmentId: 'MEM-PHOTO-0103', values: { PM1: 2 }, total: 2, judgements: { PM1: unjudgeable } }] }} /></I18nProvider>);
    expect(html).toContain('판정:');
    expect(html).toContain('Recipe');
  });
  it('selects worst server status, never derives status from values or bounds', () => {
    const under: HtmJudgement = { value: 99, lower: 1, upper: 2, status: 'under' };
    expect(worstJudgement({ a: unjudgeable, b: under })?.status).toBe('under');
    expect(worstJudgement({ a: under, b: { ...under, status: 'over' } })?.status).toBe('over');
    expect(worstJudgement(undefined)).toBeUndefined();
  });
});
