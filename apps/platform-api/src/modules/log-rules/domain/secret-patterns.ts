// Free-text input checks of the catalog report (design §5.1, ADR-0117 decision 7 «input checks»). No shared helper exists
// on main, so the list lives here; keep it small. A hit refuses the whole report (`secret_pattern`): the platform never
// stores or echoes the matching text. False positives are accepted on purpose (a summary that says `token: expiry` is
// refused); the Validator rewords it.
//
//   1. an API token of this platform (the `ap_<8 hex>_<43+ base64url>` format, found anywhere in the text)
//   2. a PEM private-key header
//   3. an AWS access key id (`AKIA` + 16 upper-case letters or digits)
//   4. `Bearer` followed by a long token-like value
//   5. `password` / `secret` / `token` / `api key` followed by `=` or `:` and a value
//
// Control characters are refused separately (`hasControlCharacter`): no stripping, so the stored text is exactly what
// the Validator sent or the report is rejected.

import { TOKEN_PATTERN } from '../../api-tokens/token-format.js';

// The token format is declared anchored (`^…$`) for whole-value checks; strip the anchors to search inside text.
const TOKEN_IN_TEXT = new RegExp(TOKEN_PATTERN.source.replace(/^\^/, '').replace(/\$$/, ''));

export const SECRET_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'api_token', pattern: TOKEN_IN_TEXT },
  { name: 'private_key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'aws_access_key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'bearer', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i },
  { name: 'assignment', pattern: /\b(?:password|passwd|secret|token|api[_-]?key)\b["']?\s*[=:]\s*["']?[^\s"']/i },
];

/** The name of the first pattern the text matches, or null. */
export function findSecretPattern(text: string): string | null {
  for (const { name, pattern } of SECRET_PATTERNS) if (pattern.test(text)) return name;
  return null;
}

/** C0 (tab and newline included), DEL, C1 controls, and ill-formed Unicode (a lone UTF-16 surrogate): refused, never rewritten. */
export function hasControlCharacter(text: string): boolean {
  // eslint-disable-next-line no-control-regex -- the point of the check
  return /[\x00-\x1f\x7f-\x9f]/.test(text) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
}
