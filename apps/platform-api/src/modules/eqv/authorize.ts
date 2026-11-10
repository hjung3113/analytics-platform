// Authorization of the eqv declarations: the module's declared menu permissions (`EQV_MENU_PERMISSIONS`, resolved by `platform-port/permissions.ts`: capability check,
// then the capability's Admin bypass). Real-server Site Scope is enforced by these capabilities alone until #1087 (ADR-0135).
import type { Tx } from '../../db/tx.js';
import type { CheckService } from '../permissions/check-service.js';
import type { Capability } from '@ap/feature-shared';
import { holdsMenuPermission, type PlatformActor } from '../platform-port/permissions.js';

export interface EqvDeps {
  checkService: CheckService;
}

export const eqvAuthorize =
  (deps: EqvDeps, capability: Capability) =>
  (actor: PlatformActor, tx?: Tx): Promise<boolean> =>
    holdsMenuPermission(deps.checkService, actor, capability, tx ? { tx } : {});
