/** Audit event shown by the platform AuditTimeline (docs/06 §13). The domain supplies events. */
export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: 'create' | 'update' | 'retire' | 'sync';
  /** field → [before, after]; null = absent */
  changes?: Record<string, [string | null, string | null]>;
  reason?: string;
  source: 'user' | 'system';
};
