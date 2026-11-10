// The audit rows of the eqv writes (ids, versions and Revision hashes only: no document, no name). The caller owns the transaction, so
// the row commits or rolls back with the write it describes (ADR-0008).
import type { Tx } from '../../db/tx.js';
import { createAuditService } from '../core/audit/audit-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';

const audit = createAuditService();

type Base = { tx: Tx; actor: PlatformActor; subjectId: string; summary: string };

export const recordDraft = (b: Base & { type: 'created' | 'saved'; layoutId: string; version: number }) =>
  audit.record(b.tx, {
    workspace_id: b.actor.workspace_id,
    actor_id: b.actor.actor_id,
    event_type: b.type === 'created' ? 'eqv.layout.draft_created' : 'eqv.layout.draft_saved',
    subject_type: 'eqv_layout',
    subject_id: b.subjectId,
    summary: b.summary,
    detail: { layoutId: b.layoutId, version: b.version },
  });

export const recordRevisionPublished = (b: Base & { layoutId: string; revision: string; draftVersion: number }) =>
  audit.record(b.tx, {
    workspace_id: b.actor.workspace_id,
    actor_id: b.actor.actor_id,
    event_type: 'eqv.layout.revision_published',
    subject_type: 'eqv_layout_revision',
    subject_id: b.subjectId,
    summary: b.summary,
    detail: { layoutId: b.layoutId, revision: b.revision, draftVersion: b.draftVersion },
  });

export const recordTemplatePromoted = (b: Base & { templateId: string; layoutId: string; revision: string }) =>
  audit.record(b.tx, {
    workspace_id: b.actor.workspace_id,
    actor_id: b.actor.actor_id,
    event_type: 'eqv.template.promoted',
    subject_type: 'eqv_template',
    subject_id: b.subjectId,
    summary: b.summary,
    detail: { templateId: b.templateId, layoutId: b.layoutId, revision: b.revision },
  });
