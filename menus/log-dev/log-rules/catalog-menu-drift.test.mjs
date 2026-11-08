import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { endpointSpecs, ruleFilterSpecs, ruleWireFilterSpecs, ruleSetFilterSpecs, RULE_SORT_IDS, RULE_SET_SORT_IDS } from './src/endpoints';

const root = new URL('../../../', import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');
const catalog = source('apps/platform-api/src/modules/log-rules/domain/catalog-params.ts');
const coverage = source('apps/platform-api/src/modules/log-rules/domain/coverage-params.ts');
const array = (text, name) => {
  const match = text.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
  if (!match) throw new Error(`missing server declaration ${name}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
};

describe('logRules client/server declarations', () => {
  it.each([
    ['ruleSets', 'RULE_SET_PARAM_KEYS', catalog], ['ruleSetDetail', 'RULE_SET_DETAIL_PARAM_KEYS', catalog],
    ['rules', 'RULE_PARAM_KEYS', catalog], ['ruleDetail', 'RULE_DETAIL_PARAM_KEYS', catalog],
    ['catalogStatus', 'CATALOG_STATUS_PARAM_KEYS', catalog], ['coverage', 'COVERAGE_PARAM_KEYS', coverage],
    ['coverageSummary', 'COVERAGE_SUMMARY_PARAM_KEYS', coverage],
  ])('%s mirrors the exact server param keys and owning menu', (name, keys, text) => {
    const client = endpointSpecs.find(e => e.id === `logRules.${name}`);
    expect(client).toMatchObject({ menuId: 'log-rules', permission: 'platform:view', requiresScope: false, context: {}, mergeTimeDomain: false });
    expect(Object.keys(client.paramKeys).sort()).toEqual(array(text, keys).sort());
  });
  it('mirrors sort allow-lists and the filter wire fields/operators/presence semantics', () => {
    expect(RULE_SORT_IDS).toEqual(array(catalog, 'RULE_SORT_IDS'));
    expect(RULE_SET_SORT_IDS).toEqual(array(catalog, 'RULE_SET_SORT_IDS'));
    for (const [name, specs] of [['RULE_FILTER_SPECS', ruleWireFilterSpecs], ['RULE_SET_FILTER_SPECS', ruleSetFilterSpecs]]) {
      const block = catalog.split(`export const ${name} = {`)[1].split('} as const')[0];
      const serverFields = [...block.matchAll(/^  (\w+): \{ ops: (SCALAR_OPS|PRESENCE_OPS), multiple: (true|false), cell: '([^']+)'/gm)];
      expect(Object.keys(specs).sort()).toEqual(serverFields.map(m => m[1]).sort());
      for (const [, field, ops, multiple, cell] of serverFields) {
        expect(specs[field].ops).toEqual(ops === 'SCALAR_OPS' ? ['in', 'notIn'] : ['isEmpty', 'isNotEmpty']);
        expect(specs[field].multiple !== false).toBe(multiple === 'true');
        expect(specs[field].cell ?? 'scalar').toBe(cell);
      }
    }
    expect(ruleWireFilterSpecs.support.options.map(o => o.value)).toEqual(array(catalog, 'SUPPORTS'));
  });
  it('keeps the UI-only target filter separate from the server wire filters', () => {
    expect(ruleFilterSpecs).toEqual({ ...ruleWireFilterSpecs, targetCount: { kind: 'text', ops: ['contains'] } });
    expect(array(catalog, 'RULE_PARAM_KEYS')).toContain('targetQ');
  });
  it('matches the report-only server menu id without introducing a cross-menu model-list alias', () => {
    const menu = source('apps/platform-api/src/modules/log-rules/menu.ts');
    expect(menu).toContain("LOG_RULES_MENU_ID = 'log-rules'");
    expect(endpointSpecs.map(e => e.id)).toHaveLength(7);
    expect(source('packages/sdk/contract-schemas/scripts/endpoints.vitest.mjs')).toContain('duplicate endpoint id');
  });
});
