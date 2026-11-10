// The eqv writes as menu-dispatch actions (#1645, ADR-0135): saveDraft, publishRevision, promoteTemplate. Each writes its audit row in
// the same transaction, answers ids and versions (never a document body: the replay record holds 128 KiB), and judges the Layout with
// `@eqv/core`'s `validateLayout` before anything is stored (a `hierarchy-cycle` is refused, EV#170). «승인» is the capability check of
// `eqv.layout.publish` — no separate approval flow (ADR-0135).
//
// Version contract of saveDraft: `currentVersion` answers `'0'` while no draft exists (never `null`, which the engine turns into
// `not_found`), so a client creates a draft with `expectedVersion: '0'`; the first row has version 1; `'0'` against an existing draft is
// a `conflict`. A per-layout advisory lock taken in `currentVersion` makes a creation race a conflict for the loser.
import { layoutRevision, promoteLayout, validateLayout } from '@eqv/core';

import type { Tx } from '../../db/tx.js';
import { type FieldError, type MenuActionDeclaration, MenuActionInvalidError } from '../menu-dispatch/types.js';
import { type EqvDeps, eqvAuthorize } from './authorize.js';
import { recordDraft, recordRevisionPublished, recordTemplatePromoted } from './audit.js';
import { checkEquipmentLayout, isBundledTemplateId, isLayoutId, nameProblem, REVISION_PATTERN } from './domain/layout-checks.js';
import { EQV_EDIT_PERMISSION, EQV_PUBLISH_PERMISSION, EQV_STUDIO_MENU_ID } from './menu.js';
import * as write from './repositories/eqv-write.js';
import { lockKey } from './repositories/eqv-write.js';

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function eqvActions(deps: EqvDeps): MenuActionDeclaration[] {
  const edit = eqvAuthorize(deps, EQV_EDIT_PERMISSION);
  const publish = eqvAuthorize(deps, EQV_PUBLISH_PERMISSION);
  const S = EQV_STUDIO_MENU_ID;

  const saveDraft: MenuActionDeclaration = {
    spec: {
      id: 'eqv.saveDraft',
      menuId: S,
      inputKeys: ['layoutId', 'document'],
      permission: EQV_EDIT_PERMISSION,
      requiresScope: false,
      concurrency: 'version',
      invalidates: ['eqv.layouts', 'eqv.layoutDraft'],
    },
    authorize: (actor, tx) => edit(actor, tx),
    validate(input) {
      if (!isLayoutId(input.layoutId)) return [{ path: ['layoutId'], code: 'invalid' }];
      if (!isObject(input.document)) return [{ path: ['document'], code: 'invalid' }];
      const checked = checkEquipmentLayout(input.layoutId, input.document);
      return checked.ok ? [] : checked.errors;
    },
    async currentVersion(tx, actor, input) {
      const row = await write.lockedDraft(tx, actor.workspace_id, String(input.layoutId));
      return row ? String(row.version) : '0';
    },
    async handle(tx, actor, input) {
      const layoutId = String(input.layoutId);
      const checked = checkEquipmentLayout(layoutId, input.document);
      if (!checked.ok) throw invalid(...checked.errors);
      // Only the validated layout is stored.
      const document = checked.layout;
      const existing = await write.lockedDraft(tx, actor.workspace_id, layoutId);
      if (!existing) {
        const row = await write.insertDraft(tx, { workspaceId: actor.workspace_id, layoutId, document, actorId: actor.actor_id });
        await recordDraft({ tx, actor, type: 'created', subjectId: row.id, layoutId, version: row.version, summary: `Layout ${layoutId} draft created` });
        return { data: { id: row.id, layoutId, version: String(row.version) }, version: String(row.version) };
      }
      const row = await write.updateDraft(tx, { id: existing.id, workspaceId: actor.workspace_id, document, actorId: actor.actor_id });
      await recordDraft({ tx, actor, type: 'saved', subjectId: row.id, layoutId, version: row.version, summary: `Layout ${layoutId} draft saved` });
      return { data: { id: row.id, layoutId, version: String(row.version) }, version: String(row.version) };
    },
  };

  const publishRevision: MenuActionDeclaration = {
    spec: {
      id: 'eqv.publishRevision',
      menuId: S,
      inputKeys: ['layoutId'],
      permission: EQV_PUBLISH_PERMISSION,
      requiresScope: false,
      concurrency: 'version',
      invalidates: ['eqv.layoutRevisions', 'eqv.layoutRevision'],
    },
    authorize: (actor, tx) => publish(actor, tx),
    validate: (input) => (isLayoutId(input.layoutId) ? [] : [{ path: ['layoutId'], code: 'invalid' }]),
    // The version the author saw is the draft's: only that draft is published. No draft → null → not_found.
    async currentVersion(tx, actor, input) {
      const row = await write.lockedDraft(tx, actor.workspace_id, String(input.layoutId));
      return row ? String(row.version) : null;
    },
    async handle(tx, actor, input) {
      const layoutId = String(input.layoutId);
      const draft = await write.lockedDraft(tx, actor.workspace_id, layoutId);
      if (!draft) throw invalid({ path: ['layoutId'], code: 'not_found' });
      // The server's verdict is final, again at publish time.
      const checked = checkEquipmentLayout(layoutId, draft.document);
      if (!checked.ok) throw invalid(...checked.errors.map((e) => ({ ...e, path: ['draft', ...e.path.slice(1)] })));
      const revision = await layoutRevision(checked.layout);
      const version = String(draft.version);
      const existing = await write.findRevision(tx, actor.workspace_id, layoutId, revision);
      // The same hash again answers ok with the existing Revision and writes nothing more (no second audit row).
      if (existing) return { data: { id: existing.id, layoutId, revision, created: false }, version };
      const row = await write.insertRevision(tx, { workspaceId: actor.workspace_id, layoutId, revision, document: checked.layout, actorId: actor.actor_id });
      await recordRevisionPublished({
        tx, actor, subjectId: row.id, layoutId, revision, draftVersion: draft.version, summary: `Layout ${layoutId} revision published`,
      });
      return { data: { id: row.id, layoutId, revision, created: true }, version };
    },
  };

  const promoteTemplate: MenuActionDeclaration = {
    spec: {
      id: 'eqv.promoteTemplate',
      menuId: S,
      inputKeys: ['layoutId', 'revision', 'templateId', 'name'],
      permission: EQV_PUBLISH_PERMISSION,
      requiresScope: false,
      concurrency: 'none',
      invalidates: ['eqv.templates', 'eqv.template'],
    },
    authorize: (actor, tx) => publish(actor, tx),
    validate(input) {
      const errors: FieldError[] = [];
      if (!isLayoutId(input.layoutId)) errors.push({ path: ['layoutId'], code: 'invalid' });
      if (typeof input.revision !== 'string' || !REVISION_PATTERN.test(input.revision)) errors.push({ path: ['revision'], code: 'invalid' });
      if (!isLayoutId(input.templateId)) errors.push({ path: ['templateId'], code: 'invalid' });
      else if (isBundledTemplateId(input.templateId)) errors.push({ path: ['templateId'], code: 'bundled_template_id' });
      const name = nameProblem(input.name);
      if (name) errors.push(name);
      return errors;
    },
    async handle(tx: Tx, actor, input) {
      const layoutId = String(input.layoutId);
      const revision = String(input.revision);
      const templateId = String(input.templateId);
      const name = String(input.name).trim();
      await lockKey(tx, 'template', actor.workspace_id, templateId);
      // EV ADR-0015: a Template comes from a published Layout Revision.
      const source = await write.findRevision(tx, actor.workspace_id, layoutId, revision);
      if (!source) throw invalid({ path: ['revision'], code: 'not_found' });
      const checked = checkEquipmentLayout(layoutId, source.document, ['revision']);
      if (!checked.ok) throw invalid(...checked.errors);
      if ((await layoutRevision(checked.layout)) !== revision) throw invalid({ path: ['revision'], code: 'hash_mismatch' });
      if (await write.templateExists(tx, actor.workspace_id, templateId)) throw invalid({ path: ['templateId'], code: 'duplicate' });
      let template;
      try {
        template = promoteLayout(checked.layout, { templateId, name, layoutRevision: revision });
      } catch (error) {
        if (error instanceof RangeError) throw invalid({ path: ['templateId'], code: 'invalid' });
        throw error;
      }
      const result = validateLayout(template);
      if (!result.ok) {
        throw invalid(...result.issues.slice(0, 20).map((i) => ({ path: ['template', ...i.path.map(String)], code: i.code })));
      }
      // Store the validated result, like a Layout.
      const row = await write.insertTemplate(tx, { workspaceId: actor.workspace_id, templateId, name, document: result.layout, layoutId, revision, actorId: actor.actor_id });
      await recordTemplatePromoted({ tx, actor, subjectId: row.id, templateId, layoutId, revision, summary: `Template ${templateId} promoted` });
      return { data: { id: row.id, templateId }, version: null };
    },
  };

  return [saveDraft, publishRevision, promoteTemplate];
}
