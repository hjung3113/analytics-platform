import type { NavResolveResponse, RoleLevel } from '@ap/feature-shared';

import type { FindingsService } from '../findings/index.js';
import type { CheckService, DenyAndGrantRows } from '../permissions/check-service.js';
import type { SurveysService } from '../surveys/index.js';
import type { VocClustersService } from '../voc-clusters/index.js';
import { isAuthorizationAbsence } from '../permissions/read-utility.js';
import type { TaskRequestsService } from '../task-requests/index.js';
import type { TasksService } from '../tasks/index.js';
import type { CountVocsQuery, VocDisplayIdReader, VocReadService } from '../voc/index.js';

export interface NavActor {
  actor_id: string;
  workspace_id: string;
  role_level: RoleLevel;
}

/** Authorization-absence (permission.denied / permission.scope_required) → undefined; unexpected errors propagate. */
async function authorizationAbsent<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch (error) {
    if (isAuthorizationAbsence(error)) return undefined;
    throw error;
  }
}

type NavCountsDeps = {
  checkService?: CheckService;
  vocReadService: Pick<VocReadService, 'countVocsMany'>;
  findingsService: Pick<FindingsService, 'countFindings'>;
  surveysService: Pick<SurveysService, 'countSurvey'>;
  vocClustersService: Pick<VocClustersService, 'countClusters'>;
};

export function createNavCountsService(deps: NavCountsDeps) {
  async function getCounts(
    actor: NavActor,
    managedSystemId?: string,
  ): Promise<Record<string, number>> {
    const query = (view: CountVocsQuery['view'], tab?: CountVocsQuery['tab']): CountVocsQuery => ({
      view,
      ...(managedSystemId !== undefined ? { managed_system_id: managedSystemId } : {}),
      ...(tab !== undefined ? { tab } : {}),
    });
    const vocCountEntries = [
      ['voc.inbox', 'inbox'],
      ['voc.triage', 'triage'],
      ['voc.my', 'my'],
      ['voc.tab.high', 'triage', 'high'],
      ['voc.tab.unassigned', 'triage', 'unassigned'],
      ['voc.tab.untriaged', 'triage', 'untriaged'],
      ['voc.tab.waiting', 'triage', 'waiting'],
      ['voc.inbox.no-link', 'inbox', 'no-link'],
    ] as const;
    const queries = vocCountEntries.map(([, view, tab]) => query(view, tab));
    // A batch-level authorization absence omits every VOC key, like a per-key one.
    const batch = await authorizationAbsent(() => deps.vocReadService.countVocsMany({ actor, queries }));
    const vocCounts = Object.fromEntries(vocCountEntries.flatMap(([key], index) => {
      const value = batch?.[index];
      if (value instanceof Error && !isAuthorizationAbsence(value)) throw value;
      return typeof value === 'number' ? [[key, value] as const] : [];
    }));
    const args = { actor, ...(managedSystemId ? { managedSystemId } : {}) };
    const loadRows = deps.checkService?.loadCapabilityRows;
    let findingRows: Promise<DenyAndGrantRows> | undefined;
    // Keep separate Finding decisions for the point and scope policies.
    const readRows = loadRows ? () => findingRows ??= loadRows(actor, 'finding.read') : undefined;
    const [findings, surveys, vocClusters] = await Promise.all([
      authorizationAbsent(() => deps.findingsService.countFindings(args, readRows)),
      authorizationAbsent(() => deps.surveysService.countSurvey(actor, managedSystemId)),
      authorizationAbsent(() => deps.vocClustersService.countClusters(args, readRows)),
    ]);
    return {
      ...vocCounts,
      ...(findings === undefined ? {} : { 'findings.all': findings }),
      ...(surveys === undefined ? {} : { 'surveys.all': surveys }),
      ...(vocClusters === undefined ? {} : { 'voc.clusters': vocClusters }),
    };
  }
  return { getCounts };
}

export type NavCountsService = ReturnType<typeof createNavCountsService>;

// ── GET /nav/resolve (#731) ──────────────────────────────────────────────────

type NavResolveDeps = {
  vocReadService: VocDisplayIdReader;
  findingsService: Pick<FindingsService, 'resolveDisplayId'>;
  tasksService: Pick<TasksService, 'resolveDisplayId'>;
  taskRequestsService: Pick<TaskRequestsService, 'resolveDisplayId'>;
};

export interface NavResolveService {
  /**
   * Display id → route intent, or null when the record is missing,
   * foreign-workspace, or not readable under the owning module's detail-read
   * authority (identical outcomes — the route answers one 404 for all three).
   * `displayId` arrives pre-normalised (trim + upper-case) from the route.
   */
  resolve(actor: NavActor, displayId: string): Promise<NavResolveResponse | null>;
}

export function createNavResolveService(deps: NavResolveDeps): NavResolveService {
  async function resolve(actor: NavActor, displayId: string): Promise<NavResolveResponse | null> {
    // The route's query schema guarantees the `^PREFIX-[1-9][0-9]*$` shape.
    const prefix = displayId.slice(0, displayId.indexOf('-'));
    if (prefix === 'VOC') {
      const hit = await authorizationAbsent(() =>
        deps.vocReadService.resolveDisplayId({ actor, displayId }),
      );
      return hit
        ? {
            entity_type: 'voc',
            id: hit.id,
            display_id: displayId,
            route_intent: { route: '/vocs', search: { view: 'inbox', selected: hit.id } },
          }
        : null;
    }
    if (prefix === 'FIN') {
      const hit = await authorizationAbsent(() =>
        deps.findingsService.resolveDisplayId({ actor, displayId }),
      );
      return hit
        ? {
            entity_type: 'finding',
            id: hit.id,
            display_id: displayId,
            route_intent: { route: '/findings', search: { selected: hit.id } },
          }
        : null;
    }
    if (prefix === 'REQ') {
      const hit = await authorizationAbsent(() =>
        deps.taskRequestsService.resolveDisplayId({ actor, displayId }),
      );
      return hit
        ? {
            entity_type: 'task_request',
            id: hit.id,
            display_id: displayId,
            // `/tasks` reads `param` (tasksSearchSchema), unlike `/vocs` + `/findings`.
            route_intent: { route: '/tasks', search: { view: 'requests', param: hit.id } },
          }
        : null;
    }
    const hit = await authorizationAbsent(() =>
      deps.tasksService.resolveDisplayId({ actor, displayId }),
    );
    return hit
      ? {
          entity_type: 'task',
          id: hit.id,
          display_id: displayId,
          route_intent: { route: '/tasks', search: { view: 'board', param: hit.id } },
        }
      : null;
  }
  return { resolve };
}
