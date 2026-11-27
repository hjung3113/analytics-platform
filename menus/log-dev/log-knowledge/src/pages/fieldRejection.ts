/** The one live announcement of a server rejection mapped onto fields (#2574). */
export const SERVER_FIELDS_SUMMARY = '표시된 칸을 확인해 주세요.';

/**
 * Field errors carry no live role: they are their controls' descriptions, read when focus reaches them (components.md, `FormField`
 * errors). So a server rejection mapped onto fields is announced once, by the form line: this returns `mapped` with
 * `form` set to the summary when a key other than `form` and the caller's `selfAnnounced` keys (errors with their own alert) was
 * mapped. A server `form` text wins. The given map is not changed.
 */
export function withFieldsSummary(mapped: Readonly<Record<string, string>>, selfAnnounced: readonly string[] = []): Record<string, string> {
  const fieldMapped = Object.keys(mapped).some(key => key !== 'form' && !selfAnnounced.includes(key));
  return fieldMapped && mapped['form'] === undefined ? { ...mapped, form: SERVER_FIELDS_SUMMARY } : { ...mapped };
}
