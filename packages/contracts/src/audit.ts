/** Audit event (docs/06 §13) shown by the platform AuditTimeline and read by the audit-trail ports (issue
 *  #50). One type for the timeline and the global list — no second DTO. The domain supplies events. */

export type AuditAction = 'create' | 'update' | 'retire' | 'sync';
export type AuditSource = 'user' | 'system';

/** Destination of the change (06 §22). Not an analysis Context. */
export type AuditTarget = {
  type: string; // EntityRef.type vocabulary. Not a contracts union.
  id: string; // opaque destination id. Callers must not parse it.
  scopeId: string | null; // site when the destination is site-partitioned; null when it has no site. Never inferred from id (ADR-0004).
};

export type AuditEvent = {
  id: string;
  /** When a person or system committed the change. Real instant, not §6.3 naive wall-clock. */
  at: string;
  /** Stable principal id. Not a translated title. Not the session user of a read. */
  actor: string;
  action: AuditAction;
  source: AuditSource;
  /** Required. No persisted events exist, so there is no optional shim. */
  target: AuditTarget;
  /** Field snapshot. Values may themselves be naive wall-clock. Not instants. */
  changes?: Record<string, [string | null, string | null]>;
  /** Recorded user text. Not a Text. Not translated (06 §23). */
  reason?: string;
};
