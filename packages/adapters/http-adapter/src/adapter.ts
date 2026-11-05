import type {
  AccessDirectoryPage,
  ActionResponse,
  AccessDirectoryQuery,
  AnnotationInput,
  AnnotationRef,
  ApiResponse,
  AuditTrailPage,
  AuditTrailQuery,
  AxisOptionsPage,
  ChartAnnotation,
  ClientErrorReport,
  ConditionOptions,
  EntityAuditPage,
  EntityAuditRequest,
  EntityRef,
  EquipmentSearchPage,
  GroupMember,
  Notice,
  PreferencesSnapshot,
  PlatformAdapter,
  NoticeListPage,
  Quest,
  QuestSearchPage,
  ScopeCheck,
  SelectionEvaluation,
  SelectionInput,
  SelectionResolveResult,
  UsageEvent,
  UsageNextQuery,
  UsageNextScreens,
  UsageRange,
  UsageSummary,
} from '@ap/contracts';
import { isRecord, type MenuAction } from '@ap/contracts';
import { envelopeCall, actionCall, plainCall, portCall, TransportError, type CallContext, type PlainReply } from './calls/calls.js';
import { isQuest, isQuestSearchPage } from './validate.js';
import type { SessionStore } from './session/session.js';
import type { Transport } from './calls/transport.js';

const PLATFORM = '/api/v1/platform';

export type AdapterConfig = {
  transport: Transport;
  store: SessionStore;
  timeoutMs: number;
  fireAndForgetTimeoutMs: number;
};

/** A 2xx whose body is not the documented type is a broken response, not a result; it keeps the response's correlation id. */
function shaped<T>({ value, correlationId }: PlainReply, ok: (record: Record<string, unknown>) => boolean): T {
  if (!isRecord(value) || !ok(value)) throw new TransportError('invalid_response', correlationId);
  return value as T;
}

const isPage = (r: Record<string, unknown>) => Array.isArray(r['items']) && (r['nextCursor'] === null || typeof r['nextCursor'] === 'string');

/** Maps every `PlatformAdapter` member to its HTTP call (contract §1). */
export function createHttpAdapter(config: AdapterConfig): PlatformAdapter {
  const { store } = config;
  const context: CallContext = config;
  const envelope = <T>(request: Parameters<typeof envelopeCall>[1], signal?: AbortSignal, csrf = false) =>
    envelopeCall<T>(context, request, { signal, csrf });

  return {
    session: () => store.session(),
    publishedMetrics: () => store.publishedMetrics(),
    defaultRangeTo: () => store.defaultRangeTo(),
    subscribe: (onChange) => store.subscribe(onChange),

    async validateScope(scopeId, signal) {
      const value = await plainCall(context, { method: 'GET', path: `${PLATFORM}/scopes/${encodeURIComponent(scopeId)}/check` }, { signal });
      return shaped<ScopeCheck>(value, (r) => typeof r['status'] === 'string' && Array.isArray(r['grantedRooms']));
    },
    async contextOptions(scopeId, signal) {
      const value = await plainCall(context, { method: 'GET', path: `${PLATFORM}/context-options`, query: { scopeId } }, { signal });
      return shaped<ConditionOptions>(value, (r) => Array.isArray(r['stgroup']) && Array.isArray(r['team']) && Array.isArray(r['makerModel']));
    },
    async evaluateSelection(input: SelectionInput, signal) {
      const value = await plainCall(context, { method: 'POST', path: `${PLATFORM}/selection/evaluate`, body: input }, { signal });
      return shaped<SelectionEvaluation>(value, (r) => Array.isArray(r['inCondition']) && Array.isArray(r['outOfCondition']));
    },
    async listAxisOptions(input, signal) {
      return shaped<AxisOptionsPage>(await portCall(context, { method: 'POST', path: `${PLATFORM}/axis-options`, body: input }, signal), isPage);
    },
    async searchEquipment(input, signal) {
      return shaped<EquipmentSearchPage>(await portCall(context, { method: 'POST', path: `${PLATFORM}/equipment-search`, body: input }, signal), isPage);
    },
    async resolveSelection(input, signal) {
      return shaped<SelectionResolveResult>(await portCall(context, { method: 'POST', path: `${PLATFORM}/selection-resolve`, body: input }, signal), (r) => Array.isArray(r['items']));
    },

    getEntity: (ref: EntityRef, signal) => envelope({ method: 'POST', path: `${PLATFORM}/entity`, body: ref }, signal),
    menuQuery: (req, signal) => envelope({ method: 'POST', path: '/api/v1/menu-query', body: req }, signal),
    menuAction: (req, signal) => actionCall(context, { method: 'POST', path: '/api/v1/menu-action', body: req }, req, signal),

    usageSummary(range: UsageRange, signal): Promise<ApiResponse<UsageSummary>> {
      const query = 'preset' in range ? { preset: range.preset } : { from: String(range.from), to: String(range.to) };
      return envelope({ method: 'GET', path: `${PLATFORM}/usage-summary`, query }, signal);
    },
    usageNextScreens: (query: UsageNextQuery, signal): Promise<ApiResponse<UsageNextScreens>> =>
      envelope({ method: 'POST', path: `${PLATFORM}/usage-next-screens`, body: query.includeBack === undefined ? { menuId: query.menuId } : { menuId: query.menuId, includeBack: query.includeBack } }, signal),
    auditTrail: (query: AuditTrailQuery, signal): Promise<ApiResponse<AuditTrailPage>> =>
      envelope({ method: 'POST', path: `${PLATFORM}/audit-trail/search`, body: query }, signal),
    // The cursor is on the wire only when there is one: the first page sends the bare ref.
    entityAudit: ({ cursor, ...ref }: EntityAuditRequest, signal): Promise<ApiResponse<EntityAuditPage>> =>
      envelope({ method: 'POST', path: `${PLATFORM}/entity/audit`, body: cursor === undefined ? ref : { ...ref, cursor } }, signal),
    accessDirectory: (query: AccessDirectoryQuery, signal): Promise<ApiResponse<AccessDirectoryPage>> =>
      envelope({ method: 'POST', path: `${PLATFORM}/access-directory/search`, body: query }, signal),

    // A null scope is sent as "no scopeId": the server answers `forbidden`, never "all sites" (adapter.ts).
    listAnnotations: (ref: AnnotationRef, signal): Promise<ApiResponse<{ items: readonly ChartAnnotation[] }>> =>
      envelope({ method: 'GET', path: `${PLATFORM}/annotations`, query: { chartId: ref.chartId, scopeId: ref.scopeId ?? undefined } }, signal),
    saveAnnotation: (input: AnnotationInput, signal): Promise<ApiResponse<ChartAnnotation>> =>
      envelope({ method: 'POST', path: `${PLATFORM}/annotations`, body: input }, signal, true),
    deleteAnnotation: (ref, signal): Promise<ApiResponse<{ id: string }>> =>
      envelope({ method: 'POST', path: `${PLATFORM}/annotations/delete`, body: { chartId: ref.chartId, scopeId: ref.scopeId, id: ref.id } }, signal, true),

    // Preferences (ADR-0098): the session user is the cookie's, never a field. Writes are CSRF POSTs; a patch is a POST because `Transport` has no PATCH.
    readPreferences: (signal): Promise<ApiResponse<PreferencesSnapshot>> => envelope({ method: 'GET', path: `${PLATFORM}/preferences` }, signal),
    patchPreferences: (patch, signal): Promise<ApiResponse<PreferencesSnapshot>> => envelope({ method: 'POST', path: `${PLATFORM}/preferences/patch`, body: patch }, signal, true),
    importPreferences: (input, signal): Promise<ApiResponse<PreferencesSnapshot>> => envelope({ method: 'POST', path: `${PLATFORM}/preferences/import`, body: input }, signal, true),

    // People: an exact id batch. A judged 4xx `{code,message,field?}` is a PortError like the selection ports; a missing person is simply absent.
    async lookupPeople(ids, signal) {
      return shaped<{ items: readonly GroupMember[] }>(await portCall(context, { method: 'POST', path: `${PLATFORM}/people/lookup`, body: { ids } }, signal), (r) => Array.isArray(r['items'])).items;
    },

    // Notices: reads are envelopes, writes are action envelopes carrying `Idempotency-Key` and `If-Match` (the version) like `menuAction`.
    listNotices: (signal): Promise<ApiResponse<NoticeListPage>> => envelope({ method: 'GET', path: `${PLATFORM}/notices` }, signal),
    saveNotice: (input, signal) =>
      actionCall(context, { method: 'POST', path: `${PLATFORM}/notices/save`, body: input }, noticeAction('notice.save', input), signal) as Promise<ActionResponse<Notice>>,
    deleteNotice: (input, signal) =>
      actionCall(context, { method: 'POST', path: `${PLATFORM}/notices/delete`, body: input }, noticeAction('notice.delete', input), signal) as Promise<ActionResponse<{ id: string }>>,

    // Quests (#1328, read-only): envelope reads. A reply whose `ok` data is not exactly the documented shape is a broken response, never passed on.
    async getQuest(id, signal) {
      // `''`, `.` and `..` and a lone surrogate never reach the server: a dot segment re-aims the path (URL parsers also fold `%2e`), a lone surrogate cannot be encoded; each answers the same `error` envelope as the server would. A non-string drift-probe argument still sends.
      if (id === '' || id === '.' || id === '..' || /[\uD800-\uDFFF]/u.test(id)) return invalidInput<Quest>();
      return guarded(await envelope<Quest>({ method: 'GET', path: `${PLATFORM}/quests/${encodeURIComponent(id)}` }, signal), isQuest);
    },
    async searchQuests(input, signal) {
      // The page a search answers must be the page that was asked: the same `page`, at most the requested `pageSize` items — a rule against the request, so the caller checks it (the wire schema cannot tie data to its request).
      return guarded(await envelope<QuestSearchPage>({ method: 'POST', path: `${PLATFORM}/quests/search`, body: input }, signal), (page) => isQuestSearchPage(page) && page.page === input.page && page.items.length <= input.pageSize);
    },

    async recordUsage(events: readonly UsageEvent[]) {
      try {
        const value = await plainCall(
          context,
          { method: 'POST', path: `${PLATFORM}/usage-events`, body: { events } },
          { csrf: true, keepalive: true, timeoutMs: config.fireAndForgetTimeoutMs },
        );
        return shaped<{ accepted: number }>(value, (r) => typeof r['accepted'] === 'number');
      } catch (error) {
        if (isUnparsableBody(error)) return { accepted: 0 };
        throw error;
      }
    },
    async reportClientError(report: ClientErrorReport) {
      try {
        const value = await plainCall(
          context,
          { method: 'POST', path: `${PLATFORM}/client-errors`, body: report },
          { csrf: true, timeoutMs: config.fireAndForgetTimeoutMs, correlationId: report.correlationId },
        );
        return shaped<{ accepted: boolean }>(value, (r) => typeof r['accepted'] === 'boolean');
      } catch (error) {
        if (isUnparsableBody(error)) return { accepted: false };
        throw error;
      }
    },
  };
}

/** A read that cannot be sent (an unsendable id) never reaches the server; it answers the same `error` the server would. */
const invalidInput = <T>(): ApiResponse<T> => ({ outcome: 'error', data: null, assessments: [], trust: null, correlationId: '', message: 'invalid_input' });

/** `ok` data must pass `valid`, else the reply is an `error` that keeps its correlation id. Any other outcome carries no data (a Quest port answers `empty` or `error` with `data: null`). */
function guarded<T>(reply: ApiResponse<T>, valid: (data: T) => boolean): ApiResponse<T> {
  if (reply.outcome === 'ok') return reply.data !== null && valid(reply.data) ? reply : { outcome: 'error', data: null, assessments: [], trust: null, correlationId: reply.correlationId, message: 'invalid_response' };
  return reply.data === null ? reply : { ...reply, data: null };
}

/** The write headers of a notice request come from its own fields; the body is sent as given (no client-side pre-validation). */
const noticeAction = (action: string, input: { idempotencyKey: string; expectedVersion?: string }): MenuAction =>
  ({ action, context: {}, input, idempotencyKey: input.idempotencyKey, ...(input.expectedVersion === undefined ? {} : { expectedVersion: input.expectedVersion }) });

/** 422 means the server could not even parse the body: a judged rejection, so it resolves (contract §2.2). */
const isUnparsableBody = (error: unknown) => error instanceof TransportError && error.code === 'http_422';
