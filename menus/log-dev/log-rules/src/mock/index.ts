import { datasetsMock } from './datasets';
export { datasetActionsMock as logRulesActionsMock, stageDatasetBaseline, stageDatasetSuiteRun } from './datasets';
import { filterRows, validateFilters, type ColumnFilterSpec } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import {
  RULE_SET_SORT_IDS, RULE_SORT_IDS, SUPPORTS, catalogStatusEndpoint, coverageEndpoint, coverageSummaryEndpoint, modelOptionsEndpoint, softwareOptionsEndpoint,
  isCatalogKey, isUuid, ruleDetailEndpoint, ruleWireFilterSpecs, ruleSetDetailEndpoint, ruleSetFilterSpecs, ruleSetsEndpoint, rulesEndpoint,
  type CatalogParams, type RuleParams,
} from '../endpoints';
import { FIXTURE_MODELS, fixtureCoverage, fixtureHistories, fixtureRows, fixtureRules, fixtureRuleSets, fixtureSoftware, fixtureStatus } from './fixtures';
export { FIXTURE_MODELS } from './fixtures';

const compare = (a: string | number, b: string | number) => a < b ? -1 : a > b ? 1 : 0;
const unsafe = (s: string) => s.includes('\u0000') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
function listMessage(p: RuleParams, sorts: readonly string[], specs: Readonly<Record<string, ColumnFilterSpec>>): string | null {
  for (const value of [p.q, p.targetQ]) if (value != null && (typeof value !== 'string' || value.length > 200 || unsafe(value))) return 'search must be a string of at most 200 characters or null';
  if (!Number.isInteger(p.page ?? 0) || (p.page ?? 0) < 0 || (p.page ?? 0) > 1_000_000) return 'page must be a non-negative integer (0-based)';
  if (!Number.isInteger(p.pageSize ?? 50) || (p.pageSize ?? 50) < 1 || (p.pageSize ?? 50) > 200) return 'pageSize must be an integer from 1 to 200';
  if (!Array.isArray(p.sorting ?? []) || (p.sorting?.length ?? 0) > 3) return 'sorting must be a list of at most 3 sort keys';
  const seen = new Set<string>();
  for (const s of p.sorting ?? []) {
    if (!s || Object.keys(s).some(k => k !== 'id' && k !== 'desc') || !sorts.includes(s.id) || typeof s.desc !== 'boolean' || seen.has(s.id)) return 'sorting is not supported';
    seen.add(s.id);
  }
  if (!Array.isArray(p.filters ?? [])) return 'filters must be a list';
  for (const f of p.filters ?? []) if (!f || Object.keys(f).some(k => !['id', 'op', 'value'].includes(k))) return 'invalid filter';
  if (!validateFilters(p.filters ?? [], specs).ok) return 'invalid filter';
  for (const f of p.filters ?? []) {
    if (f.op !== 'in' && f.op !== 'notIn') continue;
    if (f.value.length > 200 || !f.value.every(v => typeof v === 'string' && v.trim().length > 0 && v.length <= 200 && !unsafe(v))) return 'invalid filter values';
    if (f.id === 'support' && !f.value.every(v => (SUPPORTS as readonly string[]).includes(v))) return 'invalid support';
  }
  return null;
}
function page<T>(rows: T[], p: CatalogParams, cell: (r: T, id: string) => string | number) {
  const sorting = p.sorting?.length ? p.sorting : [{ id: 'ruleSetKey', desc: false }];
  const sorted = [...rows].sort((a, b) => {
    for (const s of sorting) { const c = compare(cell(a, s.id), cell(b, s.id)); if (c) return s.desc ? -c : c; }
    return compare(cell(a, 'ruleSetKey'), cell(b, 'ruleSetKey')) || compare(cell(a, 'ruleKey'), cell(b, 'ruleKey'));
  });
  const start = (p.page ?? 0) * (p.pageSize ?? 50);
  return { rows: sorted.slice(start, start + (p.pageSize ?? 50)), total: rows.length };
}
const catalog = defineMockEndpoint(catalogStatusEndpoint, { mart: false, handle: () => fixtureStatus });
const sets = defineMockEndpoint(ruleSetsEndpoint, { mart: false,
  validate: ({ params }) => listMessage(params, RULE_SET_SORT_IDS, ruleSetFilterSpecs),
  handle: ({ params }) => {
    const rows = filterRows(fixtureRuleSets.filter(r => !params.q || r.ruleSetKey.toLowerCase().includes(params.q.toLowerCase())), params.filters ?? [], (r, id) => r[id as 'ruleSetKey'], { specs: ruleSetFilterSpecs });
    return page(rows, params, (r, id) => id === 'ruleCount' ? r.supportCounts.total : id === 'reportedAt' ? r.lastReportedAt : r[id as 'ruleSetKey'] ?? '');
  },
});
const history = defineMockEndpoint(ruleSetDetailEndpoint, { mart: false,
  validate: ({ params }) => isCatalogKey(params.ruleSetKey ?? '') ? null : 'invalid ruleSetKey',
  handle: ({ params }) => fixtureHistories.find(r => r.ruleSetKey === params.ruleSetKey) ?? null,
});
const rules = defineMockEndpoint(rulesEndpoint, { mart: false,
  validate: ({ params }) => listMessage(params, RULE_SORT_IDS, ruleWireFilterSpecs),
  handle: ({ params }) => {
    const rows = fixtureRows.filter(r => (!params.q || [r.ruleKey, r.title, r.summary].some(v => v.toLowerCase().includes(params.q!.toLowerCase())))
      && (!params.targetQ || fixtureRules.find(d => d.ruleSetKey === r.ruleSetKey && d.ruleKey === r.ruleKey)!.targets.some(t => t.target.toLowerCase().includes(params.targetQ!.toLowerCase()))));
    const filtered = filterRows(rows, params.filters ?? [], (r, id) => id === 'scope' ? r.scope === null ? null : 'declared' : id === 'requirementIds' ? r.requirementIdCount ? 'declared' : null : r[id as 'support'], { specs: ruleWireFilterSpecs });
    return page(filtered, params, (r, id) => id === 'support' ? SUPPORTS.indexOf(r.support) : r[id as 'ruleKey'] ?? '');
  },
});
const detail = defineMockEndpoint(ruleDetailEndpoint, { mart: false,
  validate: ({ params }) => isCatalogKey(params.ruleSetKey ?? '') && isCatalogKey(params.ruleKey ?? '') ? null : 'invalid rule identifier',
  handle: ({ params }) => fixtureRules.find(r => r.ruleSetKey === params.ruleSetKey && r.ruleKey === params.ruleKey) ?? null,
});
const coverage = defineMockEndpoint(coverageEndpoint, { mart: false,
  validate: ({ params }) => !isUuid(params.modelId ?? '') || (params.softwareId != null && !isUuid(params.softwareId)) ? 'modelId/softwareId must be UUIDs' : listMessage(params, [], {}),
  handle: ({ params }) => {
    const modelId = params.modelId.toLowerCase();
    if (params.softwareId && !fixtureSoftware[modelId]?.includes(params.softwareId.toLowerCase())) return null;
    const data = fixtureCoverage(modelId);
    if (!data?.computable) return data;
    const start = (params.page ?? 0) * (params.pageSize ?? 50);
    return { ...data, page: params.page ?? 0, pageSize: params.pageSize ?? 50, rows: data.rows.slice(start, start + (params.pageSize ?? 50)) };
  },
});
const summary = defineMockEndpoint(coverageSummaryEndpoint, { mart: false,
  validate: ({ params }) => !Array.isArray(params.modelIds) || params.modelIds.length < 1 || params.modelIds.length > 50 || !params.modelIds.every(id => typeof id === 'string' && isUuid(id)) ? 'modelIds must hold 1 to 50 UUIDs' : null,
  handle: ({ params }) => ({ rows: [...new Set(params.modelIds.map(id => id.toLowerCase()))].map(modelId => {
    const data = fixtureCoverage(modelId);
    return data?.computable ? { modelId, computable: true as const, counts: data.counts, coverageDigest: data.coverageDigest } : { modelId, computable: false as const, reason: data?.reason ?? 'model_unknown' as const };
  }) }),
});
// Names and codes of the four fixture models as the knowledge menu's mock seeds them (A-100 … B-20; menus may not import each other).
const MODELS: Record<string, { code: string; name: string }> = {
  [FIXTURE_MODELS.mixed]: { code: 'A-100', name: 'Alpha 100' }, [FIXTURE_MODELS.noSpec]: { code: 'A-200', name: 'Alpha 200' },
  [FIXTURE_MODELS.noIds]: { code: 'B-10', name: 'Beta 10' }, [FIXTURE_MODELS.full]: { code: 'B-20', name: 'Beta 20' },
};
const modelOptions = defineMockEndpoint(modelOptionsEndpoint, { mart: false,
  validate: ({ params }) => params.q != null && (typeof params.q !== 'string' || params.q.length > 200 || unsafe(params.q)) ? 'search must be a string of at most 200 characters or null'
    : !Number.isInteger(params.page ?? 0) || (params.page ?? 0) < 0 ? 'page must be a non-negative integer (0-based)'
    : !Number.isInteger(params.pageSize ?? 20) || (params.pageSize ?? 20) < 1 || (params.pageSize ?? 20) > 200 ? 'pageSize must be an integer from 1 to 200' : null,
  handle: ({ params }) => {
    const all = Object.entries(MODELS).map(([id, m]) => ({ id, code: m.code, name: m.name, vendorName: '합성 fixture', active: true }))
      .filter(m => !params.q || `${m.code} ${m.name}`.toLowerCase().includes(params.q.trim().toLowerCase()));
    const size = params.pageSize ?? 20, at = params.page ?? 0;
    return { rows: all.slice(at * size, (at + 1) * size), total: all.length, page: at, pageSize: size };
  },
});
const softwareOptions = defineMockEndpoint(softwareOptionsEndpoint, { mart: false,
  validate: ({ params }) => isUuid(params.modelId ?? '') ? null : 'modelId must be a UUID',
  handle: ({ params }) => ({ rows: (fixtureSoftware[params.modelId.toLowerCase()] ?? []).map((id, i) => ({ id, versionLabel: `${i + 1}.0`, name: '합성 fixture', active: true })) }),
});
export const logRulesMock: readonly AnyMockEndpoint[] = [sets, history, rules, detail, catalog, coverage, summary, modelOptions, softwareOptions, ...datasetsMock];

export { logRulesWriteSamples } from './write-samples';
