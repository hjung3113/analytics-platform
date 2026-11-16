import { describe, expect, it } from 'vitest';
import { HW_TIME_STEPPED_MESSAGES as S } from '../../../messages';
import { CATALOG_IDS, panelCatalog } from '../stepped';
import { manifests, panelDeclarations as exportedDeclarations } from '../../../index';
import { disabledReason, panelDeclarations, panelQueryIdentity, panelRunTarget, projectDisplayInputs, projectQueryInputs, workspacePanelContext, type PanelDeclaration } from '../panelDeclaration';

describe('panel declarations', () => {
  const context = workspacePanelContext({ step: 4, typeId: 'PM', motionId: 'Pump', moduleId: 'PM2', trend: null });
  it('declares exactly the catalog panels', () => {
    expect(Object.keys(panelDeclarations)).toEqual(CATALOG_IDS);
    expect(exportedDeclarations).toBe(panelDeclarations);
  });
  it('keeps every declaration within the S0 key, grain and identity contracts', () => {
    const declarations: readonly PanelDeclaration[] = Object.values(panelDeclarations);
    const pageKeys = manifests[0]!.pageKeys;
    const ids = declarations.map(panel => panel.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const panel of declarations) {
      const queryPage = panel.queryInputs.page?.map(input => input.key) ?? [];
      const displayPage = panel.displayInputs.page?.map(input => input.key) ?? [];
      expect(queryPage.filter(key => displayPage.includes(key))).toEqual([]);
      expect(panel.queryInputs.context?.filter(key => panel.displayInputs.context?.includes(key)) ?? []).toEqual([]);
      for (const key of [...queryPage, ...displayPage, ...panel.outputs.map(output => output.key)]) expect(pageKeys).toContain(key);
      expect(panel.grain).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      expect(panel.title.ko.trim()).not.toBe('');
      expect(panel.title.en.trim()).not.toBe('');
      expect(panel.endpoints.length).toBeGreaterThan(0);
      expect(panel).not.toHaveProperty('permission');
      expect(panel).not.toHaveProperty('requires');
    }
  });
  it('derives default availability from missing required page-key labels', () => {
    const declaration = { id: 'sample', title: S.heatmap, endpoints: [], grain: 'matrixStat',
      queryInputs: { page: [{ key: 'moduleType', required: true }, { key: 'row' }] }, displayInputs: {}, outputs: [] } as const;
    const labels = { moduleType: { ko: 'Module 타입', en: 'Module type' } };
    expect(disabledReason(declaration, {}, labels)).toEqual(labels.moduleType);
    expect(disabledReason(declaration, { moduleType: 'PM' }, labels)).toBeUndefined();
    expect(disabledReason(declaration, { moduleType: '' }, labels)).toEqual(labels.moduleType);
  });
  it('projects only declared query and display inputs', () => {
    const state = { ...context, module: ['PM2'], unrelated: 'ignored' };
    expect(projectQueryInputs(panelDeclarations.heatmap, state)).toEqual({ moduleType: 'PM' });
    expect(projectDisplayInputs(panelDeclarations.heatmap, state)).toEqual({ module: ['PM2'] });
  });
  it('keeps query identity for display changes and changes it for query changes', () => {
    const identity = panelQueryIdentity(panelDeclarations.trend, context);
    expect(panelQueryIdentity(panelDeclarations.trend, { ...context, motion: ['Pump'] })).toBe(identity);
    expect(panelQueryIdentity(panelDeclarations.trend, { ...context, trend: 'PM1/Pump' })).not.toBe(identity);
  });
  it('canonicalizes object key order without changing array order', () => {
    const declaration = { queryInputs: { context: ['selection'] } } as const;
    expect(panelQueryIdentity(declaration, { selection: { a: 1, b: 2 } })).toBe(panelQueryIdentity(declaration, { selection: { b: 2, a: 1 } }));
    expect(panelQueryIdentity(declaration, { selection: ['a', 'b'] })).not.toBe(panelQueryIdentity(declaration, { selection: ['b', 'a'] }));
  });
  // Real GlobalContext fields, not capability names: `time` is from/to (#2431 review C1).
  it.each(['scopeId', 'from', 'to', 'roomNames', 'condition', 'selection'] as const)('includes the real Context field %s in identity', key => {
    const before = { ...context, [key]: 'before' };
    const after = { ...context, [key]: 'after' };
    for (const declaration of Object.values(panelDeclarations)) {
      expect(panelQueryIdentity(declaration, before)).not.toBe(panelQueryIdentity(declaration, after));
    }
  });
  it('includes membershipBasis only while a condition applies, and ignores unapplied fields', () => {
    const withCondition = { ...context, condition: { key: 'PRC' }, membershipBasis: 'endEvent' };
    expect(panelQueryIdentity(panelDeclarations.trend, { ...withCondition, membershipBasis: 'startEvent' })).not.toBe(panelQueryIdentity(panelDeclarations.trend, withCondition));
    const noCondition = { ...context, condition: null, membershipBasis: 'endEvent' };
    expect(panelQueryIdentity(panelDeclarations.trend, { ...noCondition, membershipBasis: 'startEvent' })).toBe(panelQueryIdentity(panelDeclarations.trend, noCondition));
    expect(panelQueryIdentity(panelDeclarations.trend, { ...context, lotIds: ['L1'] })).toBe(panelQueryIdentity(panelDeclarations.trend, context));
  });
  it.each([1, 2, 3, 4] as const)('preserves catalog availability at step %s', step => {
    const args = { step, typeId: step > 1 ? 'PM' : null, motionId: step > 2 ? 'Pump' : null, moduleId: step === 4 ? 'PM2' : null, trend: null };
    const state = workspacePanelContext(args);
    const expected = { heatmap: step > 1 ? undefined : S.needsType, trend: step === 4 ? undefined : S.needsPoint,
      scatter: step === 4 ? undefined : S.needsPoint, distribution: step === 4 ? undefined : S.needsPoint, motionTable: step === 4 ? undefined : S.needsModule,
      moduleMotions: step === 4 ? undefined : S.needsStep4, table: undefined };
    for (const panel of panelCatalog(args)) {
      const id = panel.id as keyof typeof panelDeclarations;
      expect(disabledReason(panelDeclarations[id], state)).toEqual(expected[id]);
      expect(panel.disabledReason).toEqual(expected[id]);
    }
  });
  it.each([
    ['PM1/Pump', 'PM2', 'Pump', 'PM1/Pump', 'PM2/Pump'],
    [null, 'PM2', 'Pump', 'PM2/Pump', 'PM2/Pump'],
    ['PM1/Pump', null, null, 'PM1/Pump', 'PM1/Pump'],
    [null, null, null, null, null],
  ])('preserves C1 target precedence for %s and %s/%s', (trend, moduleId, motionId, trendTarget, scatterTarget) => {
    const state = workspacePanelContext({ step: 4, typeId: 'PM', trend, moduleId, motionId });
    expect(panelRunTarget('trend', projectQueryInputs(panelDeclarations.trend, state))).toBe(trendTarget);
    expect(panelRunTarget('scatter', projectQueryInputs(panelDeclarations.scatter, state))).toBe(scatterTarget);
  });
  it('permits explicit trend without drill and preserves the legacy module-only gate', () => {
    for (const args of [{ moduleId: null, trend: 'PM1/Pump' }, { moduleId: 'PM2', trend: null }]) {
      const state = workspacePanelContext({ step: 2, typeId: 'PM', motionId: null, ...args });
      expect(disabledReason(panelDeclarations.trend, state)).toBeUndefined();
      expect(disabledReason(panelDeclarations.scatter, state)).toBeUndefined();
    }
  });
  it('declares distribution with scatter query inputs, display-only checks and run grain', () => {
    const declaration = panelDeclarations.distribution;
    expect(declaration).toMatchObject({ id: 'distribution', title: { ko: '분포', en: 'Distribution' }, grain: 'run', outputs: [], endpoints: ['hwTime.distribution'] });
    expect(declaration.queryInputs).toEqual(panelDeclarations.scatter.queryInputs);
    expect(declaration.displayInputs).toEqual(panelDeclarations.scatter.displayInputs);
    expect(disabledReason(declaration, {})).toEqual(S.needsPoint);
    expect(disabledReason(declaration, { trend: 'PM2/Pump' })).toBeUndefined();
    expect(disabledReason(declaration, context)).toBeUndefined();
    const identity = panelQueryIdentity(declaration, context);
    expect(panelQueryIdentity(declaration, { ...context, module: [], motion: [] })).toBe(identity);
    expect(panelQueryIdentity(declaration, { ...context, drillMotion: 'Vent' })).not.toBe(identity);
    expect(panelRunTarget('scatter', projectQueryInputs(declaration, context))).toBe('PM2/Pump');
    expect(panelRunTarget('scatter', { ...context, trend: 'PM1/Vent' })).toBe('PM2/Pump');
  });
});
