const CHUNK_FAILURE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (CSS )?chunk .* failed/i;
const MAX_CAUSE_DEPTH = 3;

function matches(error: unknown, depth: number): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError' || CHUNK_FAILURE.test(error.message)) return true;
  return depth < MAX_CAUSE_DEPTH && matches(error.cause, depth + 1);
}

/**
 * A rejected `React.lazy` import: React caches the rejection on the lazy object, so only a reload can retry it. The one matcher for the shell, the components and the app host.
 * A wrapper that keeps the import error as `cause` (a bundler, a test runner, an error-reporting layer) still counts; the chain is followed a few levels only.
 */
export function isChunkLoadFailure(error: unknown): boolean {
  try { return matches(error, 0); } catch { return false; }
}
