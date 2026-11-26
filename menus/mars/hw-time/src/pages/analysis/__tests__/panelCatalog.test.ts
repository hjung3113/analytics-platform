import { describe, expect, it } from 'vitest';
import { panelCatalog } from '../stepped';
import { HW_TIME_NEW_PANEL_MESSAGES as N, HW_TIME_STEPPED_MESSAGES as S } from '../../../messages';

describe('HW Time catalog compatibility (#2433)', () => {
  it.each([1, 2, 3, 4] as const)('pins ids, titles and reasons at step %s', step => {
    const rows = panelCatalog({ step, typeId: step > 1 ? 'PM' : null, moduleId: step === 4 ? 'PM2' : null, trend: null });
    const titles = [S.heatmap, S.trend, S.scatter, S.distributionCatalog, S.motionTable,
      { ko: S.moduleMotions.ko.replace('{module}', step === 4 ? 'PM2' : 'Module'), en: S.moduleMotions.en.replace('{module}', step === 4 ? 'PM2' : 'Module') },
      S.table, N.donut, N.pareto, N.equipmentDays, N.boundHistory];
    expect(rows.map(row => row.id)).toEqual(['heatmap', 'trend', 'scatter', 'distribution', 'motionTable', 'moduleMotions', 'table', 'donut', 'pareto', 'equipmentDays', 'boundHistory']);
    expect(rows.map(row => row.title)).toEqual(titles);
    expect(rows.map(row => row.disabledReason)).toEqual([step > 1 ? undefined : S.needsType,
      ...Array.from({ length: 3 }, () => step === 4 ? undefined : S.needsPoint), step === 4 ? undefined : S.needsModule,
      step === 4 ? undefined : S.needsStep4, undefined, undefined, undefined, undefined, undefined]);
  });
});

describe('HW Time «패널 추가» categories, kinds and descriptions (#2744)', () => {
  const rows = panelCatalog({ step: 4, typeId: 'PM', moduleId: 'PM2', trend: null });
  const byId = Object.fromEntries(rows.map(row => [row.id, row]));
  it.each([
    ['heatmap', 'comparison', 'heatmap'], ['moduleMotions', 'comparison', 'bar'], ['trend', 'trend', 'line'], ['equipmentDays', 'trend', 'heatmap'],
    ['scatter', 'distribution', 'scatter'], ['distribution', 'distribution', 'histogram'], ['motionTable', 'records', 'table'], ['table', 'records', 'table'],
    ['boundHistory', 'records', 'history'], ['donut', 'composition', 'donut'], ['pareto', 'composition', 'pareto'],
  ] as const)('%s is in %s as %s with a description', (id, category, kind) => {
    expect(byId[id]).toMatchObject({ category: { id: category }, kind });
    expect(byId[id]!.description?.ko).toMatch(/\S/);
    expect(byId[id]!.description?.en).toMatch(/\S/);
  });
  it('uses the agreed titles and wording', () => {
    expect(byId.heatmap!.category!.title).toEqual({ ko: '비교', en: 'Comparison' });
    expect(byId.boundHistory!.category!.title).toEqual({ ko: '표·이력', en: 'Tables and history' });
    expect(byId.pareto!.description).toEqual({ ko: '상한 초과가 많은 항목부터 건수와 누적 비율을 표시합니다.', en: 'Ranks upper-limit exceedances and shows cumulative share.' });
  });
});
