// Text the database or the wire cannot carry faithfully: NUL (Postgres text rejects it) and lone
// UTF-16 surrogates (the UTF-8 encoder would silently replace them).

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

export const unsafeText = (value: string): boolean =>
  value.includes('\u0000') || LONE_SURROGATE.test(value);
