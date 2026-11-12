import type { Call } from '../bundle/calls.js';
import type { Target } from '../bundle/targets.js';
import type { TargetSecrets } from '../bundle/secrets.js';

/** Outgoing (mapped) values only. Bindings retain their call sections, never executable text. */
export interface ConnectorLeg {
  targetId: string;
  call: Call;
  site: string | null;
  rooms: readonly string[];
  bindings: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}
export interface ConnectorQueryOptions {
  signal: AbortSignal;
  /** Target judgment budget in milliseconds, including acquisition; core remaining time minus 2 s. */
  deadlineMs: number;
  /** Maximum rows to pull, including the overflow sentinel. Never splice LIMIT into a statement. */
  rowCap: number;
}
export interface Connector {
  /** Must cancel the driver on signal abort AND iterator return; errors must have fixed messages and no cause. */
  query(leg: ConnectorLeg, options: ConnectorQueryOptions): AsyncIterable<unknown>;
}
export type ConnectorFactory = (target: Target, secrets: TargetSecrets | undefined) => Connector;
export type ConnectorFactories = Readonly<Partial<Record<Target['kind'], ConnectorFactory>>>;

/** Target's own judgment limit, distinct from a core transport deadline (504). */
export class TargetJudgmentTimeout extends Error {
  constructor() { super('menu-query target judgment timed out'); this.name = 'TargetJudgmentTimeout'; }
}
export interface RoutingLog {
  actorId: string;
  correlationId: string;
  endpointId: string;
  targetId: string;
}
