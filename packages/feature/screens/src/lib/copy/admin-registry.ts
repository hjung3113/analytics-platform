/** Field copy shared by the registry dialogs (managed systems, analytics areas). */
export const ADMIN_REGISTRY_COPY = {
  slugRequired: '슬러그를 입력해 주세요.',
  nameRequired: '이름을 입력해 주세요.',
  /** A slug the server rejected with `invalid_slug_format` (`^[a-z][a-z0-9-]*$`). */
  slugFormat: '슬러그는 영문 소문자로 시작하고 영문 소문자·숫자·하이픈(-)만 씁니다. 예: power-bi',
} as const;
