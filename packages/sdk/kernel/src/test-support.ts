// Test-only helpers shared by kernel tests. Import only from test files; not exported from src/index.ts or @ap/kernel/testing.

/** The item at `index`; throws when it is missing, so a test that reads `xs[0].x` still fails loudly under `noUncheckedIndexedAccess`. */
export function at<T>(xs: readonly T[], index: number): T {
  const item = xs[index];
  if (item === undefined) throw new Error(`missing item ${index}`);
  return item;
}
