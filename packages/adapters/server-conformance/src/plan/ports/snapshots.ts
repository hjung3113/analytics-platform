import type { ConformanceCheck, ServerConformanceHarness } from '../../types';
import { parseDateTime } from '@ap/contracts';

export function planSnapshotChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const { adapter } = harness;
  const checks: ConformanceCheck[] = [];
  // The remaining ports (#152 round D): sync snapshots and the condition-editor reads — non-envelope
  // methods, so each check judges the returned shape, never a 06 §19 envelope.
  checks.push({
    id: 'port · publishedMetrics() returns well-formed pointers',
    uses: ['publishedMetrics'],
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const pointers = adapter.publishedMetrics();
      if (!Array.isArray(pointers)) return `publishedMetrics() answers an array, got ${typeof pointers}`;
      for (const p of pointers) {
        if (typeof p.metricId !== 'string' || p.metricId.length === 0) {
          return 'every pointer carries a non-empty string metricId (adapter.ts PublishedMetric)';
        }
        if (typeof p.publishedVersion !== 'string' && p.publishedVersion !== null) {
          return `${p.metricId}: publishedVersion is a string or null — null = known, unpublished (adapter.ts PublishedMetric)`;
        }
      }
      return null;
    },
  });
  checks.push({
    id: 'port · defaultRangeTo() is a naive wall-clock',
    uses: ['defaultRangeTo'],
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const anchor = adapter.defaultRangeTo();
      // null = the server has no anchor (ADR-0098): valid, and never replaced by a browser-clock or invented date.
      if (anchor === null) return null;
      if (typeof anchor !== 'string') return `defaultRangeTo() answers a string or null, got ${typeof anchor}`;
      try {
        parseDateTime(anchor, 'defaultRangeTo'); // url.ts DATETIME — the URL contract's validator
      } catch (error) {
        return `defaultRangeTo() is the URL contract's naive wall-clock YYYY-MM-DDTHH:mm:ss with no zone/offset (06 §6.3): ${String(error)}`;
      }
      return null;
    },
  });
  checks.push({
    id: 'port · contextOptions(granted site) returns the option lists',
    uses: ['contextOptions'],
    needsSites: true,
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const options = await adapter.contextOptions(harness.context.scopeId);
      for (const axis of ['stgroup', 'team'] as const) {
        if (!Array.isArray(options[axis]) || options[axis].some(v => typeof v !== 'string')) {
          return `contextOptions(${harness.context.scopeId}).${axis} is a string array (adapter.ts ConditionOptions)`;
        }
      }
      if (!Array.isArray(options.makerModel) || options.makerModel.some(mm => typeof mm.maker !== 'string' || typeof mm.model !== 'string')) {
        return `contextOptions(${harness.context.scopeId}).makerModel is an array of { maker, model } strings (adapter.ts ConditionOptions)`;
      }
      return null;
    },
  });
  // IdSet "no constraint" is null, never [] (url.ts: [] is an explicit empty set) — the kit asks for the
  // whole granted set and checks the server's own grant filter, not a client-sent room list.
  checks.push({
    id: 'port · evaluateSelection lists only equipment in granted rooms',
    uses: ['validateScope', 'evaluateSelection'],
    needsSites: true,
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      const scope = await adapter.validateScope(harness.context.scopeId);
      if (scope.status !== 'valid') return `the granted site ${harness.context.scopeId} does not validate here (its own check reports the status)`;
      // Zero listed rooms is validateScope's own check's failure — the grant filter comparison only judges a
      // server that does list its rooms.
      const grantedRooms = scope.grantedRooms.length > 0 ? scope.grantedRooms : null;
      const evaluation = await adapter.evaluateSelection({ scopeId: harness.context.scopeId, roomNames: null, condition: null, lineNames: null, prcGroups: null, membershipBasis: null, selection: null });
      if (!Array.isArray(evaluation.inCondition) || !Array.isArray(evaluation.outOfCondition)) {
        return 'evaluateSelection answers inCondition and outOfCondition arrays (adapter.ts SelectionEvaluation)';
      }
      for (const e of evaluation.inCondition) {
        if (typeof e.equipmentId !== 'string' || typeof e.room !== 'string' || typeof e.model !== 'string') {
          return 'every inCondition item is { equipmentId, room, model } strings (adapter.ts EquipmentOption)';
        }
        if (grantedRooms !== null && !grantedRooms.includes(e.room)) {
          return `${e.equipmentId} sits in ${e.room}, outside the granted rooms [${grantedRooms.join(', ')}] — the server filters by the session's grants (adapter.ts)`;
        }
      }
      if (evaluation.outOfCondition.some(id => typeof id !== 'string')) {
        return 'outOfCondition is a string array (adapter.ts SelectionEvaluation)';
      }
      return null;
    },
  });
  checks.push({
    id: 'port · evaluateSelection at a site without a grant lists no equipment',
    uses: ['evaluateSelection'],
    needsSites: true,
    mode: 'granted',
    nonEnvelope: true,
    run: async () => {
      // adapter.ts fixes no failure form for non-envelope async methods: an empty list or a rejection both
      // pass — only equipment actually listed at the ungranted site fails this check.
      let evaluation;
      try {
        evaluation = await adapter.evaluateSelection({ scopeId: harness.foreignScopeId, roomNames: null, condition: null, lineNames: null, prcGroups: null, membershipBasis: null, selection: null });
      } catch {
        return null;
      }
      if (!Array.isArray(evaluation.inCondition)) return 'evaluateSelection answers an inCondition array (adapter.ts SelectionEvaluation)';
      if (evaluation.inCondition.length > 0) {
        return `equipment is listed at the ungranted site ${harness.foreignScopeId} — grants filter the answer (adapter.ts)`;
      }
      return null;
    },
  });
  return checks;
}
