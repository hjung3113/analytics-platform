import { ADMIN_MESSAGES } from './messages';
import type { Text } from '@ap/contracts';

/** True when the operator text is not a plain token: empty, over 80 chars, or URL/whitespace-bearing. */
export { invalidFilterText as invalidText } from '@ap/contracts';

/** The field error for a value that fails `invalidText`. */
export const BAD_TOKEN: Text = ADMIN_MESSAGES.tokenMustBe80CharactersOrFewerWith;
