# 서버는 둘이다 — Fastify 코어가 유일한 입구이고 FastAPI는 분석 데이터만 내부에서 맡는다

- Status: **Decided (2026-10-28)** — D1·D2·D6·D7은 사용자 결정이다. 권한 부분(아래 「설계 남음」)은 이 ADR이 정하지 않는다.
- Decider: 사용자 — 2026-10-26 "백엔드 두 개(Fastify + FastAPI)를 함께 쓰는 것은 OK. 각 스택의 강점이 살도록 역할을 나눠 설계". 2026-10-28 "추천대로": 분담(D1)·입구 하나(D2)·Python CI 필수 검사(D6)·데이터 자산 허브 FastAPI 소유(D7)를 추천안대로 결정했다. D3 DB 인스턴스, 작업 큐, 신원 토큰 서명, 시간 예산은 코디네이터 추천(되돌릴 수 있음)으로 둔다.
- Scope: [#940](https://github.com/hjung3113/analytics-platform/issues/940)(설계 초안 §0–§6). 관련: [#155](https://github.com/hjung3113/analytics-platform/issues/155), [#531](https://github.com/hjung3113/analytics-platform/issues/531), [#148](https://github.com/hjung3113/analytics-platform/issues/148), [#593](https://github.com/hjung3113/analytics-platform/issues/593), [#151](https://github.com/hjung3113/analytics-platform/issues/151), [#540](https://github.com/hjung3113/analytics-platform/issues/540), [#552](https://github.com/hjung3113/analytics-platform/issues/552), [#555](https://github.com/hjung3113/analytics-platform/issues/555).
- Amends: [ADR-0066](0066-feedbackops-merges-into-platform.md) 결정 6, [ADR-0069](0069-platform-port-in-feedbackops-backend.md) 결정 8의 다시 볼 조건, [ADR-0043](0043-platform-sdk-is-the-app-contract-and-unified-framework.md) 서버 문장.
- 구현 없음. 이 ADR은 결정만 남기고, 구현은 아래 「단계」의 이슈가 이어받는다.
- 분담을 다시 여는 조건: 사내 백엔드 담당 합의([#155](https://github.com/hjung3113/analytics-platform/issues/155)·[#149](https://github.com/hjung3113/analytics-platform/issues/149))가 이 결정과 다를 때.

## 맥락

- 실서버는 FeedbackOps 백엔드(Fastify)에서 출발했다(ADR-0066 결정 6, ADR-0069). 세션·OIDC·CSRF·감사·알림·pg-boss·적합성 검사가 거기 구현돼 있다.
- 분석 데이터(`menuQuery`의 설비·지표·HW Time)는 사내 요구값이 FastAPI(docs/03)이고, 대량 내보내기·XLSX 가져오기·통계처럼 Python 쪽 도구가 강한 일이 이쪽에 있다. 업무 성격의 `menuQuery`는 `home.notices` 하나뿐이다.
- ADR-0069는 "플랫폼 포트를 별도 프로세스로" 안을 세션·권한·감사가 두 곳으로 갈라진다는 이유로 기각했다. 이 ADR은 그 셋을 Fastify 한 곳에 그대로 두므로 그 기각과 충돌하지 않는다.
- 계약은 아직 TS 타입이고, FO 런타임은 `@ap/ui` 외의 `@ap/*`를 import하지 못한다(ADR-0073, 경계 규칙 11). 그래서 "프론트와 Fastify가 계약을 공유한다"는 지금은 테스트 시점에만 성립한다.

## 결정

### 1. 분담 (D1, Decided)

| 기능 | 소유 | 이유 |
| --- | --- | --- |
| 로그인·세션·SSO | Fastify | AuthProvider가 구현돼 있다. FastAPI는 쿠키를 보지 않는다 |
| 권한 부여·판정 정책 | Fastify | ADR-0068의 부여는 하나. 역할→능력·거부·만료 계산은 한 곳에서만 한다 |
| Scope 집행 | 나눔 | 누가 어느 site·room을 받았는지는 Fastify, site 레지스트리·room→설비·Condition→Selection 해석은 FastAPI. `validateScope`는 Fastify가 부여 정보와 `analytics.v_sites_v1`으로 답한다 |
| 감사 | Fastify(저장소) | `core.audit_log` 하나. FastAPI는 definer 함수로 추가만 한다 |
| 알림 | Fastify | 채널과 수신함을 소유한다. FastAPI는 outbox에 이벤트만 쓴다 |
| 공지 | Fastify | 콘텐츠 CRUD와 `home.notices` 핸들러 |
| 활용률·오류 보고·차트 주석 | Fastify | #622에 구현과 게이트가 있다 |
| 엔티티 링크 | Fastify(`entity_links`) | 분석 type(설비·지표)의 읽기 판정은 그 type의 소유자에게 묻는다 |
| `getEntity`·`entityAudit` | type 소유자 | voc·finding·task는 Fastify, equipment·metric은 FastAPI |
| FO 업무 도메인 | Fastify | ADR-0066 그대로 |
| 배경 작업 | 각자 | Fastify는 pg-boss, FastAPI는 Postgres 기반 큐 |
| 분석 `menuQuery` 엔드포인트 | FastAPI | SQL-first, Site별 DB |
| `menuAction` | 엔드포인트 소유자 | 분석 도메인 쓰기(마스터, 사용자 정의 설비 그룹)는 FastAPI |
| 비동기 export job(#555) | FastAPI | 단계마다 ACL을 다시 판정하는데 그 판정이 엔드포인트 판정과 같고 파일도 같은 데이터에서 나온다 |
| 로더·파서·ETL | 파서 저장소 + FastAPI | 적재는 파서 소유(#37). mart 재계산·지연 완료·세대는 FastAPI 작업자 |
| 데이터 자산 허브(#540) (D7, Decided) | FastAPI가 통째로 | 가져오기·검증·버전·재사용 읽기는 데이터 쪽 일이다 |
| 설비 조건 평가(#552) | FastAPI | `listAxisOptions`·`searchEquipment`·`resolveSelection` |
| 저장된 보기·워크스페이스(#294·#554) | Fastify | 사용자 소유 상태·공유·감사. 내용은 URL 계약 모양이라 TS 코덱으로 검증한다 |
| `publishedMetrics`·`defaultRangeTo`·세대(#165) | FastAPI가 원천 | FastAPI가 뷰로 내고 Fastify의 bootstrap·session-state가 그 뷰를 읽어 넘긴다 |

분석 조회도 FastAPI가 맡는 이유: 얇은 SQL 조회만 보면 두 스택의 차이는 작지만, 조회는 TS로 재계산은 Python으로 나누면 mart 지식이 두 언어로 갈라진다.

### 2. 입구는 하나 (D2, Decided)

- 앞단(#151)은 `/api/fo/*`(접두사 제거)·`/api/*`·`/auth/*`를 모두 Fastify로 보낸다. FastAPI는 내부망에만 열린다. 브라우저는 FastAPI를 직접 부르지 않는다.
- Fastify가 소유자 표(`server-routing.json`: endpoint·action·entity type → 상류 서버)를 보고 넘긴다. 본문의 id·type으로 고르는 경로(`menu-query`·`menu-action`·`platform/entity`·`entity/audit`)와 경로째 넘기는 것(`platform/axis-options`·`equipment-search`·`selection-resolve`·`/api/v1/export-jobs/**`)이 있다. 계약이 endpoint id를 본문에 두므로 클라이언트도 `real-dev-proxy.ts`도 바꾸지 않는다.
- 전달기는 등록된 id인지만 판정한다. 등록되지 않았으면 200 `error`를 돌려준다. outcome을 새로 만들거나 응답 본문을 고치지 않는다. 상류 실패는 502/504이고 어댑터가 `error`로 바꾼다.
- 시간 예산(추천, 되돌릴 수 있음): 어댑터 30초 > Fastify 상류 27초 > FastAPI 판정 25초(`statement_timeout` 24초, 넘으면 `timeout` envelope). 클라이언트가 중단하면 상류 요청도 끊고 쿼리를 취소한다.
- 다시 열 조건: 측정해 보니 전달 오버헤드나 대용량 다운로드가 병목일 때. 그때는 앞단 경로 라우팅(`/api/v1/menu-query/{endpointId}` + auth_request)으로 바꾼다.

### 3. 데이터 소유

- 플랫폼 Postgres 인스턴스는 하나다(D3, 추천·되돌릴 수 있음). FO 스키마는 Fastify가 소유하고 drizzle로, `analytics`·`analytics_jobs` 스키마는 FastAPI가 소유하고 Alembic으로 마이그레이션한다. FastAPI 전용 role `ana_app`(DML)·`ana_migrate`를 따로 두고 기동 시 role 확인 가드를 둔다.
- Site별 파서 DB는 파서가 소유한다(ADR-0004). FastAPI는 read-only role로만 읽고, Fastify는 파서 DB를 직접 읽지 않는다.
- 교차 읽기는 생산자가 마이그레이션으로 만든 버전 붙은 뷰나 definer 함수와 명시적 GRANT로만 한다. Fastify는 `analytics.v_sites_v1`·`v_published_metrics_v1`·`v_generation_v1`을, FastAPI는 `core.v_actor_directory_v1`·`core.platform_audit_events`를 읽는다.
- 교차 쓰기는 금지한다. 예외는 대상 쪽이 소유한 definer 함수 둘뿐이다: `core.append_audit_event`, `platform.emit_integration_event`.
- 인스턴스를 하나로 두는 이유: 감사를 같은 트랜잭션에 넣을 수 있고, 교차 읽기에 네트워크가 필요 없고, 백업이 하나이고, docs/03과 맞는다. 다시 열 조건: 보안 격리 요구가 생길 때.

### 4. 계약 원본

- 방향은 한쪽뿐이다: Zod → JSON Schema(2020-12) → Pydantic([#531](https://github.com/hjung3113/analytics-platform/issues/531) A안, 사용자 2026-10-20 승인). 이 ADR은 Python 쪽 소비 방향만 정한다. 계약 범위를 Zod로 넓히는 결정 자체는 [#1085](https://github.com/hjung3113/analytics-platform/issues/1085)(#531 1단계 ADR)가 소유하고 여기서 되풀이하지 않는다. 산출물 패키지는 [#1086](https://github.com/hjung3113/analytics-platform/issues/1086)이 만든다.
- 산출물(`sdk-v*`): `schemas/*.json`, `endpoints.json`, `vocab.json`, 내부 토큰 스키마, 감사 어휘.
- FastAPI는 datamodel-code-generator로 모델을 생성해 커밋하고 CI가 다시 생성해 차이가 나면 실패한다. 공개 계약 모델을 손으로 쓰지 않는다. 기동 시 "`endpoints.json` ∩ 소유자 표 = 자기 핸들러 집합"이 아니면 기동을 거부한다.
- Fastify는 계약 스키마 패키지를 런타임에 import한다. 그러려면 경계 규칙 11(ADR-0073)의 FO 런타임 허용 목록을 고쳐야 한다 — 구현 이슈가 한다.
- 선언 버전 헤더(계약 §8): `endpoints.json` 해시를 `X-Platform-Declarations`로 보낸다.
- 호환성 세 가지(FO zod 3.25.67의 `zod/v4` `toJSONSchema`, fastify-type-provider-zod, datamodel-code-generator의 Zod 4 출력 처리)는 실행해 보지 않았다. 구현 첫 단계의 PoC가 확인한다.

### 5. 신원 전파 — 구조만 정하고 claim은 남긴다

- Fastify가 넘길 때마다 서명한 내부 신원 토큰을 `X-Internal-Identity`로 싣는다. FastAPI는 검증 키만 가지므로 토큰을 만들 수 없다. 서명은 Ed25519 JWS(추천, 되돌릴 수 있음)이고 mTLS는 #151에서 더할 수 있으나 토큰을 대신하지 않는다.
- 요청마다 발급하고 `exp`는 30초, `aud=analytics`, 메서드·경로 바인딩(`htm`/`htu`)을 둔다. 토큰에 확정된 claim: `sub`(actor uuid), `wid`, `sv`(sessionVersion), `cid`(correlation id).
- FastAPI는 정책을 다시 구현하지 않고 Fastify가 준 값의 포함 여부만 확인한다. 로그인·쿠키·세션·사용자 표·역할 분기를 FastAPI에 두지 않는다.
- **권한 claim(`perms`·`scopes`) 모양은 아래 「설계 남음」이다.**

### 6. 감사

- FastAPI는 변경과 같은 트랜잭션에서 `core.append_audit_event`를 부른다. 행위자는 토큰의 `sub`, 시각은 DB가 찍는다. `event_type`은 닫힌 목록이고 FastAPI 이벤트는 `analytics.*` 이름을 쓴다.
- 선행 작업: `subject_id`를 uuid에서 text로 바꾸고 `scope_id`를 추가한다(#621 백로그).
- 감사하는 것: 분석 쓰기, export 생성·다운로드, 자산 게시·철회. 조회는 감사하지 않고 활용률이 기록한다.

### 7. 작업 큐 (추천, 되돌릴 수 있음)

- Fastify는 pg-boss, FastAPI는 Procrastinate를 쓴다(같은 인스턴스의 다른 스키마). 상대 큐의 내부 표에 직접 넣지 않는다. FastAPI → Fastify는 같은 트랜잭션의 outbox와 pg-boss 중계 작업이고, Fastify → FastAPI는 FastAPI 내부 API다.
- 요청 처리 중 동기 호출은 Fastify → FastAPI 한 방향만 허용한다.
- Procrastinate가 이 환경에 맞는지는 문헌상 추천이고 측정하지 않았다.

### 8. 오류·관측, 로컬 개발·테스트

- `X-Correlation-Id`(ADR-0069 결정 5)는 Fastify가 확정해 헤더와 `cid` claim으로 넘기고, FastAPI는 로그 `request_id`와 envelope `correlationId`에 그대로 쓴다. 작업 payload에도 같은 id를 싣는다. pino와 structlog의 로그 필드 이름을 맞춘다. OTel은 #151에서 수집처가 정해진 뒤 붙인다.
- `dev:real`은 Vite 프록시를 그대로 쓰고 Fastify가 `ANALYTICS_UPSTREAM`(uvicorn)으로 넘긴다. throwaway DB 하나에 drizzle, 이어서 Alembic 순서로 마이그레이션하고 파서 DB는 합성 fixture로 대신한다.
- `apps/analytics-api`(uv)는 pnpm workspace 밖에 둔다. **Python CI job(ruff·pyright·pytest·스키마 drift)을 main 필수 검사로 넣는다(D6, Decided).**
- `@ap/server-conformance`를 (a) 기존 FO 통합(Fastify만), (b) Postgres + Fastify + FastAPI에 실제 `@ap/http-adapter`를 붙인 전체 스택 두 가지로 돌린다. 체크리스트 §3에 "소유자 표가 모든 엔드포인트를 정확히 한 번씩 덮는다"는 CI 검사를 넣는다.

### 9. 금지

1. FastAPI에 로그인·쿠키·세션·사용자 표·역할 분기를 두는 것(인증 이중화)
2. FastAPI가 `permission` 스키마를 읽어 정책을 다시 계산하는 것
3. 남의 스키마에 쓰는 것(definer 함수 둘은 예외), DB role을 공유하는 것
4. 한 개념에 소유자가 둘인 것: 저장된 보기, 알림 발송(FastAPI의 직접 SMTP 포함), export job, 감사 표
5. 브라우저가 FastAPI를 직접 호출하는 것, CORS, 두 번째 공개 출처
6. TS 계약 타입을 Python에 손으로 옮겨 적는 것
7. 전달기가 outcome을 만들거나 응답 본문을 고치는 것
8. 요청 처리 도중 FastAPI → Fastify 동기 호출(순환)
9. 상대 큐에 직접 enqueue하는 것
10. 요청 경로에서 원천 행을 DataFrame으로 만드는 것
11. FO 도메인 통계를 FastAPI에 복제하는 것
12. Fastify가 파서 DB를 직접 읽는 것

### 10. 단계

| 단계 | 내용 |
| --- | --- |
| P0 | 이 ADR로 D1·D2·D6·D7 결정(사용자 2026-10-28), 권한 설계는 #1087에 남김 |
| P1 | Fastify 전달기와 토큰 발급, 최소 스키마(envelope·MenuQuery + `equipment.master.page`), Pydantic 생성과 drift 검사, `apps/analytics-api` 골격, 전체 스택 적합성 검사. **선행 권한 부여 구현은 「설계 남음」** |
| P2 | `equipment.master.export` 기반 export job(#555): 객체 저장소, 감사, outbox 알림 |
| P3 | #552 축·설비 조회, 지표·기본 기간·세대 뷰(#165), mart 작업자(#37 합의 뒤) |
| P4 | #540 자산 허브, 사내 모델 ML(외부 AI API 금지는 유지) |

첫 엔드포인트는 `equipment.master.page`를 추천한다: Scope와 페이지가 있고 assessment kind가 셋이라 판정 순서를 거의 다 지나가며 바로 `.export`로 이어진다. HW Time(#586)은 mock 데모이고 보류 중이다.

## 설계 남음 — 구현 안 함

사용자 2026-10-28: "권한 쪽은 설계가 더 필요". 아래는 이 ADR이 **정하지 않는다**.

- D5: #98(IdP claim)을 기다리지 않고 site·site_room 수동 부여를 먼저 연다.
- §5 신원 토큰의 `perms`·`scopes` claim 모양과 회수 반영.
- P1의 site·site_room 부여 최소 구현과 `equipment:view` 계산.

상태: 설계 남음, 구현 안 함. 다시 여는 조건: 권한 설계 이슈([#1087](https://github.com/hjung3113/analytics-platform/issues/1087))의 결정. 그 전에는 ADR-0069 결정 8의 임시 값(`scopes`는 `[]`)이 유지되고 Scope가 필요한 분석 메뉴는 열리지 않는다.

## Considered Options

- **(A) FastAPI만 쓴다(docs/03 원안):** 이미 구현·검증된 세션·권한·감사·알림·적합성 검사를 다시 만들어야 한다. ADR-0066이 이미 Fastify에서 출발하기로 했다.
- **(B) Fastify만 쓴다:** 사내 요구값(FastAPI)과 Python 작업자 도구(polars·duckdb·XLSX·통계)를 포기하고 mart 지식을 TS로 옮긴다.
- **(C) 두 서버가 각각 공개 출처:** 세션·권한·감사가 갈라지고(ADR-0069 기각 사유) CORS·두 번째 출처가 생긴다.
- **(D, 채택·Decided) Fastify 단일 입구 + 내부 FastAPI:** 인증·권한·감사는 한 곳에 두고 분석 데이터의 강점만 가져온다. 대가는 전달 한 홉, 내부 토큰, 두 번째 CI job, 두 마이그레이션 도구다.

## 결과

- ADR-0066 결정 6에 "서버는 둘이다. 코어(Fastify)와 그 뒤에만 있는 분석 데이터 서버(FastAPI)"를 더하고 Amended 줄을 단다. ADR-0069는 위 기각 사유와 충돌하지 않음을 적고 결정 8의 다시 볼 조건 "O4"를 이 ADR의 P3으로 바꾼다. ADR-0043에는 "산출물은 언어 중립이고 Fastify·FastAPI 참조 구현을 둔다. 어떤 엔드포인트를 어느 서버가 맡을지는 앱 배포의 소유자 표가 정한다"를 더한다. 합류 설계 §7 O4는 Decided(FastAPI)로, docs/03 Backend 행은 "Fastify(코어) + FastAPI(분석 데이터)"로, http-adapter-contract 머리말은 이 ADR을 가리키게 고친다.
- 구현 이슈와 경계 규칙 11 변경, `sdk:api` 스냅샷 영향은 P1 이슈가 소유한다.
