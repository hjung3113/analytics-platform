import { CAPABILITIES, isTokenOnlyScope, isCapability, isTokenOnlyCapability } from './capabilities.js';

/** ADR-0116: display aliases only; the server still judges every individual capability. */
export const API_TOKEN_SCOPE_BUNDLES = [
  { id: 'read', label: '조회', description: '접근 가능한 로그 지식·모델 명세·검증 결과 조회', capabilities: ['workspace.read'] },
  { id: 'write', label: '기록', description: '허용된 기준정보·가져오기·지식 초안·개선 아이템 저장. 발행·승인·권한 부여 제외', capabilities: ['knowledge.catalog.manage', 'knowledge.catalog.import', 'improvement.manage', 'knowledge.draft.create'] },
  { id: 'validation-worker', label: '검증 작업자', description: '검증 요청 가져오기·점유·진행 보고·결과 저장·규칙 카탈로그 보고. Gate 결정 제외', capabilities: ['validation.worker', 'validation.catalog.report'] },
] as const;

export type ApiTokenScopeBundle = (typeof API_TOKEN_SCOPE_BUNDLES)[number];

/**
 * Bundles a token screen offers. A bundle whose scopes are all registered capabilities is shown everywhere. A bundle made of
 * token-only scopes (`validation.worker`, ADR-0117 decision 9) is shown only for service tokens: the server refuses it on a
 * personal token (`service_only`), so the personal screen never offers it.
 */
export function visibleApiTokenScopeBundles(
  registry: readonly string[] = CAPABILITIES,
  options: { service?: boolean } = {},
): readonly ApiTokenScopeBundle[] {
  return API_TOKEN_SCOPE_BUNDLES.filter(bundle => bundle.capabilities.every(scope => (
    (isTokenOnlyScope(scope) || (isCapability(scope) && isTokenOnlyCapability(scope))) ? options.service === true : registry.includes(scope)
  )));
}
