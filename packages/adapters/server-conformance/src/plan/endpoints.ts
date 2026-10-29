import { CONTEXT_FIELDS, emptyGlobal, missingRequiredContext, type GlobalContext, type MenuQuery } from '@ap/contracts';
import type { ConformanceCheck, PortMethod, ServerConformanceHarness } from '../types';
import { CONTEXT_KEYS, SET_KEYS, UNKNOWN_ENDPOINT, UNKNOWN_KEY, assessmentProblem, baseRequest, describeResponse, expectOutcome, missingEnvelopeKey, sameKinds, trustProblem } from '../helpers';
import { planActionChecks } from './actions';
import { planConditionChecks } from './conditions';
import { planPortChecks } from './ports';
import { SAVED_VIEW_PORT_METHODS } from './ports/saved-views';
import { planSelectionPortChecks } from './ports/selection-ports';

/** The checks one harness implies, derived synchronously from the declarations (stable test names). */
export function planServerConformance(harness: ServerConformanceHarness): ConformanceCheck[] {
  const send = (req: unknown) => () => harness.adapter.menuQuery(req as MenuQuery);
  const checks: ConformanceCheck[] = [{
    id: 'unknown endpoint → error',
    mode: 'granted',
    uses: ['menuQuery'],
    run: expectOutcome(send({ endpoint: UNKNOWN_ENDPOINT, context: {}, params: {} }), 'error', 'an unregistered endpoint id'),
  }];

  for (const c of harness.cases) {
    const caseStart = checks.length;
    const { spec } = c;
    const base = baseRequest(harness, c);
    const applied = Object.keys(base.context) as (keyof GlobalContext)[];
    const name = (what: string) => `${spec.id} · ${what}`;

    const noSample = missingRequiredContext(spec.requiredContext ?? [], base.context).length > 0;
    checks.push({
      id: name('granted request succeeds with exactly the declared assessment kinds'),
      mode: 'granted',
      uses: ['menuQuery'],
      run: async () => {
        const r = await harness.adapter.menuQuery(base);
        if (r.outcome !== 'ok' && r.outcome !== 'empty') return `expected ok or empty, got ${describeResponse(r)}`;
        const missing = missingEnvelopeKey(r, 'assessments');
        if (missing) return missing;
        if (SET_KEYS.some(key => Array.isArray(base.context[key]) && base.context[key]!.length === 0)) {
          const missingTrust = missingEnvelopeKey(r, 'trust');
          if (missingTrust) return missingTrust;
          if (r.outcome !== 'empty' || r.assessments.length > 0 || r.trust !== null) return 'an explicit empty set is answered without reading a source (06 §19): empty, no assessments, null trust';
          return null;
        }
        if (!sameKinds(r.assessments, spec.kinds)) {
          return `assessments [${r.assessments.map(a => a.kind).join(', ')}] ≠ declared [${spec.kinds.join(', ')}]`;
        }
        return null;
      },
    });
    checks.push({
      id: name('granted response assessments are well-formed (06 §19)'),
      mode: 'granted',
      uses: ['menuQuery'],
      run: async () => {
        const r = await harness.adapter.menuQuery(base);
        if (r.outcome !== 'ok' && r.outcome !== 'empty') return `expected ok or empty, got ${describeResponse(r)}`;
        const missing = missingEnvelopeKey(r, 'assessments');
        if (missing) return missing;
        return assessmentProblem(r.assessments, r.outcome);
      },
    });
    checks.push({
      id: name('granted response trust is null or complete (06 §18)'),
      mode: 'granted',
      uses: ['menuQuery'],
      run: async () => {
        const r = await harness.adapter.menuQuery(base);
        if (r.outcome !== 'ok' && r.outcome !== 'empty') return `expected ok or empty, got ${describeResponse(r)}`;
        const missing = missingEnvelopeKey(r, 'trust');
        if (missing) return missing;
        return trustProblem(r.trust);
      },
    });
    checks.push({
      id: name('unknown top-level request key → error'),
      mode: 'granted',
      uses: ['menuQuery'],
      run: expectOutcome(send({ ...base, permission: spec.permission }), 'error', 'the client must not be able to send permission or any other extra key'),
    });
    checks.push({
      id: name('unknown params key → error'),
      mode: 'granted',
      uses: ['menuQuery'],
      run: expectOutcome(send({ ...base, params: { ...c.params, [UNKNOWN_KEY]: 1 } }), 'error', 'params outside paramKeys'),
    });

    // Every declared key is its own check: a server that validates only a sampled key must not pass (#146 review).
    for (const key of CONTEXT_KEYS.filter(k => !applied.includes(k))) {
      checks.push({
        id: name(`non-applied Context key ${key} → error`),
        mode: 'granted',
        uses: ['menuQuery'],
        run: expectOutcome(send({ ...base, context: { ...base.context, [key]: emptyGlobal[key] } }), 'error', 'a key the endpoint does not apply (Q3)'),
      });
    }
    for (const key of spec.requiredContext ?? []) {
      for (const mutation of ['null', 'omitted'] as const) {
        const context = { ...base.context };
        for (const field of CONTEXT_FIELDS[key]) {
          if (mutation === 'omitted') delete context[field];
          else context[field] = null;
        }
        checks.push({ id: name(`required ${key} ${mutation} → error`), mode: 'granted', uses: ['menuQuery'],
          run: expectOutcome(send({ ...base, context }), 'error', 'a required Context item must be present') });
      }
    }
    for (const key of applied) {
      const context = { ...base.context };
      delete context[key];
      checks.push({
        id: name(`missing applied Context key ${key} → error`),
        mode: 'granted',
        uses: ['menuQuery'],
        run: expectOutcome(send({ ...base, context }), 'error', 'an applied key absent from the request (Q9)'),
      });
    }
    if (spec.context.time === 'apply') {
      checks.push({
        id: name('time applied with a null from → error'),
        mode: 'granted',
        uses: ['menuQuery'],
        run: expectOutcome(send({ ...base, context: { ...base.context, from: null } }), 'error', 'an applied period must be absolute'),
      });
    }
    if (spec.context.metric === 'apply') {
      checks.push({
        id: name('metricVersion without metricId → error'),
        mode: 'granted',
        uses: ['menuQuery'],
        run: expectOutcome(send({ ...base, context: { ...base.context, metricId: null, metricVersion: '1' } }), 'error', 'the metric pair travels together (06 §6.1)'),
      });
    }
    if (spec.requiresScope) {
      checks.push({
        id: name('a site without a grant → forbidden'),
        mode: 'granted',
        uses: ['menuQuery'],
        needsSites: true,
        run: expectOutcome(send({ ...base, context: { ...base.context, scopeId: harness.foreignScopeId } }), 'forbidden', 'Scope is re-validated per request'),
      });
      checks.push({
        id: name('a null Scope → forbidden'),
        mode: 'granted',
        uses: ['menuQuery'],
        needsSites: true,
        run: expectOutcome(send({ ...base, context: { ...base.context, scopeId: null } }), 'forbidden', 'a Scope-requiring endpoint has no site to read'),
      });
    }
    for (const emptySet of SET_KEYS.filter(key => applied.includes(key))) {
      checks.push({
        id: name(`explicit empty ${emptySet}: [] → empty with no assessments and no trust`),
        mode: 'granted',
        uses: ['menuQuery'],
        run: async () => {
          const r = await harness.adapter.menuQuery({ ...base, context: { ...base.context, [emptySet]: [] } });
          if (r.outcome !== 'empty') return `expected empty, got ${describeResponse(r)}`;
          const missing = missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust');
          if (missing) return missing;
          if (r.assessments.length > 0 || r.trust !== null) return 'an explicit empty set is answered without reading a source (06 §19): no assessments, null trust';
          return null;
        },
      });
    }
    if (spec.limits?.maxRows === undefined && c.oversizeParams) {
      // A sample for a cap the endpoint does not declare is a harness mistake (wrong endpoint, or a cap assumed but missing).
      checks.push({
        id: name('oversizeParams given but the endpoint declares no maxRows'),
        mode: 'granted',
        uses: ['menuQuery'],
        run: async () => 'the case carries an oversize sample, but the declaration has no limits.maxRows to judge it against',
      });
    }
    if (spec.limits?.maxRows !== undefined) {
      if (c.oversizeParams) {
        checks.push({
          id: name('oversize result over the declared maxRows → too_large with no data'),
          mode: 'granted',
          uses: ['menuQuery'],
          run: async () => {
            const r = await harness.adapter.menuQuery({ ...base, params: c.oversizeParams! });
            if (r.outcome !== 'too_large') {
              return `expected too_large over the declared maxRows ${spec.limits!.maxRows}, got ${describeResponse(r)}`;
            }
            if (r.data !== null) return 'a too_large answer carries no data';
            return null;
          },
        });
      } else {
        // Visible not-covered entry (#175 review P2-3): the declaration exists, so the gap must not vanish — the
        // vitest suite reports it as `it.skip` and the plan/run list it, instead of silently skipping the rule.
        checks.push({
          id: name('declares maxRows but has no oversizeParams sample — oversize check not run'),
          mode: 'skipped',
          uses: ['menuQuery'],
          run: async () => null, // never called: skipped checks are filtered out of every run
        });
      }
    }
    checks.push({
      id: name(`without ${spec.permission} → forbidden`),
      mode: 'permission',
      uses: ['menuQuery'],
      run: () => harness.withoutPermission(spec.permission, expectOutcome(send(base), 'forbidden', 'the endpoint permission is re-checked per request')),
    });
    // A Scope-requiring endpoint sends `context.scopeId` in every request, so each of its checks needs a granted site.
    if (spec.requiresScope) for (const check of checks.slice(caseStart)) check.needsSites = true;
    if (noSample) {
      for (const check of checks.slice(caseStart)) {
        check.mode = 'skipped';
        check.id += ' — required Context: no valid sample';
      }
    }
  }

  return declareGaps(harness, [...checks, ...planPortChecks(harness), ...planActionChecks(harness), ...planConditionChecks(harness), ...planSelectionPortChecks(harness)]);
}

/**
 * Applies the harness's declared gaps (#674): a check calling an unimplemented method, or needing a site on a server
 * with no site grants, is planned as skipped and says why in its id. A check already skipped for want of a sample
 * still names the unimplemented methods, so the readiness table shows the port gap rather than only a missing sample.
 */
function declareGaps(harness: ServerConformanceHarness, checks: ConformanceCheck[]): ConformanceCheck[] {
  const implemented = harness.implemented ? new Set<PortMethod>(harness.implemented) : null;
  // Saved-view uses name `SavedViewStore` members, which the `PlatformAdapter` list `implemented` cannot gate;
  // the saved-view sample's presence gates them instead (#1131).
  const savedViewUses = new Set<string>(SAVED_VIEW_PORT_METHODS);
  for (const check of checks) {
    // Every check declares the ports it calls where it is defined; an untagged one would dodge `implemented`.
    if (!check.uses?.length) throw new Error(`conformance check declares no port methods (uses): ${check.id}`);
    const missing = implemented
      ? (check.uses ?? []).filter(method => !savedViewUses.has(method) && !implemented.has(method as PortMethod))
      : [];
    if (missing.length > 0) {
      check.mode = 'skipped';
      check.id += ` — not implemented: ${missing.join(', ')}`;
    } else if (check.mode !== 'skipped' && harness.siteGrants === false && check.needsSites) {
      check.mode = 'skipped';
      check.id += ' — no site grants';
    }
  }
  return checks;
}
