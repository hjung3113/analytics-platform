import { useState } from 'react';
import type { Action, Params, WriteResult } from './contracts';
import { writeFailure } from './presentation';

export function useDatasetWrite(action: Action) {
  const [result, setResult] = useState<WriteResult | null>(null);
  const [working, setWorking] = useState(false);
  async function execute(call: () => Promise<WriteResult>) {
    setWorking(true);
    try { const next = await call(); setResult(next); return next; }
    catch (cause) { setResult(writeFailure(cause)); return null; }
    finally { setWorking(false); }
  }
  return { result, pending: working || action.pending, submit: (input: Params, options?: { expectedVersion?: string }) => execute(() => options ? action.run(input, options) : action.run(input)), retry: () => { if (result?.retry) void execute(result.retry); } };
}
