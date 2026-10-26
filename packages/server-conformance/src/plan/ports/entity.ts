import type { ConformanceCheck, ServerConformanceHarness } from '../../types';
import { UNKNOWN_ENTITY_TYPE, assessmentProblem, describeResponse, expectOutcome, missingEnvelopeKey, trustProblem } from '../../helpers';
import type { AtSite } from './shared';

export function planEntityChecks(harness: ServerConformanceHarness, atSite: AtSite): ConformanceCheck[] {
  const { adapter, ports } = harness;
  const entityRef = ports.entity.ref;
  const ungrantedRoomRef = ports.entity.ungrantedRoomRef;
  const checks: ConformanceCheck[] = [];
  checks.push({
    id: 'port · getEntity(sample) → ok with the row',
    uses: ['getEntity'],
    mode: 'granted',
    run: async () => {
      const r = await adapter.getEntity(entityRef);
      if (r.outcome !== 'ok') return `expected ok, got ${describeResponse(r)}`;
      if (r.data === null) return 'the sample destination row is missing from the ok answer';
      return missingEnvelopeKey(r, 'assessments') ?? missingEnvelopeKey(r, 'trust') ?? assessmentProblem(r.assessments, r.outcome) ?? trustProblem(r.trust);
    },
  });
  checks.push({
    id: 'port · getEntity of an unregistered type → error',
    uses: ['getEntity'],
    mode: 'granted',
    run: expectOutcome(() => adapter.getEntity({ ...entityRef, type: UNKNOWN_ENTITY_TYPE }), 'error', 'an unregistered entity type'),
  });
  checks.push(atSite({
    id: 'port · getEntity at a site without a grant → forbidden',
    uses: ['getEntity'],
    needsSites: true,
    mode: 'granted',
    run: expectOutcome(() => adapter.getEntity({ ...entityRef, scopeId: harness.foreignScopeId }), 'forbidden', 'a site the granted actor holds no grant for'),
  }));
  checks.push(atSite({
    id: 'port · getEntity with a null Scope → forbidden',
    uses: ['getEntity'],
    needsSites: true,
    mode: 'granted',
    run: expectOutcome(() => adapter.getEntity({ ...entityRef, scopeId: null }), 'forbidden', 'a null Scope leaves no site to read'),
  }));
  // 06 §22 (checklist §2 getEntity): site 검증 뒤 그 객체의 room을 다시 검증 — the sample sits at a granted
  // site in a room the granted account does NOT hold. No sample → a visible skipped check, never a silent drop.
  checks.push(atSite({
    id: 'port · getEntity of a destination in an ungranted room → forbidden',
    uses: ['getEntity'],
    needsSites: true,
    mode: ungrantedRoomRef ? 'granted' : 'skipped',
    run: ungrantedRoomRef
      ? expectOutcome(() => adapter.getEntity(ungrantedRoomRef), 'forbidden', 'the site is granted but this destination\'s room is not (06 §22 room re-check)')
      : async () => null, // never called: skipped checks are filtered out of every run
  }));
  checks.push({
    id: `port · getEntity without ${ports.entity.permission} → forbidden`,
    uses: ['getEntity'],
    mode: 'permission',
    run: () => harness.withoutPermission(
      ports.entity.permission,
      expectOutcome(() => adapter.getEntity(entityRef), 'forbidden', 'the destination view permission is re-checked per request'),
    ),
  });
  return checks;
}
