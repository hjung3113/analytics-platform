// Role Level → display title shared by the session (`bootstrap`) and the access directory.

const ROLE_TITLES: Record<string, { ko: string; en: string }> = {
  user: { ko: '사용자', en: 'User' },
  developer: { ko: '개발자', en: 'Developer' },
  admin: { ko: '관리자', en: 'Admin' },
};

export function titleFor(roleLevel: string): { ko: string; en: string } {
  return ROLE_TITLES[roleLevel] ?? { ko: '사용자', en: 'User' };
}
