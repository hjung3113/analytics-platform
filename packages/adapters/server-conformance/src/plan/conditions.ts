import { emptyGlobal, parseQuery, type Condition, type PlatformAdapter } from '@ap/contracts';
import type { ConformanceCheck, ServerConformanceHarness } from '../types';
import { baseRequest, expectOutcome } from '../helpers';

/** Axis vocabulary and data come entirely from the harness. */
export function planConditionChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const sample = harness.ports.condition;
  if (!sample) return [{ id: 'condition: no sample', mode: 'skipped', uses: ['evaluateSelection'], run: async () => null }];
  const { axisA, axisB } = sample;
  const evaluate = async (condition: Condition) => {
    const r = await harness.adapter.evaluateSelection({ ...emptyGlobal, scopeId: harness.context.scopeId, condition });
    return new Set(r.inCondition.map(e => e.equipmentId));
  };
  const single: Condition = { [axisA.id]: [axisA.values[0]] };
  const malformed: { label: string; patch: Record<string, unknown> }[] = [
    { label: 'malformed map', patch: { condition: [] } },
    { label: 'empty axis array', patch: { condition: { [axisA.id]: [] } } },
    { label: 'scalar axis', patch: { condition: { [axisA.id]: axisA.values[0] } } },
    { label: 'blank axis ID', patch: { condition: { [axisA.id]: [' '] } } },
    { label: 'scalar Line', patch: { lineNames: 'L10' } },
    { label: 'scalar PRC', patch: { prcGroups: 'P10' } },
    { label: 'invalid basis', patch: { membershipBasis: 'current' } },
    { label: 'orphan basis', patch: { membershipBasis: 'asOf' } },
  ];
  const endpointCase = harness.cases.find(c => c.spec.id === sample.endpoint);
  const invalidChecks: ConformanceCheck[] = malformed.flatMap(({ label, patch }) => {
    const checks: ConformanceCheck[] = [{
      id: `condition · evaluateSelection rejects ${label}`, mode: 'granted', nonEnvelope: true, uses: ['evaluateSelection'],
      run: async () => {
        try {
          await harness.adapter.evaluateSelection({ ...emptyGlobal, scopeId: harness.context.scopeId, ...patch } as Parameters<PlatformAdapter['evaluateSelection']>[0]);
          return 'invalid Selection input must reject';
        } catch (error) {
          return error instanceof Error && error.name !== 'TypeError' ? null : 'invalid input must be rejected explicitly, not crash during matching';
        }
      },
    }];
    if (endpointCase) {
      const base = baseRequest(harness, endpointCase);
      if (Object.keys(patch).every(key => key in base.context)) checks.push({
        id: `condition · menuQuery rejects ${label}`, mode: 'granted', uses: ['menuQuery'],
        run: expectOutcome(() => harness.adapter.menuQuery({ ...base, context: { ...base.context, ...patch } }), 'error', label),
      });
    }
    return checks;
  });

  const conditionChecks: ConformanceCheck[] = [
    ...invalidChecks,
    { id: 'condition · AND narrows across axes', mode: 'granted', nonEnvelope: true, uses: ['evaluateSelection'], run: async () => {
      const [base, both] = await Promise.all([evaluate(single), evaluate({ ...single, [axisB.id]: [axisB.value] })]);
      return both.size > 0 && both.size < base.size && [...both].every(id => base.has(id)) ? null : 'AND must produce a non-empty strict subset for the supplied sample';
    } },
    { id: 'condition · OR includes each value', mode: 'granted', nonEnvelope: true, uses: ['evaluateSelection'], run: async () => {
      const [a, b, either] = await Promise.all([evaluate(single), evaluate({ [axisA.id]: [axisA.values[1]] }), evaluate({ [axisA.id]: axisA.values })]);
      const union = new Set([...a, ...b]);
      return a.size > 0 && b.size > 0 && either.size === union.size && [...union].every(id => either.has(id)) ? null : 'OR must equal the union of the two non-empty samples';
    } },
    { id: 'condition · v1 single axis is equivalent', mode: 'granted', nonEnvelope: true, uses: ['evaluateSelection'], run: async () => {
      const legacy = parseQuery('?equipmentGroup=' + encodeURIComponent(JSON.stringify({ axis: axisA.id, id: axisA.values[0] }))).global.condition!;
      const [a, b] = await Promise.all([evaluate(single), evaluate(legacy)]);
      return a.size === b.size && [...a].every(id => b.has(id)) ? null : 'v1 decoding changed the matching equipment';
    } },
    { id: 'condition · asOf without history → error', mode: 'granted', uses: ['menuQuery'], run: async () => {
      const c = harness.cases.find(c => c.spec.id === sample.endpoint);
      if (!c || c.spec.context.condition !== 'apply') return 'condition sample needs a condition-applying endpoint';
      const base = baseRequest(harness, c);
      return expectOutcome(() => harness.adapter.menuQuery({ ...base, context: { ...base.context, condition: { [sample.nonHistoryAxisId]: [axisA.values[0]] }, membershipBasis: 'asOf' } }), 'error', 'asOf on a non-history axis')();
    } },
  ];
  for (const check of conditionChecks) check.needsSites = true;
  return conditionChecks;
}
