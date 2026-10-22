// `ApiResponse<T>` builder for the platform port (packages/contracts response.ts,
// http-adapter-contract §2). Shared by every judged read. `assessments` is empty and
// `trust` null for reads that have no mart to declare; `correlationId` is the request id.

import type { FastifyRequest } from 'fastify';

/** `OUTCOMES` of the root `packages/contracts/src/response.ts`; `outcome-vocabulary.test.ts` pins it. */
export const OUTCOMES = ['ok', 'empty', 'error', 'forbidden', 'too_large', 'timeout'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface ApiEnvelope<T> {
  outcome: Outcome;
  data: T | null;
  assessments: unknown[];
  trust: null;
  correlationId: string;
  message?: string;
}

export function envelope<T>(
  req: Pick<FastifyRequest, 'id'>,
  outcome: Outcome,
  data: T | null = null,
  message?: string,
): ApiEnvelope<T> {
  return {
    outcome,
    data,
    assessments: [],
    trust: null,
    correlationId: req.id,
    ...(message !== undefined ? { message } : {}),
  };
}
