// Authorization of the eqv declarations: the permission table of `platform-port/permissions.ts` is the single source (capability check,
// then the module's Admin bypass). Real-server Site Scope is enforced by these capabilities alone until #1087 (ADR-0135).
import type { Tx } from '../../db/tx.js';
import type { CheckService } from '../permissions/check-service.js';
import { holdsPlatformPermission, type PlatformActor } from '../platform-port/permissions.js';

export interface EqvDeps {
  checkService: CheckService;
}

export const eqvAuthorize =
  (deps: EqvDeps, permission: string) =>
  (actor: PlatformActor, tx?: Tx): Promise<boolean> =>
    holdsPlatformPermission(deps.checkService, actor, permission, tx ? { tx } : {});
