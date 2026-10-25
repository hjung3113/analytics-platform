import type {
  AccessDirectoryPage,
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
  PlatformAdapter,
  ScopeCheck,
  SelectionEvaluation,
  SelectionInput,
  SelectionResolveResult,
  UsageEvent,
  UsageRange,
  UsageSummary,
} from '@ap/contracts';
import { isRecord } from '@ap/contracts';
import { envelopeCall, actionCall, plainCall, portCall, TransportError, type CallContext, type PlainReply } from './calls.js';
import type { SessionStore } from './session.js';
import type { Transport } from './transport.js';

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

/** 422 means the server could not even parse the body: a judged rejection, so it resolves (contract §2.2). */
const isUnparsableBody = (error: unknown) => error instanceof TransportError && error.code === 'http_422';
