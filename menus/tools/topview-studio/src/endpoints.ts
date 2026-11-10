/**
 * @ap/menu-topview-studio — the Layouts menu (#1654, #1607 step 6): declarations of the server `eqv` module's six Studio reads and
 * three writes, copied exactly from `apps/platform-api/src/modules/eqv/{endpoints,actions,menu}.ts` (a drift test compares them).
 * Client-safe: no `@eqv/*` import here, because the mock and the server test import this file. Documents are plain JSON
 * (`LayoutJson`); the screen validates them with `@eqv/core`.
 */
import { defineAction, defineEndpoint, menuPermission } from '@ap/contracts';

export const EQV_STUDIO_MENU_ID = 'eqv-studio';

/** Entry permission of this menu: a platform permission with the same capability (`eqv.view`) as `eqv:view`, because the Kernel registry refuses a second non-module menu on an `eqv:*` name. */
export const STUDIO_VIEW_PERMISSION = menuPermission('eqv-studio:view');
/** What the server's reads declare (the module's namespace); the menu itself is entered with `STUDIO_VIEW_PERMISSION`. */
export const EQV_READ_PERMISSION = menuPermission('eqv:view');
export const LAYOUT_EDIT_PERMISSION = menuPermission('eqv-studio:layout-edit');
export const LAYOUT_PUBLISH_PERMISSION = menuPermission('eqv-studio:layout-publish');

/** A Layout or Template document as it travels: validated by `@eqv/core` on the screen and, finally, on the server. */
export type LayoutJson = Record<string, unknown> & { id: string; kind: string };

export const REVISION_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const TEMPLATE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export type LayoutRow = { id: string; layoutId: string; version: string; updatedAt: string };
export type LayoutDraft = { id: string; layoutId: string; version: string; document: LayoutJson; updatedAt: string };
export type RevisionRow = { id: string; layoutId: string; revision: string; publishedAt: string };
export type RevisionRead = RevisionRow & { document: LayoutJson };
export type TemplateRow = { id: string; templateId: string; name: string; promotedFromLayoutId: string; promotedFromRevision: string; createdAt: string };
export type TemplateRead = TemplateRow & { document: LayoutJson };

type LayoutParams = { layoutId: string };
type RevisionParams = { layoutId: string; revision: string };
type TemplateParams = { templateId: string };
type NoParams = Record<never, true>;

const read = <P, T>(id: string, paramKeys: Record<keyof P & string, true>) =>
  defineEndpoint<P, T>({ id, menuId: EQV_STUDIO_MENU_ID, paramKeys, permission: EQV_READ_PERMISSION, requiresScope: false, context: {}, kinds: [], mergeTimeDomain: false });

export const layoutsEndpoint = read<NoParams, { rows: LayoutRow[] }>('eqv.layouts', {});
/** Answers `empty` (data null) while the Layout has no draft. */
export const layoutDraftEndpoint = read<LayoutParams, LayoutDraft | null>('eqv.layoutDraft', { layoutId: true });
export const layoutRevisionsEndpoint = read<LayoutParams, { rows: RevisionRow[] }>('eqv.layoutRevisions', { layoutId: true });
export const layoutRevisionEndpoint = read<RevisionParams, RevisionRead | null>('eqv.layoutRevision', { layoutId: true, revision: true });
export const templatesEndpoint = read<NoParams, { rows: TemplateRow[] }>('eqv.templates', {});
export const templateEndpoint = read<TemplateParams, TemplateRead | null>('eqv.template', { templateId: true });

/** The six reads in the server's order. */
export const studioReadSpecs = [layoutsEndpoint, layoutDraftEndpoint, layoutRevisionsEndpoint, layoutRevisionEndpoint, templatesEndpoint, templateEndpoint] as const;

export type SaveDraftInput = { layoutId: string; document: LayoutJson };
export type SaveDraftResult = { id: string; layoutId: string; version: string };
export type PublishRevisionInput = { layoutId: string };
export type PublishRevisionResult = { id: string; layoutId: string; revision: string; created: boolean };
export type PromoteTemplateInput = { layoutId: string; revision: string; templateId: string; name: string };
export type PromoteTemplateResult = { id: string; templateId: string };

/** `expectedVersion: '0'` creates the first draft; later saves carry the version the author saw. */
export const saveDraft = defineAction<SaveDraftInput, SaveDraftResult>({
  id: 'eqv.saveDraft', menuId: EQV_STUDIO_MENU_ID, inputKeys: { layoutId: true, document: true }, permission: LAYOUT_EDIT_PERMISSION,
  requiresScope: false, concurrency: 'version', invalidates: [layoutsEndpoint, layoutDraftEndpoint],
});
/** `expectedVersion` is the draft version the author saw. `created: false` means the same Revision already existed. */
export const publishRevision = defineAction<PublishRevisionInput, PublishRevisionResult>({
  id: 'eqv.publishRevision', menuId: EQV_STUDIO_MENU_ID, inputKeys: { layoutId: true }, permission: LAYOUT_PUBLISH_PERMISSION,
  requiresScope: false, concurrency: 'version', invalidates: [layoutRevisionsEndpoint, layoutRevisionEndpoint],
});
export const promoteTemplate = defineAction<PromoteTemplateInput, PromoteTemplateResult>({
  id: 'eqv.promoteTemplate', menuId: EQV_STUDIO_MENU_ID, inputKeys: { layoutId: true, revision: true, templateId: true, name: true }, permission: LAYOUT_PUBLISH_PERMISSION,
  requiresScope: false, concurrency: 'none', invalidates: [templatesEndpoint, templateEndpoint],
});

/** The three writes in the server's order. */
export const studioActionSpecs = [saveDraft, publishRevision, promoteTemplate] as const;
