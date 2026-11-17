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
