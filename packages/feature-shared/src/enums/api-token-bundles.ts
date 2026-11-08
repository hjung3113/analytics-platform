import { CAPABILITIES } from './capabilities.js';

/** ADR-0116: display aliases only; the server still judges every individual capability. */
export const API_TOKEN_SCOPE_BUNDLES = [
  { id: 'read', label: '조회', description: '접근 가능한 로그 지식·모델 명세·검증 결과 조회', capabilities: ['workspace.read'] },
  { id: 'write', label: '기록', description: '허용된 기준정보·가져오기·개선 아이템 저장. 발행·승인·권한 부여 제외', capabilities: ['knowledge.catalog.manage', 'knowledge.catalog.import', 'improvement.manage'] },
  { id: 'validation-worker', label: '검증 작업자', description: '검증 요청 가져오기·점유·진행 보고·결과 저장. Gate 결정 제외', capabilities: ['validation.worker'] },
] as const;

export type ApiTokenScopeBundle = (typeof API_TOKEN_SCOPE_BUNDLES)[number];

export function visibleApiTokenScopeBundles(registry: readonly string[] = CAPABILITIES): readonly ApiTokenScopeBundle[] {
  return API_TOKEN_SCOPE_BUNDLES.filter(bundle => bundle.capabilities.every(capability => registry.includes(capability)));
}
