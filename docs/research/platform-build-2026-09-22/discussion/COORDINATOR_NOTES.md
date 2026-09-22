# 코디네이터의 원본 대조 기록

이 문서는 코디네이터가 원본 조사와 현재 계약·코드를 대조한 결과다. 리뷰어의 합의와 구분하며, 조사 원본의 내용을 소급 변경하지 않는다. 모든 구현 제안은 Candidate다.

## N1. 집합 중복과 단일값 중복

[원본 A](../01-kernel-frontend.md) A1의 실패 모드에 있는 “duplicate set을 dedupe함”은 현재 계약과 반대다. [06 §6.1](../../../06_platform_ui_contract.md)의 집합 키 정규화는 ID 중복을 제거하고 순서를 정규화한다. 반면 `scopeId`, `from`, `v` 등 카디널리티 1 키는 같은 값이어도 반복되면 거부한다.

권고: 중복 정보를 잃는 객체 변환 전에 raw query의 반복 키를 관찰한다. 테스트 벡터는 `equipmentIds=A&equipmentIds=A`의 정규화와 `scopeId=A&scopeId=A`의 거부를 따로 검증한다. TypeScript/Zod/codegen은 구현 선택이며 URL 계약 그 자체가 아니다.

## N2. R 부재의 영향 범위

[원본 B](../02-data-performance-operations.md) DP-05와 수직 검증 흐름에는 R이 없으면 auto publish를 멈춘다는 표현이 있다. [05 지연 완료 정책](../../../05_roadmap_and_open_questions.md)은 자동 재집계만 보류하고 지연완료 식별·후보 보존은 계속하도록 정한다. [06 §6.3](../../../06_platform_ui_contract.md)은 독립적으로 유효한 `defaultRangeTo`가 있으면 R 부재에도 기본 구간을 물질화할 수 있다고 명시한다.

권고: 자동 지연완료 재집계, 수동 backfill, 최초 build, 마스터/정의 정정, 결과 공개를 구분한다. R 부재 하나만으로 모든 조회나 공개를 막는 새 전역 규칙을 도입하지 않는다. 각 작업의 입력이 부족하다면 그 작업의 검증 조건으로 거부한다.

## N3. 공개의 원자성과 입력의 일관성

원본 B의 ready pointer 교체는 독자가 building 결과를 보지 않도록 하는 후보지만, build 도중 읽은 원천·마스터·정의가 같은 기준이라는 증거를 대신하지 않는다. 기본 Read Committed에서는 한 트랜잭션 안의 연속 SELECT도 서로 다른 snapshot을 볼 수 있고 Repeatable Read는 트랜잭션 내 기준을 고정한다. 이것을 여러 HTTP 요청이나 임의로 긴 worker 작업의 자동 snapshot 공유로 확장할 수는 없다. [PostgreSQL 공식 격리 수준 문서](https://www.postgresql.org/docs/18/transaction-iso.html)

권고: 입력 기준 확보 → 계산 → 검증 → 공개 → 읽기 기준 고정 → 만료/회수의 책임을 나눈다. 첫 흐름에서 필요한 최소 수준만 구현 후보로 삼되, 나중에 실행되는 CSV가 같은 기준을 못 읽으면 명시적으로 만료/재조회하도록 한다. 오래된 조건 링크가 같은 숫자를 영구 재현한다는 약속은 하지 않는다.

## N4. 실행 큐와 작업 의미

[원본 B](../02-data-performance-operations.md) DP-06의 예시 멱등성 키는 dataset/scope/range/metric/source version을 포함하지만 같은 schema version 안에서 입력 데이터나 마스터가 정정되는 경우를 어떻게 구별할지 명시하지 않는다.

권고: 동일 논리 작업의 retry는 같은 식별자를 사용하고, 실제 입력·정정 revision이 달라지면 새 계산을 허용한다. 입력 revision의 공급자가 없다면 그 사실을 Open으로 남긴다. queue의 delivery 보장을 결과 공개·외부 부작용의 exactly-once로 확장하지 않는다. lease가 만료된 worker의 늦은 쓰기도 별도 차단 조건이 필요하다.

## N5. 실제 자산과 인증 이식 경계

`products/feedbackops/apps/backend/package.json`에는 Fastify `5.2.0`, `pg-boss ^12.18.2`, `openid-client ^6.8.8`이 선언돼 있다. 따라서 플랫폼 백엔드 후보 비교에 Fastify 유지·연계를 포함할 근거가 있다. 패키지 선언은 플랫폼 통합 성공이나 라이브러리의 최신 호환성 증거는 아니다.

`products/feedbackops/apps/backend/src/modules/auth/session-service.ts`는 Actor를 `workspaceId + claims.sub`로 찾는다. `oidc-auth-provider.ts`는 설정된 issuer를 discovery한다. 현재 단일 issuer 제품의 결함으로 단정하지 않으며, 플랫폼이 issuer를 늘리거나 교체할 때에는 issuer/subject namespace와 계정 이전·철회 정책을 별도로 판단해야 한다.

권고: 구현이 있다는 이유로 Workspace=Scope=Managed System을 동일시하지 않는다. 단일 제품의 권한 예외와 역할 이름을 복사하지 말고 플랫폼의 사용자·Scope 매핑 및 제품별 권한 판단을 연결한다. Audit의 같은 트랜잭션 보장은 해당 제품 DB 경계 안에서만 성립한다.

## 확인 범위

문서와 일부 실제 코드·package 선언을 읽었다. PostgreSQL 격리 문서는 2026-09-22 공식 출처로 확인했다. 서버·DB·IdP·부하 테스트는 실행하지 않았다. N3~N5의 설계 대안은 확인한 사실에서 도출한 코디네이터의 제안이다.

## N6. UI primitive의 문구와 결정 상태 불일치

R2 후속 대조에서 [06 §13](../../../06_platform_ui_contract.md)의 “shadcn/ui + Base UI를 기반으로 한다”와 [04](../../../04_frontend_ui_ux.md)의 “모두 implementation candidate”, Base UI/Radix 비교표, [05](../../../05_roadmap_and_open_questions.md)의 프론트 라이브러리 Candidate 상태를 함께 확인했다. GLM이 명시적 Base UI 문구 누락을 발견했고 Astra가 Decided 단정의 한계를 지적했다.

판정: Radix를 자동 채택하지도, Base UI 선택이 확정됐다고 단정하지도 않는다. 문서 상태를 정렬하고 동일 acceptance로 비교해야 한다. 이는 이번 토론에서 해결된 기술 선택이 아니라 문서 보강 제안이다.
