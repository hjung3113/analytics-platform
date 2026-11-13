const CHUNK_FAILURE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (CSS )?chunk .* failed/i;

/** A rejected `React.lazy` import: React caches the rejection on the lazy object, so only a reload can retry it. The one matcher for the shell, the components and the app host. */
export function isChunkLoadFailure(error: unknown): boolean {
  try { return error instanceof Error && (error.name === 'ChunkLoadError' || CHUNK_FAILURE.test(error.message)); } catch { return false; }
}
