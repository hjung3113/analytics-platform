import { viewerOf } from '../log-knowledge/index.js';
// The `validation_round` attachment parent (#1451, design D6): who may download a round's manual validation attachment. Read right =
// the right to read the round itself: `platform:view` (every workspace user) and the round exists in the actor's
// workspace. A round of another workspace, an unknown round id and a missing `platform:view` all answer
// `permission.denied`; nothing here consults VOC rights, and VOC rights never reach this kind. The write right
// (`lifecycle.round.manage`) is the `roundEvidenceAttach` action's. The workspace is also gated by the attachment's
// storage-key prefix before this runs.

import { HttpError } from '../../lib/errors.js';
import type { AttachmentParentReader } from '../attachments/index.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import type { LogLifecycleDeps } from './deps.js';
import { roundInWorkspace } from './repositories/lifecycle-read.js';

export function roundAttachmentParent(deps: Pick<LogLifecycleDeps, 'db' | 'checkService'>): AttachmentParentReader {
  const denied = () => new HttpError('permission.denied', 'attachment not accessible to caller');
  return {
    kind: 'validation_round',
    async assertCanRead({ actor, row }) {
      if (!row.parent_id) throw denied();
      if (!(await holdsPlatformPermission(deps.checkService, actor, 'platform:view'))) throw denied();
      if (!(await roundInWorkspace(deps.db, actor.workspace_id, row.parent_id, viewerOf(actor)))) throw denied();
    },
  };
}
