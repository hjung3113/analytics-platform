import { ADMIN_MESSAGES } from './messages';
import type { Text } from '@ap/contracts';

/** True when the operator text is not a plain token: empty, over 80 chars, or URL/whitespace-bearing. */
export const invalidText = (value: string): boolean => !value || value.length > 80 || /[?#&\s]/.test(value);

/** The field error for a value that fails `invalidText`. */
export const BAD_TOKEN: Text = ADMIN_MESSAGES.tokenMustBe80CharactersOrFewerWith;
