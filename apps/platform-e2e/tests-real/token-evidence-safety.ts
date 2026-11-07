/** Credential tests intentionally replace caught errors: even a locator error may contain page text. */
export async function withTokenEvidenceSafety(run: () => Promise<void>, revoke: () => Promise<void>, close: () => Promise<unknown>): Promise<void> {
  let failed = false;
  try { await run(); } catch { failed = true; }
  finally {
    try { await revoke(); } catch { failed = true; }
    if (failed) { try { await close(); } catch { /* Fixed diagnostics below also cover teardown errors. */ } }
  }
  if (failed) throw new Error('API token flow failed; credential diagnostics suppressed and page closed.');
}
