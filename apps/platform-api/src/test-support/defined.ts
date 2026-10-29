// Explicit narrowing for test values the fixtures guarantee (a seeded row, a returned cursor). A missing value fails
// the test with its name, which replaces a non-null assertion that would only fail later on a property access.
export function defined<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} to be defined`);
  return value;
}
