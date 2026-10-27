import type { AnnotationInput } from '@ap/contracts';
import type { ConformanceCheck, PortMethod, ServerConformanceHarness } from '../../types';
import { ANNOTATION_ROW_KEYS, assessmentProblem, describeResponse, expectOutcome, missingEnvelopeKey, trustProblem } from '../../helpers';

/** The annotation checks save, list and delete across one another, so each declares the whole annotation port. */
const ANNOTATION_METHODS: readonly PortMethod[] = ['listAnnotations', 'saveAnnotation', 'deleteAnnotation'];

export function planAnnotationChecks(harness: ServerConformanceHarness): ConformanceCheck[] {
  const { adapter, ports } = harness;
  const checks: ConformanceCheck[] = [];
  // Annotations (06 §16, issue #103): server-owned rows keyed by (chartId, scopeId) — never chartId alone
  // (ADR-0004). The chart's permission and the site's grant are both server-checked; the server stamps the
  // author and `at`, so the client never sends or sees either.
  const { chartId, from: noteFrom, to: noteTo, permission: annotationPermission } = ports.annotation;
  // Every save carries a unique text marker, so a rejected or isolated note can be told apart from earlier ones.
  // `from`/`to` come from the harness: a range valid for that chart's axis (06 §16) — wall-clock on a time axis,
  // category labels on a category axis — so a server that validates the range against the axis can accept it.
  const annotationInput = (scopeId: string | null): AnnotationInput => ({
    chartId, scopeId, from: noteFrom, to: noteTo, text: `conformance ${crypto.randomUUID()}`,
  });
  checks.push({
    id: 'port · saveAnnotation then listAnnotations at the same site returns the note',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'granted',
    run: async () => {
      const input = annotationInput(harness.context.scopeId);
      const saved = await adapter.saveAnnotation(input);
      if (saved.outcome !== 'ok') return `expected ok, got ${describeResponse(saved)}`;
      const row = saved.data;
      if (row === null) return 'the ok answer carries no saved row';
      if (typeof row.id !== 'string' || typeof row.at !== 'string') {
        return 'the saved row must carry the server-stamped string id and at';
      }
      if (row.chartId !== input.chartId || row.scopeId !== input.scopeId || row.from !== input.from || row.to !== input.to) {
        return 'the saved row must echo the input chartId·scopeId·from·to';
      }
      if (row.text !== input.text) return 'the saved row must echo the input text';
      if (row.mine !== true) return 'the saved row must carry mine: true for the user who just saved it (adapter.ts, #399)';
      const extra = Object.keys(row).filter(k => !(ANNOTATION_ROW_KEYS as readonly string[]).includes(k));
      if (extra.length > 0) {
        return `the saved row carries ${extra.join(', ')} — the server stamps the author and the client never sees or sends it (adapter.ts)`;
      }
      // Both successes answer the full 06 §19/§18 envelope shape (#152 round D), like getEntity above.
      const savedMissing = missingEnvelopeKey(saved, 'assessments') ?? missingEnvelopeKey(saved, 'trust');
      if (savedMissing) return `saveAnnotation: ${savedMissing}`;
      const savedProblem = assessmentProblem(saved.assessments, saved.outcome) ?? trustProblem(saved.trust);
      if (savedProblem) return `saveAnnotation: ${savedProblem}`;
      const list = await adapter.listAnnotations({ chartId, scopeId: input.scopeId });
      if (list.outcome !== 'ok') return `listing the site that just accepted the save: expected ok, got ${describeResponse(list)}`;
      const listMissing = missingEnvelopeKey(list, 'assessments') ?? missingEnvelopeKey(list, 'trust');
      if (listMissing) return `listAnnotations: ${listMissing}`;
      const listProblem = assessmentProblem(list.assessments, list.outcome) ?? trustProblem(list.trust);
      if (listProblem) return `listAnnotations: ${listProblem}`;
      if (!Array.isArray(list.data?.items) || !list.data!.items.some(item => item.id === row.id)) {
        return 'the note just saved is missing from its own site\'s list';
      }
      return null;
    },
  });
  checks.push({
    id: 'port · a note saved at one site is not listed at another',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'granted',
    run: async () => {
      const saved = await adapter.saveAnnotation(annotationInput(harness.context.scopeId));
      if (saved.outcome !== 'ok' || saved.data === null) return `expected ok with the saved row, got ${describeResponse(saved)}`;
      const list = await adapter.listAnnotations({ chartId, scopeId: ports.otherGrantedScopeId });
      if (list.outcome !== 'ok' && list.outcome !== 'empty') return `expected ok or empty, got ${describeResponse(list)}`;
      if (list.data?.items.some(item => item.id === saved.data!.id)) {
        return `a note written at ${harness.context.scopeId} is listed at ${ports.otherGrantedScopeId} — annotations are keyed by (chartId, scopeId), never chartId alone (06 §16, ADR-0004)`;
      }
      return null;
    },
  });
  checks.push({
    id: 'port · listAnnotations at a site without a grant → forbidden',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'granted',
    run: expectOutcome(() => adapter.listAnnotations({ chartId, scopeId: harness.foreignScopeId }), 'forbidden', 'a site the granted actor holds no grant for'),
  });
  checks.push({
    id: 'port · saveAnnotation at a site without a grant → forbidden',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'granted',
    run: expectOutcome(() => adapter.saveAnnotation(annotationInput(harness.foreignScopeId)), 'forbidden', 'a site the granted actor holds no grant for'),
  });
  checks.push({
    id: 'port · listAnnotations with a null Scope → forbidden',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'granted',
    run: expectOutcome(() => adapter.listAnnotations({ chartId, scopeId: null }), 'forbidden', 'a null scope is not a request the server answers, never "all sites"'),
  });
  checks.push({
    id: 'port · saveAnnotation with a null Scope → forbidden',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'granted',
    run: expectOutcome(() => adapter.saveAnnotation(annotationInput(null)), 'forbidden', 'a null scope is not a request the server answers, never "all sites"'),
  });
  checks.push({
    id: 'port · saveAnnotation carrying an at → error, nothing stored',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'granted',
    run: async () => {
      const input = annotationInput(harness.context.scopeId);
      const saved = await adapter.saveAnnotation({ ...input, at: '2026-01-01T00:00' } as AnnotationInput);
      if (saved.outcome !== 'error') return `a client-stamped at is an unknown key: expected error, got ${describeResponse(saved)}`;
      const list = await adapter.listAnnotations({ chartId, scopeId: input.scopeId });
      if (list.outcome === 'ok' && list.data?.items.some(item => item.text === input.text)) {
        return 'the rejected note was stored anyway';
      }
      return null;
    },
  });
  // adapter.ts saveAnnotation: a user/at/id in the input is an unknown key — one check, both calls.
  checks.push({
    id: 'port · saveAnnotation carrying an id or a user → error',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'granted',
    run: async () => {
      const input = annotationInput(harness.context.scopeId);
      for (const extra of [{ id: 'ann-x' }, { user: 'someone' }] as const) {
        const saved = await adapter.saveAnnotation({ ...input, ...extra } as AnnotationInput);
        if (saved.outcome !== 'error') {
          return `a client-sent ${Object.keys(extra)[0]} is an unknown key: expected error, got ${describeResponse(saved)}`;
        }
      }
      return null;
    },
  });
  checks.push({
    id: 'port · annotations are not mart data: no assessments, null trust',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'granted',
    run: async () => {
      const saved = await adapter.saveAnnotation(annotationInput(harness.context.scopeId));
      // Calls that did not succeed are the save/list checks' failures; this check owns only the mart-data rule.
      if (saved.outcome !== 'ok') return null;
      const saveMissing = missingEnvelopeKey(saved, 'assessments') ?? missingEnvelopeKey(saved, 'trust');
      if (saveMissing) return `saveAnnotation: ${saveMissing}`;
      if (saved.assessments.length > 0 || saved.trust !== null) {
        return 'saveAnnotation is not mart data (adapter.ts): no assessments, null trust';
      }
      const list = await adapter.listAnnotations({ chartId, scopeId: harness.context.scopeId });
      if (list.outcome !== 'ok' && list.outcome !== 'empty') return null;
      const listMissing = missingEnvelopeKey(list, 'assessments') ?? missingEnvelopeKey(list, 'trust');
      if (listMissing) return `listAnnotations: ${listMissing}`;
      if (list.assessments.length > 0 || list.trust !== null) {
        return 'listAnnotations is not mart data (adapter.ts): no assessments, null trust';
      }
      return null;
    },
  });
  checks.push({
    id: `port · listAnnotations without ${annotationPermission} → forbidden`,
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'permission',
    run: () => harness.withoutPermission(
      annotationPermission,
      expectOutcome(() => adapter.listAnnotations({ chartId, scopeId: harness.context.scopeId }), 'forbidden', 'the annotation read re-checks the chart permission per request'),
    ),
  });
  checks.push({
    id: `port · saveAnnotation without ${annotationPermission} → forbidden`,
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'permission',
    run: () => harness.withoutPermission(
      annotationPermission,
      expectOutcome(() => adapter.saveAnnotation(annotationInput(harness.context.scopeId)), 'forbidden', 'the annotation write re-checks the chart permission per request'),
    ),
  });
  // Author-only delete (#399, ADR-0041). The two actors are the granted account and a second annotating account (`asOtherAnnotator`), so
  // these run sequentially and switch actors themselves (the mock's role is global).
  const deleteRef = (id: string, scopeId: string | null = harness.context.scopeId) => ({ chartId, scopeId, id });
  const saveAsGranted = async (): Promise<{ id: string } | string> => {
    const saved = await harness.asGranted(() => adapter.saveAnnotation(annotationInput(harness.context.scopeId)));
    return saved.outcome === 'ok' && saved.data ? { id: saved.data.id } : `saving the note to delete: expected ok, got ${describeResponse(saved)}`;
  };
  // A server that does not keep a saved note already fails the save-then-list check; the delete cases do not repeat that failure.
  const savedAndListed = async (): Promise<{ id: string } | string | null> => {
    const saved = await saveAsGranted();
    if (typeof saved === 'string') return saved;
    const ids = await listIds(harness.asGranted);
    if (typeof ids === 'string') return ids;
    return ids.includes(saved.id) ? saved : null;
  };
  const listIds = async (actor: <T>(fn: () => Promise<T>) => Promise<T>): Promise<string[] | string> => {
    const list = await actor(() => adapter.listAnnotations({ chartId, scopeId: harness.context.scopeId }));
    if (list.outcome === 'empty') return [];
    return list.outcome === 'ok' && list.data ? list.data.items.map(i => i.id) : `listing: expected ok or empty, got ${describeResponse(list)}`;
  };
  checks.push({
    id: 'port · deleteAnnotation by the author removes the note',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'sequential',
    run: async () => {
      const saved = await savedAndListed();
      if (saved === null) return null;
      if (typeof saved === 'string') return saved;
      const deleted = await harness.asGranted(() => adapter.deleteAnnotation(deleteRef(saved.id)));
      if (deleted.outcome !== 'ok') return `the author deleting their own note: expected ok, got ${describeResponse(deleted)}`;
      if (deleted.data?.id !== saved.id) return 'the ok answer must carry the deleted id';
      const missing = missingEnvelopeKey(deleted, 'assessments') ?? missingEnvelopeKey(deleted, 'trust');
      if (missing) return `deleteAnnotation: ${missing}`;
      const problem = assessmentProblem(deleted.assessments, deleted.outcome) ?? trustProblem(deleted.trust);
      if (problem) return `deleteAnnotation: ${problem}`;
      const ids = await listIds(harness.asGranted);
      if (typeof ids === 'string') return ids;
      return ids.includes(saved.id) ? 'the deleted note is still listed' : null;
    },
  });
  checks.push({
    id: 'port · deleteAnnotation by another user → forbidden and the note stays',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'sequential',
    run: async () => {
      const saved = await savedAndListed();
      if (saved === null) return null;
      if (typeof saved === 'string') return saved;
      // The second actor must be able to annotate, or a refusal could be the permission/site gate rather than authorship.
      const own = await harness.asOtherAnnotator(() => adapter.saveAnnotation(annotationInput(harness.context.scopeId)));
      if (own.outcome !== 'ok' || !own.data) {
        await harness.asGranted(() => adapter.deleteAnnotation(deleteRef(saved.id)));
        return `the second actor cannot annotate (saving its own note: expected ok, got ${describeResponse(own)}) — asOtherAnnotator needs ${annotationPermission} and a grant at ${harness.context.scopeId}, so a refusal would not prove authorship`;
      }
      const other = await harness.asOtherAnnotator(() => adapter.deleteAnnotation(deleteRef(saved.id)));
      const ids = await listIds(harness.asGranted);
      await harness.asGranted(() => adapter.deleteAnnotation(deleteRef(saved.id)));
      const ownDeleted = await harness.asOtherAnnotator(() => adapter.deleteAnnotation(deleteRef(own.data!.id)));
      if (ownDeleted.outcome !== 'ok') return `the second actor deleting its own note: expected ok, got ${describeResponse(ownDeleted)}`;
      if (other.outcome !== 'forbidden') return `a user who is not the author: expected forbidden, got ${describeResponse(other)}`;
      if (typeof ids === 'string') return ids;
      return ids.includes(saved.id) ? null : 'the note was removed by a user who is not its author';
    },
  });
  checks.push({
    id: 'port · deleteAnnotation of an id not at this site → empty',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'granted',
    run: expectOutcome(() => adapter.deleteAnnotation(deleteRef(`ann-missing-${crypto.randomUUID().slice(0, 8)}`)), 'empty', 'an id that is not in this chart·site answers empty, never revealing a row elsewhere'),
  });
  checks.push({
    id: 'port · deleteAnnotation at a site without a grant → forbidden',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'granted',
    run: expectOutcome(() => adapter.deleteAnnotation(deleteRef('ann-1', harness.foreignScopeId)), 'forbidden', 'a site the granted actor holds no grant for'),
  });
  checks.push({
    id: 'port · deleteAnnotation with a null Scope → forbidden',
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'granted',
    run: expectOutcome(() => adapter.deleteAnnotation(deleteRef('ann-1', null)), 'forbidden', 'a null scope is not a request the server answers, never "all sites"'),
  });
  checks.push({
    id: `port · deleteAnnotation without ${annotationPermission} → forbidden`,
    uses: ANNOTATION_METHODS,
    needsSites: true,
    mode: 'permission',
    run: () => harness.withoutPermission(
      annotationPermission,
      expectOutcome(() => adapter.deleteAnnotation(deleteRef('ann-1')), 'forbidden', 'the annotation delete re-checks the chart permission per request'),
    ),
  });
  return checks;
}
