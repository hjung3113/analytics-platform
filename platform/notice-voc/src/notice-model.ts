import type { Notice, NoticeDraft, Text } from '@ap/contracts';

/** Server limits (ADR-0098 §4): title ko/en ≤ 200 and content ko/en ≤ 10 000 UTF-16 units. */
export const TITLE_MAX = 200;
export const CONTENT_MAX = 10_000;

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/** The current Asia/Seoul wall clock as `YYYY-MM-DDTHH:mm:ss` (second precision), the frame `until` is stored in. */
export function seoulWallClock(at: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(at).map(part => [part.type, part.value]),
  );
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}:${parts['second']}`;
}

/** True for a real calendar wall-clock `YYYY-MM-DDTHH:mm:ss` (no zone, no day roll-over such as 02-30). */
export function isWallClock(value: string): boolean {
  const match = WALL_CLOCK.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [number, number, number, number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && hour < 24 && minute < 60 && second < 60;
}

/** Active iff `until` is strictly later than `now`; equality is expired (the server's `home.notices` rule). Both are wall-clock strings. */
export const isActive = (notice: Pick<Notice, 'until'>, now: string): boolean => notice.until.slice(0, 19) > now.slice(0, 19);

/** Active notices by `until` descending, then the expired rest (same order) for the 「종료됨」 group. Ties keep list order. */
export function groupNotices(items: readonly Notice[], now: string): { active: Notice[]; expired: Notice[] } {
  const byUntilDesc = (a: Notice, b: Notice) => (a.until < b.until ? 1 : a.until > b.until ? -1 : 0);
  return {
    active: items.filter(notice => isActive(notice, now)).sort(byUntilDesc),
    expired: items.filter(notice => !isActive(notice, now)).sort(byUntilDesc),
  };
}

/** A Text field by the current language, falling back to ko when the English side is empty. */
export const pickText = (text: Text, lang: 'ko' | 'en'): string => (text[lang].trim() === '' ? text.ko : text[lang]);

/** `MM/DD` for the list, `YYYY-MM-DD HH:mm` for the pane; both read the wall-clock string as written (no zone conversion). */
export const shortDate = (until: string): string => `${until.slice(5, 7)}/${until.slice(8, 10)}`;
export const longDate = (until: string): string => `${until.slice(0, 10)} ${until.slice(11, 16)}`;

/** The form's string state. `until` is the `datetime-local` value (`YYYY-MM-DDTHH:mm` or with seconds). */
export type NoticeForm = { titleKo: string; titleEn: string; contentKo: string; contentEn: string; scopeId: string | null; until: string };

export const emptyForm = (): NoticeForm => ({ titleKo: '', titleEn: '', contentKo: '', contentEn: '', scopeId: null, until: '' });
export const formOf = (notice: Notice): NoticeForm => ({
  titleKo: notice.title.ko, titleEn: notice.title.en, contentKo: notice.content.ko, contentEn: notice.content.en, scopeId: notice.scopeId, until: notice.until.slice(0, 19),
});

/** `datetime-local` drops `:00` seconds in some browsers; the wire value always has them. */
export const withSeconds = (value: string): string => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00` : value);

export type FormField = 'titleKo' | 'titleEn' | 'contentKo' | 'contentEn' | 'until' | 'scopeId';
export type FormErrors = Partial<Record<FormField, 'required' | 'too_long' | 'invalid'>>;

/** Client-side check of the same rules the server enforces; the server stays the authority. */
export function validateForm(form: NoticeForm): FormErrors {
  const errors: FormErrors = {};
  if (form.titleKo.trim() === '') errors.titleKo = 'required';
  else if (form.titleKo.length > TITLE_MAX) errors.titleKo = 'too_long';
  if (form.titleEn.length > TITLE_MAX) errors.titleEn = 'too_long';
  if (form.contentKo.trim() === '') errors.contentKo = 'required';
  else if (form.contentKo.length > CONTENT_MAX) errors.contentKo = 'too_long';
  if (form.contentEn.length > CONTENT_MAX) errors.contentEn = 'too_long';
  if (form.until === '') errors.until = 'required';
  else if (!isWallClock(withSeconds(form.until))) errors.until = 'invalid';
  return errors;
}

/** The exact wire draft: wall-clock `until` without any UTC conversion, `scopeId` null for 전체. */
export const toDraft = (form: NoticeForm): NoticeDraft => ({
  title: { ko: form.titleKo, en: form.titleEn },
  content: { ko: form.contentKo, en: form.contentEn },
  scopeId: form.scopeId,
  until: withSeconds(form.until),
});

/** Maps a server `fieldErrors` path to a form field (`title.ko` → `titleKo`); unknown paths are not field errors. */
export function fieldOfPath(path: readonly string[]): FormField | null {
  const [head, lang] = path;
  if ((head === 'title' || head === 'content') && (lang === 'ko' || lang === 'en')) return `${head}${lang === 'ko' ? 'Ko' : 'En'}`;
  if (head === 'title') return 'titleKo';
  if (head === 'content') return 'contentKo';
  if (head === 'until' || head === 'scopeId') return head;
  return null;
}

/**
 * One write operation's idempotency attempt. A new operation, or any change of the sent input, gets a new UUID key; an
 * uncertain retry (`error`/`unknown`) resends the identical operation with the same key (ADR-0098 §4).
 */
export type Attempt = { fingerprint: string; key: string };
export function attemptFor(previous: Attempt | null, fingerprint: string, mint: () => string = () => crypto.randomUUID()): Attempt {
  return previous && previous.fingerprint === fingerprint ? previous : { fingerprint, key: mint() };
}
