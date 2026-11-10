// The audit rows of the eqv writes (ids, versions and Revision hashes only: no document, no name). The caller owns the transaction, so
// the row commits or rolls back with the write it describes (FO ADR-0008).
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

// Onboarding (#1658, ADR-0139): scope ids, versions, hashes and the Binding's wall-clock only; never a rule, a dictionary or an Inventory.
type ScopeDetail = { level: 'global' | 'maker' | 'model' | 'equipment'; vendorId?: string; modelId?: string; equipmentId?: string };

const scopeDetail = (scope: ScopeDetail): ScopeDetail => ({
  level: scope.level,
  ...(scope.vendorId === undefined ? {} : { vendorId: scope.vendorId }),
  ...(scope.modelId === undefined ? {} : { modelId: scope.modelId }),
  ...(scope.equipmentId === undefined ? {} : { equipmentId: scope.equipmentId }),
});

export const recordAliasRules = (b: Base & { type: 'created' | 'saved'; scope: ScopeDetail; version: number }) =>
  audit.record(b.tx, {
    workspace_id: b.actor.workspace_id,
    actor_id: b.actor.actor_id,
    event_type: b.type === 'created' ? 'eqv.alias_rules.created' : 'eqv.alias_rules.saved',
    subject_type: 'eqv_alias_rules',
    subject_id: b.subjectId,
    summary: b.summary,
    detail: { ...scopeDetail(b.scope), version: b.version },
  });

export const recordTypeDictionary = (b: Base & { type: 'created' | 'saved'; scope: ScopeDetail; version: number }) =>
  audit.record(b.tx, {
    workspace_id: b.actor.workspace_id,
    actor_id: b.actor.actor_id,
    event_type: b.type === 'created' ? 'eqv.type_dictionary.created' : 'eqv.type_dictionary.saved',
    subject_type: 'eqv_type_dictionary',
    subject_id: b.subjectId,
    summary: b.summary,
    detail: { ...scopeDetail(b.scope), version: b.version },
  });

export const recordMappingPublished = (b: Base & { equipmentId: string; mappingHash: string; layoutRevision: string; effectiveFrom: string }) =>
  audit.record(b.tx, {
    workspace_id: b.actor.workspace_id,
    actor_id: b.actor.actor_id,
    event_type: 'eqv.mapping.published',
    subject_type: 'eqv_binding',
    subject_id: b.subjectId,
    summary: b.summary,
    detail: { equipmentId: b.equipmentId, mappingHash: b.mappingHash, layoutRevision: b.layoutRevision, effectiveFrom: b.effectiveFrom },
  });
