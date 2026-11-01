import type { Text } from '@ap/contracts';

/** True when the operator text is not a plain token: empty, over 80 chars, or URL/whitespace-bearing. */
export const invalidText = (value: string): boolean => !value || value.length > 80 || /[?#&\s]/.test(value);

/** The field error for a value that fails `invalidText`. */
export const BAD_TOKEN: Text = { ko: '공백·특수문자 없는 80자 이하 값이어야 합니다.', en: 'Must be 80 characters or fewer with no spaces or special characters.' };
