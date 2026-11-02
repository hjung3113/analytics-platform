// Synthetic knowledge items for `SEED_MODE=personas|scale` (ADR-0109, #1197 a): 12 items over three models
// (model-owned and SW-owned), two with a second revision, assessments on both axes (one `disputed`), a
// `derived_from` pair across SW versions, a `related` pair across models and one archived item. Text is synthetic.
// Idempotent: an item is keyed by its first revision's title within its owner and each item is seeded in one
// transaction; a rerun adds nothing, or completes an item that is missing child rows. The core seed
// never calls this. Runs after `seedKnowledgeCatalog` (owners must exist).

import { and, eq } from 'drizzle-orm';

import type { DbHandle } from '../db/client.js';
import {
  equipmentModels,
  itemAssessmentEvents,
  itemLinks,
  itemRevisionEvidence,
  knowledgeItemRevisions,
  knowledgeItems,
  softwareVersions,
  vendors,
} from '../db/schema/knowledge.js';
import { toCodeKey } from '../modules/log-knowledge/domain/code-key.js';
import { allocateItemNo } from '../modules/log-knowledge/repositories/item-number.js';

type Axis = 'verification' | 'processing';
interface SeedRevision {
  title: string;
  typeCode: 'anomaly' | 'needs_check' | 'behavior_note' | 'guideline';
  observation?: string;
  expected?: string;
  analysisOpinion?: string;
  improvement?: string;
  changeNote?: string;
  evidence?: { kind: 'log_file' | 'spec' | 'image' | 'validation_run' | 'other'; ref: string; locator?: string }[];
}
interface SeedItem {
  key: string;
  model: string;
  /** Software version label when the item is SW-owned. */
  software?: string;
  archived?: boolean;
  revisions: SeedRevision[];
  /** Assessment events in order; the last event per axis is the item's projection. */
  events?: { axis: Axis; to: string; basedOn: number; rationale: string }[];
  derivedFrom?: { key: string };
  related?: { key: string }[];
}

const ITEMS: readonly SeedItem[] = [
  {
    key: 'a1',
    model: 'MX-100',
    revisions: [
      {
        title: 'Chamber pressure drifts after a recipe step change',
        typeCode: 'anomaly',
        observation: 'Pressure rises about 3 percent over two minutes after step 4 starts.',
        expected: 'Pressure holds within 1 percent of the setpoint.',
        evidence: [{ kind: 'log_file', ref: 'synthetic-log-0001', locator: 'rows 120-180' }],
      },
      {
        title: 'Chamber pressure drifts after a recipe step change',
        typeCode: 'anomaly',
        observation: 'Pressure rises about 3 percent over two minutes after step 4 starts.',
        expected: 'Pressure holds within 1 percent of the setpoint.',
        analysisOpinion: 'The valve ramp starts before the setpoint change is applied.',
        changeNote: 'Added the analysis opinion.',
        evidence: [
          { kind: 'log_file', ref: 'synthetic-log-0001', locator: 'rows 120-180' },
          { kind: 'spec', ref: 'synthetic-spec-valve-ramp' },
        ],
      },
    ],
    events: [
      { axis: 'verification', to: 'observed', basedOn: 1, rationale: 'Seen in one lot.' },
      { axis: 'processing', to: 'under_investigation', basedOn: 1, rationale: 'Assigned to the process team.' },
      { axis: 'verification', to: 'verified', basedOn: 2, rationale: 'Reproduced in a second lot.' },
      { axis: 'processing', to: 'resolved', basedOn: 2, rationale: 'Valve ramp timing was corrected.' },
    ],
  },
  {
    key: 'a2',
    model: 'MX-100',
    revisions: [
      {
        title: 'Purge interval before wafer load',
        typeCode: 'guideline',
        expected: 'Run a 30 second purge before every wafer load.',
        improvement: 'Add the purge to the load recipe.',
      },
    ],
  },
  {
    key: 'a3',
    model: 'MX-100',
    revisions: [
      {
        title: 'Heater zone ramp rate is unclear',
        typeCode: 'needs_check',
        observation: 'The ramp rate differs between two recipe documents.',
      },
    ],
    events: [
      { axis: 'verification', to: 'observed', basedOn: 1, rationale: 'Both documents were compared.' },
      { axis: 'processing', to: 'under_investigation', basedOn: 1, rationale: 'Waiting for the vendor answer.' },
    ],
    related: [{ key: 'a2' }],
  },
  {
    key: 'b1',
    model: 'MX-100',
    software: 'v1.0.0',
    revisions: [
      {
        title: 'Door interlock alarm repeats',
        typeCode: 'anomaly',
        observation: 'The alarm re-raises every 10 seconds while the door is closed.',
        expected: 'The alarm clears once the door closes.',
        evidence: [{ kind: 'log_file', ref: 'synthetic-log-0002', locator: '00:12:00-00:14:30' }],
      },
    ],
    events: [
      { axis: 'verification', to: 'observed', basedOn: 1, rationale: 'Seen on one tool.' },
      { axis: 'verification', to: 'disputed', basedOn: 1, rationale: 'A second tool did not show it.' },
      { axis: 'processing', to: 'under_investigation', basedOn: 1, rationale: 'Checking the door sensor revision.' },
    ],
  },
  {
    key: 'b2',
    model: 'MX-100',
    software: 'v1.2.0',
    revisions: [
      {
        title: 'Door interlock alarm repeats after the update',
        typeCode: 'anomaly',
        observation: 'The same alarm pattern appears on this version.',
      },
    ],
    derivedFrom: { key: 'b1' },
  },
  {
    key: 'b3',
    model: 'MX-100',
    software: 'v2.0.0',
    revisions: [
      {
        title: 'Startup log shows an extra handshake line',
        typeCode: 'behavior_note',
        observation: 'One extra handshake line is written before the ready message.',
        expected: 'The line is informational and can be ignored.',
      },
    ],
  },
  {
    key: 'c1',
    model: 'MX-200',
    revisions: [
      {
        title: 'Cleaning cycle counter resets on power loss',
        typeCode: 'behavior_note',
        observation: 'The counter returns to zero after a power cycle.',
        analysisOpinion: 'The counter is held in volatile memory.',
      },
      {
        title: 'Cleaning cycle counter resets on power loss',
        typeCode: 'behavior_note',
        observation: 'The counter returns to zero after a power cycle.',
        expected: 'Count cleaning cycles from the maintenance record instead.',
        analysisOpinion: 'The counter is held in volatile memory.',
        changeNote: 'Added the expected handling.',
      },
    ],
    events: [{ axis: 'verification', to: 'verified', basedOn: 2, rationale: 'Confirmed by the vendor note.' }],
  },
  {
    key: 'c2',
    model: 'MX-200',
    software: 'v1.0.0',
    revisions: [
      {
        title: 'Lot end report omits the last wafer',
        typeCode: 'anomaly',
        observation: 'The report lists 24 wafers for a 25 wafer lot.',
        expected: 'All 25 wafers are listed.',
      },
    ],
    events: [{ axis: 'processing', to: 'under_investigation', basedOn: 1, rationale: 'Reported to the SW owner.' }],
    related: [{ key: 'a1' }],
  },
  {
    key: 'c3',
    model: 'MX-200',
    software: 'v1.1.0',
    revisions: [
      {
        title: 'Check the report wafer count before sign-off',
        typeCode: 'guideline',
        expected: 'Compare the wafer count in the report with the lot sheet.',
      },
    ],
  },
  {
    key: 'd1',
    model: 'MX-300',
    revisions: [
      {
        title: 'Target life warning threshold needs review',
        typeCode: 'needs_check',
        observation: 'The warning appears late compared with measured erosion.',
      },
    ],
    events: [{ axis: 'processing', to: 'under_investigation', basedOn: 1, rationale: 'Measurements are being collected.' }],
  },
  {
    key: 'd2',
    model: 'MX-300',
    software: 'v3.0.1',
    revisions: [
      {
        title: 'Recipe download times out on slow links',
        typeCode: 'anomaly',
        observation: 'Download stops after 30 seconds on a congested link.',
        expected: 'The download retries.',
      },
    ],
    events: [
      { axis: 'verification', to: 'verified', basedOn: 1, rationale: 'Reproduced with a throttled link.' },
      { axis: 'processing', to: 'resolved', basedOn: 1, rationale: 'Fixed in the next version.' },
    ],
  },
  {
    key: 'd3',
    model: 'MX-300',
    software: 'v3.1.0',
    archived: true,
    revisions: [
      {
        title: 'Old note on the download timeout',
        typeCode: 'behavior_note',
        observation: 'Superseded by the fix in this version.',
      },
    ],
  },
];

/** Vendor code of each seeded model: models are keyed by vendor + model code (ADR-0107), never by model code alone. */
const MODEL_VENDOR: Readonly<Record<string, string>> = {
  'MX-100': 'Vendor A',
  'MX-200': 'Vendor A',
  'MX-300': 'Vendor B',
  'MX-400': 'Vendor B',
  'MX-500': 'Vendor B',
  'MX-600': 'Vendor C',
};

export async function seedKnowledgeItems(
  handle: DbHandle,
  workspaceId: string,
  actorId: string,
): Promise<{ rowsInserted: number }> {
  const { db } = handle;
  let rowsInserted = 0;
  const existing = new Map<string, string>();

  for (const item of ITEMS) {
    const vendorCode = MODEL_VENDOR[item.model];
    if (!vendorCode) throw new Error(`seed model ${item.model} has no vendor mapping`);
    const [model] = await db
      .select({ id: equipmentModels.id })
      .from(equipmentModels)
      .innerJoin(
        vendors,
        and(eq(vendors.workspaceId, equipmentModels.workspaceId), eq(vendors.id, equipmentModels.vendorId)),
      )
      .where(
        and(
          eq(equipmentModels.workspaceId, workspaceId),
          eq(vendors.codeKey, toCodeKey(vendorCode)),
          eq(equipmentModels.codeKey, toCodeKey(item.model)),
        ),
      );
    if (!model) throw new Error(`seed model ${vendorCode} ${item.model} is missing; seed the catalog first`);
    let softwareId: string | null = null;
    if (item.software) {
      const [sw] = await db
        .select({ id: softwareVersions.id })
        .from(softwareVersions)
        .where(
          and(
            eq(softwareVersions.workspaceId, workspaceId),
            eq(softwareVersions.modelId, model.id),
            eq(softwareVersions.versionKey, toCodeKey(item.software)),
          ),
        );
      if (!sw) throw new Error(`seed software ${item.model} ${item.software} is missing`);
      softwareId = sw.id;
    }
    const firstTitle = (item.revisions[0] as SeedRevision).title;
    const ownerCond = softwareId === null ? eq(knowledgeItems.ownerModelId, model.id) : eq(knowledgeItems.ownerSoftwareId, softwareId);
    const ownerModelId = softwareId === null ? model.id : null;
    const state = { verification: 'not_checked', processing: 'open' } as Record<Axis, string>;
    for (const e of item.events ?? []) state[e.axis] = e.to;

    // One transaction per item: allocation, item row, revisions, evidence and events commit together, so an
    // interrupted seed leaves no half item. A rerun completes whatever an item is still missing (rows written by an
    // older, non-atomic seed too), and an item is complete only when all its child rows exist.
    const itemId = await db.transaction(async (tx) => {
      const candidates = await tx
        .select({
          id: knowledgeItems.id,
          title: knowledgeItemRevisions.title,
          latest: knowledgeItems.latestRevisionNo,
        })
        .from(knowledgeItems)
        .leftJoin(
          knowledgeItemRevisions,
          and(
            eq(knowledgeItemRevisions.workspaceId, knowledgeItems.workspaceId),
            eq(knowledgeItemRevisions.itemId, knowledgeItems.id),
            eq(knowledgeItemRevisions.revisionNo, 1),
          ),
        )
        .where(and(eq(knowledgeItems.workspaceId, workspaceId), ownerCond));
      // Match by first title, or adopt a skeleton row that has no revision at all (same revision count).
      const found =
        candidates.find((c) => c.title === firstTitle) ??
        candidates.find((c) => c.title === null && c.latest === item.revisions.length);
      let id: string;
      if (found) {
        id = found.id;
      } else {
        const itemNo = await allocateItemNo(tx, workspaceId);
        const [created] = await tx
          .insert(knowledgeItems)
          .values({
            workspaceId,
            itemNo,
            ownerModelId,
            ownerSoftwareId: softwareId,
            latestRevisionNo: item.revisions.length,
            publicationState: item.archived ? 'archived' : 'published',
            verificationState: state.verification,
            processingState: state.processing,
            createdBy: actorId,
            updatedBy: actorId,
          })
          .returning({ id: knowledgeItems.id });
        id = (created as { id: string }).id;
        rowsInserted += 1;
      }

      for (const [index, rev] of item.revisions.entries()) {
        const revisionNo = index + 1;
        const insertedRev = await tx
          .insert(knowledgeItemRevisions)
          .values({
            workspaceId,
            itemId: id,
            revisionNo,
            title: rev.title,
            typeCode: rev.typeCode,
            observation: rev.observation ?? null,
            expected: rev.expected ?? null,
            analysisOpinion: rev.analysisOpinion ?? null,
            improvement: rev.improvement ?? null,
            changeNote: rev.changeNote ?? null,
            publishedBy: actorId,
          })
          .onConflictDoNothing()
          .returning({ no: knowledgeItemRevisions.revisionNo });
        rowsInserted += insertedRev.length;
        for (const [n, ev] of (rev.evidence ?? []).entries()) {
          const insertedEv = await tx
            .insert(itemRevisionEvidence)
            .values({
              workspaceId,
              itemId: id,
              revisionNo,
              ordinal: n + 1,
              sourceKind: ev.kind,
              sourceOwner: 'Synthetic source system',
              sourceRef: ev.ref,
              locator: ev.locator ?? null,
            })
            .onConflictDoNothing()
            .returning({ ordinal: itemRevisionEvidence.ordinal });
          rowsInserted += insertedEv.length;
        }
      }

      // Events have no unique key: an event is present when one with the same axis, target state, basis and
      // rationale exists for the item.
      const haveEvents = await tx
        .select({
          dimension: itemAssessmentEvents.dimension,
          newState: itemAssessmentEvents.newState,
          basedOn: itemAssessmentEvents.basedOnRevisionNo,
          rationale: itemAssessmentEvents.rationale,
        })
        .from(itemAssessmentEvents)
        .where(and(eq(itemAssessmentEvents.workspaceId, workspaceId), eq(itemAssessmentEvents.itemId, id)));
      const prior = { verification: 'not_checked', processing: 'open' } as Record<Axis, string>;
      for (const e of item.events ?? []) {
        const present = haveEvents.some(
          (h) => h.dimension === e.axis && h.newState === e.to && h.basedOn === e.basedOn && h.rationale === e.rationale,
        );
        if (!present) {
          await tx.insert(itemAssessmentEvents).values({
            workspaceId,
            itemId: id,
            basedOnRevisionNo: e.basedOn,
            dimension: e.axis,
            priorState: prior[e.axis],
            newState: e.to,
            rationale: e.rationale,
            actorId,
          });
          rowsInserted += 1;
        }
        prior[e.axis] = e.to;
      }
      return id;
    });
    existing.set(item.key, itemId);
  }


  // Links: the unique (source, target, kind) index makes a rerun a no-op.
  for (const item of ITEMS) {
    const sourceId = existing.get(item.key) as string;
    const targets: { key: string; kind: 'derived_from' | 'related' }[] = [
      ...(item.derivedFrom ? [{ key: item.derivedFrom.key, kind: 'derived_from' as const }] : []),
      ...(item.related ?? []).map((r) => ({ key: r.key, kind: 'related' as const })),
    ];
    for (const target of targets) {
      const targetId = existing.get(target.key) as string;
      const inserted = await db
        .insert(itemLinks)
        .values({
          workspaceId,
          sourceItemId: sourceId,
          targetItemId: targetId,
          linkKind: target.kind,
          sourceRevisionNo: target.kind === 'derived_from' ? 1 : null,
          createdBy: actorId,
        })
        .onConflictDoNothing()
        .returning({ id: itemLinks.id });
      rowsInserted += inserted.length;
    }
  }
  return { rowsInserted };
}
