// Types of the 합성 fixture reference worker (validation-worker-mock.mjs).
export const MOCK_QUEUE_PREFIX: string;
export const MODES: readonly string[];
export interface MockClaimBody {
  request: { id: string; sampleManifestDigest: string; sampleSet: { files: { fileRef: string; order: number; sha256: string }[] } };
  attempt: { id: string; attemptNo: number };
}
export interface MockResponse {
  status: number;
  body: any;
}
export type MockSend = (method: 'POST', path: string, body: unknown) => Promise<MockResponse>;
export function syntheticResult(claim: MockClaimBody, mode?: string): Record<string, unknown>;
export function runMockWorker(opts: {
  send: MockSend;
  mode?: string;
  heartbeats?: number;
  build?: (claim: MockClaimBody, mode: string) => Record<string, unknown>;
}): Promise<{ claimed: boolean; request?: any; attempt?: any; resultBody?: Record<string, unknown>; result?: MockResponse; heartbeat?: MockResponse; error?: MockResponse }>;
