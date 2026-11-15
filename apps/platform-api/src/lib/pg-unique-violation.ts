// #2040: the pg SQLSTATE/constraint behind a driver or drizzle wrapper, shared by modules that map a named unique index.
/** The pg error behind a driver or drizzle wrapper. */
function pgError(error: unknown): { code?: string; constraint?: string } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const e = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) {
      return { code: e.code, ...(typeof e.constraint === 'string' ? { constraint: e.constraint } : {}) };
    }
    current = e.cause;
  }
  return null;
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pg = pgError(error);
  return pg?.code === '23505' && pg.constraint === constraint;
}

