# Log Knowledge Hub — 플랫폼 통합 제품·백엔드·DB 상세 설계

> [!IMPORTANT]
> **최신 플랫폼 통합 기준선.** 본 설계서는 승인된 제품 불변조건을 구현하기 위한 기술 **Candidate**이다. 실제 SDK/DB/API·권한 최종 권위는 플랫폼 코드 및 Decided ADR이다. v0.4는 제품/카탈로그/UI 상세를 보존한 [참고 문서](./product-ux-reference-v0.4.md)이며, 독립 웹/독립 서버 관련 역사적 문장은 본 v0.6으로 **대체**된다. 실제 설비 원본·접속정보·토큰 등 비공개 자료는 이 공개 저장소에 포함하지 않는다.


> **버전:** v0.6 — 플랫폼 직접 탑재 및 기술 상세 설계 (Review Candidate, 2026-11-01)  
> **기준 문서:** [`product-ux-reference-v0.4.md`](./product-ux-reference-v0.4.md)(2026-10-30, 사용자 확정 1–17번 제품 정책, 카탈로그 §15, UI/UX §16–17)  
> **주요 변경:** 독립 웹 우선/후속 플랫폼 이식을 폐기하고 `hjung3113/analytics-platform` 내부 **`log-dev` 업무 시스템에 직접 탑재**하는 방식으로 변경. 기존 v0.4의 도메인 정책과 화면 품질 기준은 유지.  
> **상태 의미:** *요구 방향은 사용자 요청 반영* / *아키텍처·DDL·API 세부는 검수된 구현 후보* / *실제 코드·마이그레이션·배포는 아직 수행하지 않음*. 플랫폼 원본과 충돌하면 최신 Decided ADR 및 실제 런타임 계약이 우선.

## 0. 결론과 설계 권위

### 0.1 채택 방향

1. **제품의 위치:** 기존 업무 시스템 `log-dev`(표준 로그 개발)의 **`로그 지식 허브` 메뉴 그룹**. 새로운 독립 앱, 별도 앱 셸, 별도 인증·SSO, 별도 공용 백엔드를 만들지 않는다.
2. **UI:** `apps/platform-web`이 조립하는 `menus/log-dev/log-knowledge` 메뉴 패키지. 기존 `@ap/ui`, `@ap/components`, `@ap/kernel`·`@ap/shell`, `menuQuery`·`menuAction`을 소비. 제품 고유 페이지와 업무 컴포넌트만 추가한다.
3. **API/서버:** 단일 브라우저 입구 `apps/platform-api`(Fastify), 내부 도메인 모듈 `modules/log-knowledge`. 분석 전용 FastAPI는 지식 콘텐츠 CRUD·검색의 소유자가 아니다. 대량 Parser/Validator/자산 분석 데이터는 외부 소유자 포트/API/승인된 읽기 투영으로 소비한다.
4. **DB:** 기존 PostgreSQL `platform` 인스턴스에 **`knowledge` 스키마(후보)**. Fastify 도메인이 Drizzle 마이그레이션 및 데이터 정합성 소유. 감사는 기존 Core `core.audit_log`, 첨부 바이너리는 플랫폼 Attachments, 공통 Idempotency/Permission/Notification 서비스 사용. 기존 원본 로그/설비 마스터/Validator 결과를 중복 소유하지 않는다.
5. **분리 경계:** 정식 기술 Item/Revision, SW별 Spec, 승인된 모델 공통 파생정보는 Knowledge Hub 소유. 원본 로그·Parser Raw·Validator Run·Top View Layout은 **각 원천 시스템 소유**, 허브는 버전 고정 참조/증거를 저장.
6. **AI:** 사내 Agent/Skill은 **초안 제출 전용**. 승인·직접 게시·기술적 검증 자동 확정 불가. 일반 Contributor는 검토 경유, 인간 Publisher는 권한에 따라 직접 발행 가능.
7. **기능 우선순위:** 초기 카탈로그 등록/관리 및 Import **필수**, 이후 독립 SW Spec·Item·검토/검색. Top View Viewer 통합은 최종 요구, Studio 편집은 별도.

### 0.2 기존 v0.4에서 그대로 유지할 17개 사용자 결정

| 번호 | 보존할 불변조건 | 핵심 구현 영향 |
|---|---|---|
| 1 | **Item은 단일 Model 또는 단일 SW의 소유** | 다른 모델/SW의 유사 사건은 독립 Item+링크; 공동 소유 M:N 금지 |
| 2 | **각 SW 버전의 명세가 독립 원본** | Model 공통 명세는 원본이 아닌 승인된 파생정보; Model common+SW override 기각 |
| 3 | 사람 Contributor=Draft, 사람 Publisher=직접 발행 가능, AI=항상 사람 승인 | 별도 Actor/Workflow/권한 게이트 |
| 4 | Parser·Validator·Knowledge Hub 책임 분리 | 자동 Finding은 정식 Item이 아닌 후보 |
| 5 | Evidence 외부 참조+선택적 첨부 | 원본 포인터와 플랫폼 Attachment 결합 |
| 6 | 카탈로그 수동 입력+CSV/XLSX Import+외부 연동 | Phase 0 관리자 CRUD·Import 필수 |
| 7 | 기본 사내 공유+선택적 민감정보 제한 | Model/SW/Item/Evidence 다층 ACL |
| 8 | Top View는 허브에서 **Viewer**, 편집은 별도 Studio | Viewer 임베드/Studio 딥링크·SW 매핑 |
| 9 | SW별 Module/Event ID 독립, 공통 개념은 검토된 매핑 | 원본 키 공유·자동 동치판정 금지 |
| 10 | 기술 판단 변경 이력과 본문 Revision은 별개 | append-only `item_assessment_event` |
| 11 | SW 버전까지 관리, **Build 제외** | Build 필수 키/자식 테이블/화면 금지 |
| 12 | 핵심 Spec 구조화+상세 문서 병행 | SW별 Revision/Module/Event/필드·관계·문서 링크 |
| 13 | Model 공통 후보는 SW 명세로 추출하고 **사람 확정** | 출처 SW Revision 집합, stale/revalidation 관리 |
| 14 | Model↔Process **N:M** | 독립 공정 사전과 조인, 모델 중복 없이 탐색 |
| 15 | 표준 유형·카테고리 + 수동 그룹 + 저장 검색 | 데이터 소유/분류/개인 뷰 분리 |
| 16 | 기존 Item의 특정 Revision으로부터 **독립 신규 Item 파생** | `derived_from` provenance, 근거·검증 자동 승계 금지 |
| 17 | Model 공통 Item / SW 고유 Item 모두 허용 | Model Item을 모든 하위 SW에 적용/검증으로 자동 간주 금지 |

**선행 문서의 효력:** v0.4의 §15 카탈로그 5단계 UX, §16 화면 사양, §17 합성 검수와 `Log_Knowledge_Hub_UI_Reference_v0.4.html` 시각 레퍼런스는 계속 참고한다. **단독 셸/독립 URL/별도 서버 관련 문장만 이 v0.6가 명시적으로 대체**한다. v0.2의 `item_scope` 복수 소유, v0.2의 공통 기준선+SW override, v0.4의 독립 실행 Phase 0/P3 탑재 순서는 더 이상 유효하지 않다.

## 1. 실 플랫폼 확인 근거·충돌 여부

| 플랫폼 소스 | 확인된 계약 | Knowledge Hub 적용 |
|---|---|---|
| `apps/platform-web/src/menus.ts`, ADR-0065 | `log-dev` Space 및 `logMyWork/logModels/logCross/logRules` Group은 기존 Registry | 추가 Group `logKnowledge`, 정적 메뉴 선언; 객체별 동적 메뉴 등록 금지 |
| 플랫폼 #1108 (Candidate) | `System→Group→Menu` 정적, 동적 HierarchyExplorer는 선택적 SDK 확장 | `Vendor→Process→Model→SW`는 DB 조회형 메뉴 내부 노드, #1108 구현 전엔 도메인 자체 목록/트리 어댑터 |
| ADR-0095 (Decided) | Fastify 유일한 공개 입구·업무 도메인; FastAPI 분석 전용; 데이터 소유 분리 | `modules/log-knowledge`, Fastify route/handler; 분석 데이터는 소유 서비스 조회만 |
| ADR-0054 (Decided 계약) | `ActionSpec`/`menuAction`, `idempotencyKey`, `expectedVersion`, 서버가 Actor/시각 확정 | 브라우저 쓰기 계약 공통화; 실제 구현/배포 상태는 착수 시 게이트 |
| ADR-0096 | Zod 원본→JSON Schema, Python 필요 시 생성 | DTO·오류 모델 단일 TS 원본, 수작업 동기화 금지 |
| ADR-0068, 플랫폼 권한 정책 | Space≠Managed System, explicit deny 우선, 기존 Permission Service | Space 메뉴 노출과 Model/SW 객체 ACL 분리, Site Scope 강제하지 않음 |
| `apps/platform-api/AGENTS.md`, DB docs | `platform` DB, `platform_app`/`platform_migrate`, Drizzle 및 `migrations/meta/_journal.json`, DB 통합 게이트 | `knowledge` 스키마 추가 시 role/GRANT·journal·throwaway DB 검증 |
| Entity Linking 계약 | cross-system 관계는 `core.entity_links`의 registered pairs/provider | Knowledge Item↔VOC/Finding/Task 등은 별도 provider 등록 후 사용; Item↔Item은 도메인 내부 테이블 |

**불변식:** 플랫폼의 `Managed System`은 VOC/Task 작업 단위이고, 본문의 `EquipmentModel`과 동의어가 아니다. `Site/room_name` Scope도 설비사·공정·모델 분류와 다르다. `requiresScope:false`는 Site UI 자동 숨김을 뜻하지 않으므로 #1108의 명시적 scope presentation 처리까지 UX 게이트로 둔다.

### 1.1 호스팅 구조

```text
[Analytics Platform Shell / log-dev Space]
   └─ [logKnowledge 그룹 → 모델 탐색·카탈로그 관리·Item·검색·검토]
       └─ [@ap/kernel: menuQuery / menuAction / linkTo]
           └─ HTTPS same-origin [apps/platform-api / Fastify]
               ├─ Auth / Permission / Session / Audit / Attachments / Notifications  (기존 플랫폼)
               └─ LogKnowledge module: Catalog / SW Spec / Common / Item / Review / Search
                     ├─ PostgreSQL `platform`.`knowledge` schema, Drizzle migrations
                     ├─ Search outbox → Fastify-owned pg-boss job or bounded worker
                     └─ Source Adapters → Validator / Parser / Top View Studio / analytics data
                                  (소유자 API·승인된 읽기 투영·원본 ACL)
[FastAPI] 별도 분석 엔드포인트 및 데이터 자산 업무만 담당 — Knowledge Item 직접 쓰기 금지
```

- 신규 독립 도메인 서버/별도 웹 App/두 번째 인증 세션/중복 감사 테이블 없음.
- 플랫폼 코어는 지식 도메인 스키마를 직접 조회/변경하지 않는다. 메뉴/타 도메인은 Knowledge 모듈의 공개 command·read projection/provider를 소비.
- 공통 `PlatformAdapter`에 Knowledge 전용 함수들을 무작정 추가하지 않는다. 메뉴별 `EndpointSpec`/`ActionSpec` 및 필요한 경우 Module Host Port로 노출한다.

## 2. IA·화면·URL·Context

### 2.1 기존 `log-dev`에 추가할 정적 그룹(후보)

```text
Space: log-dev  (기존)
├─ 내 작업             (기존)
├─ 모델                (기존: 검증 Lifecycle 작업 화면; 재사용/중복 영역 검토)
├─ 전체 모아 보기      (기존)
├─ 기준                (기존)
└─ 로그 지식 허브       (신규 Group ID 후보: logKnowledge)
   ├─ 모델 탐색        Vendor / Process N:M / Model / SW 동적 탐색
   ├─ 전체 기술 Item   상태·유형·그룹 필터, 단일 Owner 표시
   ├─ 통합 검색        전체 권한 허용 Model/SW의 Item 검색
   ├─ 제안 검토함       인간 Contributor / AI / Validator Draft
   └─ 카탈로그 관리     Vendor·Process·Model·SW CRUD, Import, 외부 ID 검토
```

- 모델 **탐색**과 로그 **개발 검증 Lifecycle**은 같은 Model ID를 참조할 수 있어도 소유 개념을 혼합하지 않는다. `logModels`와 지식허브 모델 페이지는 사용자의 작업 목적이 달라 초기에는 분리하고, 향후 모델 상호 링크로 결합.
- 관리자 전용 '카탈로그 관리' 메뉴는 독립 UX로 유지. 권한 없는 사용자에게 메뉴/CTA를 노출하지 않되 서버도 거부한다.
- 동적 Viewer/Studio 링크, 파서/Validator Run 링크를 객체 ID로 연결하되 적절한 소유자의 권한 확인을 거친다.
- URL은 플랫폼 Registry의 canonical route를 따른다. 상세 대상의 `modelId/softwareId/itemId` 같은 안정 객체 ID만 page/route로 전달. 공정/설비사 표시명을 URL 키로 사용하거나 모든 필터·확장 상태를 매번 URL에 싣지 않는다.
- Context는 Site/time/equipment 분석 컨텍스트를 기본 불필요로 선언(`unsupported`/`requiresScope:false`의 정확한 SDK 어휘 확인). 모델·SW·검색 필터는 메뉴 로컬 문맥이며, 메뉴 간 이동 시 허용된 ID만 전달한다.
- #1108가 제공되지 않은 시점에도 목록+필터+breadcrumb+lazy-child로 기능 구현 가능하며, 특정 내부 SDK 미구현 컴포넌트명을 무조건 import하지 않는다.

### 2.2 v0.4 UI 사양의 플랫폼 전환

| v0.4 요구 | 플랫폼 통합 구체 적용 |
|---|---|
| 밝은/중립 톤·차분한 강조·밀도 있는 테이블 | `@ap/ui` 실제 semantic token, 32px 이상 테이블 계약 및 화면별 40px 후보, 불필요한 카드 제거 |
| 카탈로그 관리 4탭+등록/수정 패널 | 플랫폼 Page Header·Detail/Drawer 슬롯 안에서 구현; 기존 Shell/Sidebar **중첩 금지** |
| Import 5단계 | 파일→열 매핑→검증→충돌 해결→적용 결과, 명시적 적용 전 원본 무변경 |
| 모델 상세 | Model 공통정보 **승인된 파생본**/재검토 후보 분리; SW 목록·Model 단일 Owner Item |
| SW 상세 | 독립 Spec Revision·Module/Event·Top View Viewer·SW 전용 Item; Build 필드 없음 |
| Item 상세/검색 | 관찰/기대/해석/개선/Evidence/판단 이력 분리; 교차 SW 유사 Item 별개 결과 |
| 검토 | 사람/AI/Validator 출처 구분, Evidence–제안 Diff 비교, digest/expectedVersion 확인 |
| 선택 UX | 비선택 Bar/모듈 불투명도 극단적으로 낮추지 않음; 1~2px outline/soft highlight |
| 시각 품질 게이트 | v0.4 §16–17의 1440×900, 1280×800, 1024×768 및 기본/빈/오류/권한/충돌 캡처 유지 |

## 3. 백엔드 모듈·서비스 경계

### 3.1 권장 코드 위치 (현재 저장소의 배치와 맞춤)

```text
analytics-platform/
├─ apps/platform-web/src/menus.ts              # SPACES 유지, GROUPS에 logKnowledge 추가
├─ menus/log-dev/log-knowledge/
│  └─ src/{index.ts,pages/,components/,queries/,actions/,models/}  # 이름은 실제 패키지 컨벤션 우선
├─ apps/platform-api/src/modules/log-knowledge/
│  ├─ index.ts                   # Fastify plugin, public read/command seam
│  ├─ routes/                    # DTO 검증/HTTP·menu-query/action adapter
│  ├─ application/               # use-case + transaction boundaries
│  ├─ domain/                    # owner/Spec/Review/Assessment invariants
│  ├─ repositories/              # knowledge 스키마만 직접 접근
│  ├─ search/                    # full-text/alias/relation/query gate
│  ├─ import/                    # Excel/CSV 검증·충돌 해결·idempotent 적용
│  ├─ integrations/              # Evidence/Validator/TopView read ports
│  └─ jobs/                      # 검색 outbox, 재검토 표시, import apply
├─ apps/platform-api/src/db/schema/knowledge.ts  # 또는 knowledge/ 여러 파일
├─ apps/platform-api/migrations/NNNN_*.sql      # Drizzle + meta/_journal.json 필수
├─ packages/feature-shared/src/log-knowledge/    # 서버·화면 공유 DTO; 경계 규칙 준수
├─ packages/sdk/contract-schemas/                # 플랫폼 계약의 허용된 소유 위치
└─ docs/architecture/platform-api/api/log-knowledge.md  # 구현 시 endpoint authority 반영
```

**주의:** 메뉴 패키지의 실제 `src/index.ts`는 `manifests`만 export하는 기존 계약을 따른다. 페이지는 별도 lazy 경로에서 조립하고 이 `index.ts`로 다시 re-export하지 않는다. 위 파일들은 신규 구현 제안이지 현재 존재한다고 주장하지 않는다. `menus/log-dev/log-knowledge`의 실제 `manifest`/`package.json` 패턴은 인접 그룹을 따라 생성한다. 내부 계층이 실제 `AGENTS.md` 의존성 규칙과 충돌하면 기존 컨벤션을 우선한다.

### 3.2 서비스 모듈과 소유 범위

| 서비스/포트 | 명령(쓰기) | 조회/파생 | 금지 경계 |
|---|---|---|---|
| `CatalogService` | Vendor/Process/Model/SW CRUD, 활성 상태, Model–Process 매핑 | 계층 목록·현재 모델 카탈로그 | FastAPI 설비 마스터/기준정보의 진짜 원본과 무음 병합 금지 |
| `ImportService` | Import staging, mapping, resolution, apply | row validation·변경 비교·결과 | 업로드/preview에서 카탈로그 확정 쓰기 금지 |
| `SwSpecService` | 특정 SW의 **독립** Spec Revision 발행 | Module/Event/관계/문서, SW 간 비교 | 모델 공통 원본으로 취급/다른 SW 자동 반영 금지 |
| `CommonProfileService` | candidate 생성, 인간 승인, revalidation marking | 승인된 모델 공통의 source revision 투영 | SW 원본 수정·모델 공통 후보 자동 확정 금지 |
| `ConceptService` | SW별 의미 매핑 propose/confirm/reject | 이벤트/모듈 cross-SW 검색 보조 | 같은 Event name만으로 동치 확정 금지 |
| `ItemService` | Item 직접 발행(인간 Publisher), Revision, 아카이브 | 소유 스코프/태그/Subject/Evidence | Item owner 다중 지정·다른 모델로 이동해서 사실 혼합 금지 |
| `AssessmentService` | 판단 변경 append-only | 현재 판단 투영·이전 판단 연표 | Item 본문 Revision과 같은 상태 컬럼으로 압축 금지 |
| `DraftReviewService` | 사람/AI/Validator Draft, 수정, 승인/반려 | reviewer queue, diff, duplicate warning | AI/Validator publish·approve 금지 |
| `SearchService(SearchPort)` | 색인 상태/alias 관리 | 정확 토큰·오타·관계·모델 통합 검색 | 미승인 Draft·권한 없는 snippet 노출 금지 |
| `EvidencePort` | 출처 참조/검증 메타(선택적 첨부는 Attachment Service) | 원본 ACL·발췌 접근 | Parser DB 직접 쓰기/원본 파일 본문 중복 적재 금지 |
| `ValidatorPort` | 검토 후보만 intake | immutable Run/Rule/Finding 참조 | Hub가 Validator 판정·룰을 소유/재작성 금지 |
| `TopViewPort` | SW↔Layout/Mapping 연결 상태 갱신 | 해당 SW의 Viewer payload, Studio link | Viewer에서 Layout 편집 소유권 획득 금지 |

### 3.3 공통 서비스 재사용

- **Actor/SSO/AuthZ:** `auth`, `permissions` 기존 서비스. `Contributor`, `Publisher`, `Reviewer`, `CatalogEditor`는 새로운 플랫폼 로그인 역할이 아니라 **도메인 capability 묶음을 설명하는 용어**로 정의; 기존 Role Level을 재작성하지 않는다.
- **Audit:** `core.audit_log` 및 기존 공개 감사 append service를 같은 DB transaction 핸들로 호출. 새로운 `knowledge.audit_event` **생성하지 않음**. AI/Validator 도구 식별은 서비스 Actor + origin 메타로 저장.
- **Attachments:** 기존 attachments 업로드/다운로드·첨부 권한/보관 정책 사용. `knowledge`에는 Attachment ID와 원본 출처 메타만 둠; 별도 바이너리/원본 복제 금지.
- **Notifications:** 리뷰 할당·결정 알림은 기존 notifications service의 공식 command/outbox 이용. 사용자 승인 트랜잭션에서 상대 모듈 내부 테이블 직접 쓰지 않음.
- **Idempotency:** 기존 코어 서비스/API 규약을 재사용. browser UI는 `useMenuAction`/`menuAction`에서 키 관리; machine API도 동일 semantics가 되도록 별도 서비스 식별 키를 포함해 저장/재생.
- **Cross-system linking:** Item↔Item 유사/파생은 `knowledge.item_link`; Item↔VOC/Finding/Task 등은 `core.entity_links`의 provider/registered pair를 확장하여 양쪽 ACL 검증, 임의 관계 문자열 추가 금지.

## 4. 데이터 소유권, workspace, 안정 ID

### 4.1 소유 경계

| 데이터 | 권위 소유자 | Hub 저장 형식 |
|---|---|---|
| Vendor/Process/Model/SW 기술 카탈로그 | 초기 `LogKnowledge.Catalog`; 회사 공식 마스터 확정 시 해당 원천 | 내부 안정 ID+`external_identity_map`; 원본 우선순위 검토 |
| 설비 인스턴스·Site·측정 데이터 | Analytics/FastAPI/파서 DB | 필요 시 외부 entity reference, 직접 마스터 복제 금지 |
| SW별 Spec/Module/Event 정의 | `LogKnowledge.SwSpec` (초기 관리형) | immutable Spec Revision+정형 정의+원문 출처 |
| Model 공통 파생정보 | `LogKnowledge.CommonProfile` | 승인본과 정확한 source Spec Revision 집합 |
| Item/근거 연결/기술 판단 | `LogKnowledge.Item` | 단일 owner, 승인 revision, append-only 판단 |
| 원본 로그·Parser Raw·Validator Run | Parser/Validator/소유 저장소 | source ID/version/hash/locator/원천 ACL 검증 결과 |
| Top View 실제 layout/topology/catalog | `equipment-visualization` Studio | SW별 Layout/Mapping Revision 포인터, Viewer 렌더 데이터 |
| Actor/Workspace/권한/감사/파일 | 플랫폼 Core/Permissions/Audit/Attachments | 기존 서비스, ID 참조; 중복 테이블 금지 |

### 4.2 Workspace 규칙

- 플랫폼 구현의 도메인 행 불변식에 맞춰 **모든 Knowledge 원본 행은 `workspace_id uuid` 필수**(특별히 전역 공개 사전은 별도 승인 전에는 만들지 않음).
- Workspace별 Vendor/Process/Model/SW code scope는 같은 Workspace 내 unique 후보. 코드 원문의 대소문자/기호가 의미를 가질 수 있으므로 normalized key 정책은 사내 마스터 검증 후 확정하며, ID는 사람이 고칠 수 없도록 함.
- 트랜잭션의 모든 FK가 같은 workspace인지 DB composite key로 검증. URI/ID/경로만 바꿔 타 Workspace Item/초안을 열 수 없게 서버 권한 우선 확인.
- Model/SW owner를 바꾸면 의미가 바뀔 수 있으므로 `knowledge_item` owner는 **불변**. 다른 owner가 필요한 경우 새 Item을 만들고 `derived_from/related`를 연결한다.
- `Managed System`, `Site`와 `Model`은 서로 다른 객체. Space 및 Managed System mapping을 모델 카탈로그 FK로 사용하지 않는다.

## 5. PostgreSQL 논리 ERD 및 물리 스키마 (Candidate)

### 5.1 핵심 관계

```text
knowledge.vendor          1 ── N equipment_model ── N software_version
knowledge.process_category N ── M equipment_model  (model_process)
software_version          1 ── N sw_spec_revision
sw_spec_revision          1 ── N sw_module_definition / sw_event_definition
sw_spec_revision          N ── M common_extraction_candidate (candidate_source_spec)
common_extraction_candidate ──(human publish)──► model_common_profile_revision
sw_module_definition / sw_event_definition ──► sw_concept_mapping ──► common_concept
knowledge_item            N ── 1 [equipment_model XOR software_version]
knowledge_item            1 ── N knowledge_item_revision (immutable)
knowledge_item_revision   1 ── N item_revision_subject / item_revision_evidence / item_revision_event_relation
knowledge_item            1 ── N item_assessment_event (immutable; distinct)
knowledge_item            N ── M knowledge_item  (item_link; derive revision pinned)
knowledge_draft           1 ── N draft_revision / draft_review
catalog_import_job       1 ── N catalog_import_row ── 0..1 catalog_import_resolution
knowledge_item_revision  N ── M source_asset_ref (item_revision_evidence)
knowledge_item            1 ── 1 knowledge_search_document (latest approved revision only)
```

### 5.2 필수·후보 테이블 카탈로그

> **단계별 물리화 원칙 (v0.6 검수):** 아래 40개는 완성형 도메인의 **논리 테이블 후보 목록**이다. P0는 1–9번(카탈로그 4개 객체·연결·외부 ID·Import staging/검토)의 **실제 필요한 테이블만** 생성한다. SW Spec·Item·Draft·검색·Top View 등은 각 후속 이슈에서 관계·제약을 재검수한 후 migration한다. 40개 테이블을 미리 비워서 일괄 배포하지 않는다. Import job의 `sealed_plan_hash`와 행의 `plan_hash`를 트랜잭션에서 일치시키고, sealed 이후 계획 내용과 해시를 재작성하지 않는다.

각 행에서 **ID는 UUID**, 시간은 `timestamptz`, 단순 상태·종류는 닫힌 enum/`CHECK` 후보, 제한 길이 문자열은 `text` + Zod 길이 검증+DB `CHECK`, 구조화 명세의 확장 부분만 `jsonb`를 사용한다. 원본 문자열을 임의로 lower/strip하지 않는다. 여기서 `id`는 해당 이름 접두어의 PK이며 복합 FK에는 `(workspace_id,id)` UNIQUE를 별도로 둔다.

| 번호 | 스키마·테이블 | 핵심 컬럼 후보(공통 workspace_id·created_at 생략) | 고유성·무결성 |
|---:|---|---|---|
| 1 | `knowledge.vendor` | `vendor_id`, `vendor_code`, `code_key`, `name`, `active`, `row_version` | `(workspace_id,code_key)` unique, soft-deactivate |
| 2 | `knowledge.process_category` | `process_id`, `code`, `code_key`, `name`, `active`, `row_version` | 공정은 Vendor의 child가 아님, key unique |
| 3 | `knowledge.equipment_model` | `model_id`, `vendor_id`, `model_code`, `code_key`, `name`, `active`, `row_version` | `(workspace_id,vendor_id,code_key)` unique, vendor FK |
| 4 | `knowledge.model_process` | `model_id`, `process_id`, `assigned_at` | `(workspace_id,model_id,process_id)` PK, M:N |
| 5 | `knowledge.software_version` | `software_id`, `model_id`, `version_label`, `version_key`, `active`, `row_version` | `(workspace_id,model_id,version_key)` unique; **Build 없음** |
| 6 | `knowledge.external_identity_map` | `identity_id`, `source_system`, `source_type`, `external_key`, `target_kind`, `target_id`, `mapping_state`, `accepted_by` | source identity unique; target existence by write service/validated trigger |
| 7 | `knowledge.catalog_import_job` | `job_id`, `file_attachment_id`, `file_sha256`, `entity_type`, `mapping_json`, `status`, `plan_version`, `sealed_plan_hash`, `applied_at` | 파일 staging과 apply 분리, file size/retention |
| 8 | `knowledge.catalog_import_row` | `job_id`, `row_no`, `raw_json`, `normalized_json`, `validation_errors`, `plan_state`, `target_version`, `plan_hash`, `apply_status`, `result_target_id` | `(workspace_id,job_id,row_no)` unique; 행별 멱등 |
| 9 | `knowledge.catalog_import_resolution` | `job_id`, `row_no`, `resolution`, `resolved_by`, `resolved_at`, `expected_target_version` | row FK + conflict review, planVersion CAS |
| 10 | `knowledge.sw_spec_revision` | `spec_rev_id`, `software_id`, `revision_no`, `publication_state`, `source_doc_ref`, `content_sha256`, `published_by` | `(workspace_id,software_id,revision_no)` unique; 발행된 revision immutable |
| 11 | `knowledge.sw_module_definition` | `module_def_id`, `spec_rev_id`, `module_key`, `name`, `parent_module_def_id`, `attributes_json` | `(workspace_id,spec_rev_id,module_key)` unique; parent same spec |
| 12 | `knowledge.sw_event_definition` | `event_def_id`, `spec_rev_id`, `module_def_id`, `event_key`, `name`, `fields_json`, `trigger_rule`, `detail_doc_ref` | `(workspace_id,spec_rev_id,module_def_id,event_key)` unique; 같은 spec FK, fields_json은 버전된 정형 Zod 스키마로 검증 |
| 13 | `knowledge.sw_spec_event_relation` | `relation_id`, `spec_rev_id`, `source_event_def_id`, `predicate`, `target_event_def_id`, `rule_ref` | 둘 다 같은 Spec Revision; `expected` 명세관계만 |
| 14 | `knowledge.common_extraction_candidate` | `candidate_id`, `model_id`, `state`, `proposal_digest`, `candidate_json`, `model_version`, `created_by` | 승인 전 공통 명세 비노출; recompute는 새 후보 |
| 15 | `knowledge.candidate_source_spec` | `candidate_id`, `spec_rev_id`, `source_content_sha256` | 정확한 출처 목록; SW가 해당 Model에 속해야 함 |
| 16 | `knowledge.model_common_profile_revision` | `profile_rev_id`, `model_id`, `revision_no`, `source_candidate_id`, `published_json`, `approved_by`, `approved_at` | `(workspace_id,model_id,revision_no)` unique, 승인본 불변; 재검토 필요 여부는 읽기 Projection에서 계산 |
| 17 | `knowledge.common_concept` | `concept_id`, `kind`, `canonical_label`, `description`, `state` | Module/Event 개념 분리, 원본 SW key 아님 |
| 18 | `knowledge.sw_concept_mapping` | `mapping_id`, `concept_id`, `module_def_id?`, `event_def_id?`, `relation_kind`, `review_state`, `reviewed_by` | 정의 ID XOR; confirm 전 정확 매핑으로 사용 금지 |
| 19 | `knowledge.knowledge_item` | `item_id`, `owner_model_id?`, `owner_software_id?`, `latest_revision`, `publication_state`, `visibility`, `created_by` | **정확히 하나의 owner FK**, 변환/이동 금지 |
| 20 | `knowledge.knowledge_item_revision` | `item_id`, `revision_no`, `title`, `type_code`, `category_id`, `observation`, `expected`, `analysis_opinion`, `improvement`, `payload_digest`, `published_by`, `published_at` | `(workspace_id,item_id,revision_no)` PK, immutable |
| 21 | `knowledge.item_revision_subject` | `item_id`, `revision_no`, `module_def_id?`, `event_def_id?`, `common_concept_id?`, `subject_relation`, `spec_rev_id?` | revision 기준 스냅샷; 동일 SW 또는 Model의 명시적 context-only |
| 22 | `knowledge.item_revision_event_relation` | `item_id`, `revision_no`, `source_event_def_id`, `predicate`, `target_event_def_id`, `relation_kind`, `source_ref_id?` | `observed` vs `expected` 분리, 역방향 독립; 서로 다른 SW 정의는 공통 개념 매핑 없이 직접 동일시 금지 |
| 23 | `knowledge.item_link` | `link_id`, `source_item_id`, `target_item_id`, `link_kind`, `source_revision_no?`, `confirmed_by`, `status` | self-link 금지; `derived_from`은 source **정확한 revision** 지정; 양방향 의미는 kind별 정의 |
| 24 | `knowledge.item_assessment_event` | `assessment_id`, `item_id`, `based_on_revision_no`, `dimension`, `prior_state`, `new_state`, `rationale`, `actor_id`, `observed_at` | append-only; 검증 판단/처리 상태 별도, 과거 행 변경 금지 |
| 25 | `knowledge.item_category` | `category_id`, `category_code`, `label`, `group_key`, `active` | 관리되는 분류, Item 타입과 구별 |
| 26 | `knowledge.tag` | `tag_id`, `label`, `normalized_label` | Workspace별 중복 방지 |
| 27 | `knowledge.item_revision_tag` | `item_id`, `revision_no`, `tag_id` | 최신 승인 Revision에만 검색 반영, 과거 tag 보존 |
| 28 | `knowledge.manual_group` | `group_id`, `name`, `owner_actor_id`, `visibility`, `active` | 사용자 그룹, 카테고리/Item owner 아님 |
| 29 | `knowledge.manual_group_member` | `group_id`, `item_id`, `added_by`, `added_at` | 그룹 삭제가 Item 삭제 금지, ACL 필터 |
| 30 | `knowledge.source_asset_ref` | `source_ref_id`, `source_type`, `source_system`, `external_id`, `source_version`, `locator_json`, `content_sha256`, `sensitivity`, `attachment_id?`, `captured_at` | 원본 소유자 ACL과 별도 접근 체크; 바이너리는 기존 Attachment 소유 |
| 31 | `knowledge.item_revision_evidence` | `item_id`, `revision_no`, `source_ref_id`, `claim_kind`, `locator_snapshot`, `excerpt_digest` | 승인 Revision의 근거 스냅샷; 링크 권한은 실시간 재검증 |
| 32 | `knowledge.validation_finding_ref` | `finding_ref_id`, `source_system`, `run_id`, `rule_id`, `finding_id`, `source_version`, `source_ref_id?` | `(workspace_id,source_system,run_id,finding_id)` unique, 결과 원본 아님 |
| 33 | `knowledge.knowledge_draft` | `draft_id`, `origin`, `proposal_type`, `target_item_id?`, `owner_model_id?`, `owner_software_id?`, `base_revision_no?`, `status`, `latest_draft_rev`, `submitter_id` | AI·Validator도 draft 전용, owner XOR, 승인 전 Item 아님 |
| 34 | `knowledge.draft_revision` | `draft_id`, `draft_rev_no`, `proposal_json`, `payload_digest`, `schema_version`, `author_actor_id`, `created_at` | `(workspace_id,draft_id,draft_rev_no)` immutable, 검토된 digest 고정 |
| 35 | `knowledge.draft_review` | `review_id`, `draft_id`, `reviewed_draft_rev_no`, `approved_digest?`, `decision`, `reviewer_actor_id`, `rationale`, `reviewed_at` | 결정 불변, 승인 시 digest 필수+사람 capability+payload CAS; 반려 시 digest nullable |
| 36 | `knowledge.object_access_rule` | `rule_id`, `target_kind`, `target_id`, `grantee_kind`, `grantee_id`, `permission`, `effect`, `valid_until` | type별 존재+workspace 체크, 제한 정책; 기본 내부 공유와 deny 우선 |
| 37 | `knowledge.term_alias` | `alias_id`, `term_kind`, `canonical_token`, `alias_token`, `review_state`, `reviewed_by` | 후보 alias와 승인 alias 분리; 모델/SW 컨텍스트 |
| 38 | `knowledge.knowledge_search_document` | `item_id`, `revision_no`, `search_text`, `tsv`, `event_tokens`, `updated_at`, `index_state` | 최신 승인 Item만, `tsv` GIN·trgm GIN |
| 39 | `knowledge.search_outbox` | `outbox_id`, `aggregate_kind`, `aggregate_id`, `aggregate_version`, `operation`, `state`, `attempt_count`, `available_at` | 승인/권한 변경과 같은 트랜잭션에서 기록; retry/dedupe |
| 40 | `knowledge.sw_topview_mapping_ref` | `software_id`, `viewer_source`, `layout_id`, `layout_revision`, `mapping_revision`, `status`, `checked_at` | TopView 원본 DB가 아닌 고정 버전 참조, 변경은 명시적 |

**조건부 테이블:** `knowledge_saved_query`는 기존 플랫폼 Saved Views/사용자 설정 계약이 본 도메인 필터를 표현할 수 없을 때에만 새로 설계한다. 다른 소유자의 `saved_views`와 같은 이름/서비스를 중복 만들지 않는다. `item_revision`에 스펙 문서 출처가 필요한 경우 `sw_spec_revision`의 `source_doc_ref`를 사용하고, 추가 다중 근거가 필요할 때만 `spec_revision_evidence` 조인 테이블을 연다.

### 5.3 핵심 FK·CHECK·CAS 예시 (실행 전 migration 코드 리뷰 필요)

```sql
-- 명명/컬럼은 후보. 실제 배포 시 Drizzle migration·DB role·journal과 일치시킨다.
CREATE SCHEMA IF NOT EXISTS knowledge;

-- 개념: 표준 Item 소유는 Model XOR SW.
CREATE TABLE knowledge.knowledge_item (
  workspace_id uuid NOT NULL,
  item_id uuid NOT NULL,
  owner_model_id uuid NULL,
  owner_software_id uuid NULL,
  latest_revision integer NOT NULL DEFAULT 0 CHECK (latest_revision >= 0),
  publication_state text NOT NULL CHECK (publication_state IN ('published','archived')),
  visibility text NOT NULL CHECK (visibility IN ('internal','restricted')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, item_id),
  CONSTRAINT item_owner_xor CHECK (num_nonnulls(owner_model_id, owner_software_id) = 1),
  FOREIGN KEY (workspace_id, owner_model_id)
    REFERENCES knowledge.equipment_model(workspace_id, model_id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, owner_software_id)
    REFERENCES knowledge.software_version(workspace_id, software_id) ON DELETE RESTRICT
);

CREATE TABLE knowledge.knowledge_item_revision (
  workspace_id uuid NOT NULL,
  item_id uuid NOT NULL,
  revision_no integer NOT NULL CHECK (revision_no > 0),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  type_code text NOT NULL,
  category_id uuid NOT NULL,
  observation text,
  expected text,
  analysis_opinion text,
  improvement text,
  payload_digest text NOT NULL,
  published_by uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, item_id, revision_no),
  FOREIGN KEY (workspace_id, item_id)
    REFERENCES knowledge.knowledge_item(workspace_id, item_id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, category_id)
    REFERENCES knowledge.item_category(workspace_id, category_id) ON DELETE RESTRICT
);

CREATE INDEX item_owner_model_lookup
  ON knowledge.knowledge_item(workspace_id, owner_model_id, item_id)
  WHERE owner_model_id IS NOT NULL;
CREATE INDEX item_owner_software_lookup
  ON knowledge.knowledge_item(workspace_id, owner_software_id, item_id)
  WHERE owner_software_id IS NOT NULL;

-- SW별 version_key만 유지(초기 Build 필수 값 불허).
CREATE UNIQUE INDEX software_version_key_unique
  ON knowledge.software_version(workspace_id, model_id, version_key);

-- Relation은 방향이 중요; 뒤집힌 항목을 중복 제거하지 않는다.
CREATE INDEX item_revision_event_relation_direction
  ON knowledge.item_revision_event_relation(
    workspace_id, source_event_def_id, predicate, target_event_def_id, relation_kind
  );
```

SQL은 **핵심 제약의 예시**이고 전체 실행 migration은 아니다. 스키마 내 참조 테이블과 `(workspace_id, id)` unique/PK가 먼저 생성돼야 한다. 실제 Drizzle 마이그레이션에 모든 unique/check/FK/index를 선언하고 `migrations/meta/_journal.json`에 등록해야 한다.

**DB 트리거/서비스가 추가로 보장할 규칙:**

1. Item owner (Model/SW) 변경·리비전 UPDATE/DELETE·판단 이력 UPDATE/DELETE 금지. 운영상 법정 보관/삭제 예외는 일반 앱 role에서 불가.
2. SW Spec Module/Event가 동일 `(workspace_id,spec_rev_id)`에 속하며, Item의 SW 참조는 그 SW의 Spec. Model Item이 특정 SW를 예시로 참조하면 `context_only`가 필수.
3. `sw_concept_mapping`에 Module/Event 정의 XOR를 강제하고, Concept kind와 Definition kind 일치 검증.
4. `candidate_source_spec`의 모든 SW가 Candidate Model에 속하는지 확인, 출처 Spec Revision은 발행된 불변본만 허용.
5. `derived_from` 링크는 source Item 존재/권한 및 **정확한 승인 Revision** 고정, source와 target Item의 권한을 혼합하지 않음.
6. `latest_revision` 전진은 같은 트랜잭션 `SELECT … FOR UPDATE` + `expectedVersion` CAS, 버전이 틀리면 409/conflict; 시계값 비교로 대체 금지.
7. 원본 Evidence/Source ID는 원천 ACL 및 버전 해시와 함께 확인. 미확인 Evidence는 명시적으로 `unresolved`·`not_checked` 표시.
8. 공개·감사·인덱스 인종자 차이는 단일 트랜잭션과 retry-safe outbox로 정합성을 보존. 감사 이벤트가 실패하면 발행 전체 rollback(기존 Core audit 서비스 실패 포함).

### 5.4 인덱스·검색·아카이브

- 카탈로그: `vendor(workspace_id,code_key)`, `equipment_model(workspace_id,vendor_id,code_key)`, `model_process(workspace_id,process_id,model_id)`, `software_version(workspace_id,model_id,version_key)` B-tree.
- Item: `knowledge_item(workspace_id,owner_model_id/owner_software_id,publication_state)`, `item_revision(item_id,revision_no DESC)`, `draft(workspace_id,status,submitted_at DESC,draft_id)`.
- 관계: `item_link(workspace_id,source_item_id,link_kind)` 및 target 역조회. Event relation direction 인덱스 (`source`, `predicate`, `target`, `relation_kind`).
- 검색: `GIN(tsv)`, `GIN(search_text gin_trgm_ops)`는 `pg_trgm` 확장 사용이 승인된 뒤 적용. `term_alias` 승인 값·SW 컨텍스트를 분리하여 표기 일치만으로 의미 일치 단정하지 않음. 한국어는 기본 PG FTS만으로 완성됐다고 주장하지 않으며 사내 합성/허용 평가 샘플로 품질 시험.
- 검색 결과는 **`item_id`별 중복만 제거**. 다른 Model/SW Item을 합치거나 유사 관계만으로 같은 정체성으로 병합하지 않는다.
- 검색 문서는 최신 승인 Revision과 권한 허용 발췌만 색인. Draft/Validator 미승인 후보는 검토자 큐 전용. 객체·근거 제한, 비활성, ACL 회수, 삭제/보존 정책 변경은 Outbox invalidate로 검색/자동완성/카운트/미리보기 캐시까지 반영. 결과 생성과 반환 직전 모두 ACL을 강제.
- 아카이브는 하드 삭제가 아니며 기존 Item/Spec/관련 문서의 참조를 유지. Source 삭제/권한 회수 시 노출은 즉시 차단하고 검색 재색인은 비동기로 따라가며 fail-closed. 커서 페이지네이션은 안정 정렬 `(rank DESC, published_at DESC, item_id ASC)`로 tie-break.

## 6. 주요 Use Case·트랜잭션

### 6.1 카탈로그 생성/수정/비활성화

```text
브라우저 ActionSpec → Fastify 인증/CSRF/Capability/Workspace
→ duplicate/parent check → DB UNIQUE + row version CAS
→ [Catalog write + Core audit append + needed search_outbox] ONE TRANSACTION
→ ActionResponse(ok/version) → 관련 Query invalidation
```

- `Model`: Vendor 하나, 공정 0개 이상; 공정이 없으면 미분류로 표시. 등록 시 Vendor/Process가 동일 workspace이고 active인지 검사.
- `SoftwareVersion`: Model 아래 1개, 동일 `(model_id,version_key)` 중복 검증. 등록만으로 Spec/TopView/Validator 결과를 완료/정상으로 만들지 않는다.
- `deactivate`: 연결 Model/SW/Item/증거 cascade delete 금지. 모델의 Vendor 재배치는 단순 PATCH가 아니라 영향 범위 검토+별도 승인 후보(정책 확정 필요).

### 6.2 CSV/XLSX Import 5단계

| 단계 | 실제 저장소 변경 | 권한/검증 |
|---|---|---|
| ① 파일 선택 | 기존 Attachment 저장소의 격리/임시 업로드+`catalog_import_job` staging만 | MIME/크기/식/악성 파일/해시/원본 참조 검증 |
| ② 열 매핑 | Job mapping 갱신, Catalog 실제 행 불변 | 대상 필수 컬럼/중복 매핑/Workspace 검증 |
| ③ 검증 결과 | `catalog_import_row` 진단/preview만, Catalog 실제 행 불변 | 기존 DB 버전 스냅샷, 부모/중복/충돌/ACL 검증 |
| ④ 충돌 해결 | `catalog_import_resolution`+검토 버전, Catalog 실제 행 불변 | 사람이 원본↔현재 DB 비교 후 행별 map/skip/create/abort 선택 |
| ⑤ 적용 결과 | **확정된 행 단위** Catalog transaction + Core audit + 결과 상태 | job planVersion CAS·중복 키·재검증·부분 실패/재시도 보고 |

**원자성 후보:** 전체 파일을 하나의 거대한 트랜잭션으로 처리하지 않는다. Job 적용 승인을 하나의 고정된 Plan Snapshot으로 봉인한 뒤, `Vendor/Process → Model → SW` 위상순으로 **행/참조 묶음 단위 트랜잭션** 적용. 각 행 `(job_id,row_no,plan_hash)`로 정확히 한 번 적용; 실패 행만 재시도하되 `expected_target_version`이 바뀌면 `conflict`로 재검토. 미해결 충돌 자동 덮어쓰기/자동 신규 생성 금지. 일부 성공이면 `partial_failure`이며 집계는 성공·기존 유지·skip·실패를 구분. 내보내기 CSV 수식 주입 방어.

### 6.3 SW 독립 Spec 및 모델 공통 추출

- 특정 SW의 `sw_spec_revision`을 **독립 불변 Revision**으로 게시. 각 Module/Event 정의 ID는 그 SW Spec Revision의 namespace로 한정한다. 다른 SW와 이름·키가 같아도 동일 객체로 취급하지 않는다.
- `CommonExtractionCandidate`는 승인된 SW Spec Revision 집합을 명시적 입력으로 받고 추출 결과와 해시/모델 버전을 저장. 후보가 들어온다고 `model_common_profile_revision`을 자동 갱신하지 않는다.
- 사람이 후보 diff/근거를 검토하여 승인하면 `model_common_profile_revision` 생성. 현재 최신 승인본은 바꾸지 않고 새 Revision 추가. 출처 SW Spec이 추가/변경되면 **현재 profile은 유지**하고 기존 승인 출처와 현재 SW 발행 Revision의 차이로 `needs_revalidation`을 읽기 시점에 계산/다음 후보 생성.
- `sw_concept_mapping` 자동 유사도는 제안 상태에서만 검색 도움말로 표시하고 **confirmed**만 정확 의미 동치 검색에 사용. 서로 다른 이름이라도 의미 동치일 수 있으며 같은 이름이어도 의미 동일이라 가정하지 않는다.

### 6.4 Item 생성/수정/기술 판단

- **Contributor 사람:** 초안 생성 → 제출 → Reviewer/Publisher의 수정·승인 → `knowledge_item + item_revision + subject/evidence snapshots + core.audit_log + search_outbox` 같은 트랜잭션.
- **Publisher 사람:** 권한 검증 후 직접 Item 생성/수정·승인 Revision·감사·outbox를 같은 트랜잭션으로 기록. Review Draft가 없다고 감사/Version을 생략하지 않음.
- **AI/Validator:** Draft만. `origin`은 server Actor/auth source에서 결정; `approved_by`/`published_at` 요청 자체를 허용하지 않는다.
- **Item owner 수정 금지:** Model Item을 SW Item으로 바꾸거나 다른 SW로 가져갈 때 새 Item 생성+`derived_from` 링크. 원본 Revision·근거·상태는 자동 승계하지 않음(새 Item은 not_checked, Evidence 미부착 상태).
- **판단 변경:** `item_assessment_event` append-only. 예: `미평가 → 관찰됨 → 비정상 추정 → 정상 조건 확인`, 판단 근거·actor·시각·기준 Item Revision 연결; 과거 판단 수정 불가. 본문 편집 Revision과 기술 판단은 **서로 별개 트랜잭션/이력**.

### 6.5 Draft 승인 원자성 및 경합 처리

```text
Human UI: GET Draft(DraftVersion+Digest), 편집/근거 Diff 확인
  → POST ReviewAction(expectedDraftVersion, expectedItemVersion, approvedDigest)
    → require SESSION HUMAN + knowledge.review/knowledge.publish
    → DB TRANSACTION:
       lock draft row + target item row (기존 Item 수정인 경우)
       recheck ACL, source availability, schema, draft state, version, digest
       if outdated: conflict (no write, no replay of successful change)
       insert immutable ReviewDecision
       insert/upsert published Item + new Revision/subject/evidence/link
       append Core audit and Knowledge search outbox
       mark Draft approved + posted_item_id, atomically
    → response itemId,revision,reviewId,actionVersion
```

- `approved`는 **게시 승인**이지 `verified` 판정 아님. `verified`는 별도 근거와 판단 이벤트에서만.
- Reviewer가 열어놓고 AI가 수정한 경우 `digest/version` 불일치 → 409, 재검토 화면. 다른 편집자가 같은 Item을 수정한 경우 `expectedItemVersion` 불일치 → 409, 자동 병합 금지.
- 중복 승인/네트워크 재시도: 플랫폼 Idempotency Key+DB unique Review 결과가 정확히 한 번 게시되도록 보호. Replay는 원래 성공 응답을 돌려줌.
- `rejected/changes_requested/withdrawn`은 감사되나 정식 Item을 생성하지 않음. 민감 Evidence는 검토자에게도 원본 ACL이 필요.

### 6.6 Agent/Validator 서비스 API 최소 권한

- 별도 `/api/v1/knowledge/agent/drafts` 경로(이름 후보)를 **Fastify 단일 입구에서만** 열고 사내 service-account 인증/단기 자격·rate limit·request-size·schema-version·idempotency 검사. 브라우저용 `menuAction`과 서비스 API 전송은 달라도 같은 `DraftService`/검증 규칙·감사를 공유.
- 서비스 자격으로 `publish/approve/updatePublished`, Catalog 직접 업데이트, Spec/Common/Concept 자동 확정은 금지. 권한 요청 범위도 실제 제출이 허용된 Model/SW로 제한.
- `actorId/approvedBy/timestamps/visibility` 같은 신원·승인 필드를 요청에서 신뢰하지 않고 서버가 부여. 원문 로그를 요청에 실어 무분별하게 복제하지 않고 검증 가능한 `sourceId/version/locator/hash` 참조 및 정책 허용 발췌만.
- 서비스 응답은 `202 Accepted`(후보) + `draftId/status/reviewUrl/duplicateCandidates/warnings`; **publishedItemId 없음**. `Skill`은 스키마 조회 → 허용된 자료 확인 → 전체 Item 유사 검색 → Draft 작성 → 제출 → human review 링크 기록. MCP 서버는 P0 필수 아님.
- Validator 후보는 `(sourceSystem,runId,findingId)` 멱등 키로 수집하되 자동 게시하지 않으며, 같은 Run에서 여러 Finding이 있더라도 일괄 Item 발행 금지.

## 7. 플랫폼 API·SDK 계약 (Candidate)

### 7.1 메뉴 단위 조회: `EndpointSpec` / `menuQuery`

| 조회 ID 후보 | 입력 | 핵심 응답/권한 |
|---|---|---|
| `knowledge.catalog.tree` | `parentKind/parentId`, cursor, limit | Vendor/Process/Model/SW dynamic nodes, ACL-filtered ancestor |
| `knowledge.catalog.models` | vendor/process[]/q/status/cursor | Model ID 기준 중복 없는 목록 |
| `knowledge.catalog.modelDetail` | `modelId` | common-profile approved/pending 분리, SW 목록 |
| `knowledge.catalog.softwareDetail` | `softwareId` | SW별 Spec/Item/TopView mapping 및 미연결 상태 |
| `knowledge.spec.software` | `softwareId`, `specRevisionId?` | 정의/필드/조건/관계, 승인/권한 적용 |
| `knowledge.items.list` | owner/type/category/status/group/filter/cursor | owner가 Model 또는 SW 하나인 개별 Item 목록 |
| `knowledge.items.detail` | `itemId`, `revision?` | Item + 승인 Revision + ACL-filtered Evidence + assessment history |
| `knowledge.search` | q, owner filters, relation option, cursor | ACL-safe highlights, direction reason, item별 독립 결과 |
| `knowledge.items.similar` | text/subject/ownerContext | 검토된 alias·relation 기반 유사 **Item** 추천 |
| `knowledge.drafts.queue` | origin/status/owner/cursor | Reviewer ACL 기반 사람·AI·Validator 후보 |
| `knowledge.drafts.detail` | draftId | revision/digest/origin/evidence warnings/duplicate |
| `knowledge.catalog.importDetail` | jobId/cursor/status | 5단계 staging/resolution/results; admin ACL |

- 모든 EndpointSpec은 `menuId`, `permission`, `requiresScope:false`, 허용 필드·응답 스키마·한도를 *플랫폼의 실제 계약 모양*으로 선언; Site 관련 Context 적용 금지.
- `POST /api/v1/menu-query` 또는 실제 플랫폼 전송 표면으로 집결. Fastify에서 **서버 소유 선언 사본**과 Actor/ACL을 대조. 형식이 맞지 않으면 reject.
- Source/Evidence raw access는 별도 읽기 권한을 매번 재검증하고 snippet/카운트/자동완성에서도 누출 방지.

### 7.2 사용자 쓰기: `ActionSpec` / `menuAction`

| Action ID 후보 | 권한 후보 | `expectedVersion` | 성공 후 조회 invalidation |
|---|---|---|---|
| `knowledge.catalog.vendorCreate/Update/Deactivate` | `knowledge.catalog.manage` | Update/Deactivate 필요 | catalog.tree/models |
| `knowledge.catalog.processCreate/Update/Deactivate` | `knowledge.catalog.manage` | Update/Deactivate 필요 | catalog.tree/models |
| `knowledge.catalog.modelCreate/Update/Deactivate` | `knowledge.catalog.manage` | Update/Deactivate 필요 | catalog.models/modelDetail |
| `knowledge.catalog.softwareCreate/Update/Deactivate` | `knowledge.catalog.manage` | Update/Deactivate 필요 | modelDetail/softwareDetail |
| `knowledge.catalog.importValidate/Resolve/Apply` | `knowledge.catalog.import` | plan/version 필수 | importDetail/catalog.models |
| `knowledge.spec.publishRevision` | `knowledge.spec.publish` | 원본 SW/version 필수 | spec/softwareDetail/common candidate |
| `knowledge.common.propose/Approve` | 각각 `knowledge.common.propose` / `knowledge.common.approve` | 승인 시 candidate digest/버전 필수 | modelDetail |
| `knowledge.concept.propose/Confirm` | `knowledge.concept.propose` / `knowledge.concept.approve` | Confirm 필요 | Spec/search |
| `knowledge.draftCreate/Update/Submit` | `knowledge.draft.create` | Update/Submit 필요 | drafts.queue/detail |
| `knowledge.draftReview` | `knowledge.review` 및 게시 권한 정책 | draft digest+item current version | drafts.queue/items/detail/search |
| `knowledge.itemPublish/Revise` | `knowledge.publish` (인간 전용) | revise 필요 | items/detail/search |
| `knowledge.itemAssess` | `knowledge.assess` | 기반 Item Revision 필수 | items/detail |
| `knowledge.itemDerive` | `knowledge.draft.create` | source revision 지정 | draft detail |
| `knowledge.itemArchive` | `knowledge.manage` | 필요 | items/search |

- 위 권한 이름은 **제안**. 기존 플랫폼 capability 네임스페이스·grant metadata 및 Admin bypass 정책에 등록할 때 검토한다. `Publisher`/`Reviewer`라는 새 전역 Role Level을 추가하지 않는다.
- `ActionResponse`의 `ok/invalid/conflict/forbidden/not_found/error/unknown`, replay/version/fieldErrors 규칙은 ADR-0054 소비. AI/Machine 전용 경로는 브라우저 액션 대체가 아니라 **서비스 Actor Draft 제출 어댑터**일 뿐.
- Import 바이너리는 기존 플랫폼 Attachments 업로드 경로를 사용하고, `menuAction`에는 반환된 attachment ID 및 데이터 검증 요청만 실어 HTTP payload 제한을 회피.

### 7.3 HTTP/에러·버전·보안

- 도메인 CLI/Agent API가 필요하면 `/api/v1/knowledge/*` 서비스 전용 경로를 Fastify에 추가; 동일 인증/권한·행위 로그. 브라우저는 무단 `fetch` 직통 구현보다 플랫폼 Port를 우선.
- DTO Zod 원본, JSON Schema 생성, 필요시 OpenAPI 문서. SDK 서버 선언과 실제 핸들러의 drift를 CI 검사. 버전/스키마 미지원 시 `invalid`/명확한 코드.
- 읽기 payload는 수정 버전, 데이터 출처(`manual/AI-approved/validator-ref`), observed/verified 차이, 미연결/미평가 상태를 반드시 분리.
- 404/403 선택은 숨겨진 모델이 존재함을 누출하지 않도록 플랫폼 정책을 따름; 직접 URL 접근·검색 결과 모두 server-side gate.
- 텍스트/Markdown sanitization, CSV formula escape, object storage read ACL, files size/line limits, rate limit, CSRF/session validation (browser), service token rotation (agent), injection-safe handling(원문은 untrusted data).

## 8. 권한·ACL 상세 정책 (Candidate)

| 사용자·서비스 유형 | 읽기 | 초안 | 직접 게시 | 검토·승인 | 카탈로그 관리 |
|---|---|---|---|---|---|
| 사내 기본 Viewer | 접근 가능한 공개 내부 Model/SW/Item | X | X | X | X |
| 사람 Contributor | 권한 범위 내 | O | X | X | 별도 부여 필요 |
| 사람 Publisher | 권한 범위 내 | O | **O** | capability에 따라 | 별도 부여 필요 |
| 사람 Reviewer | 권한 범위 내 + 허용된 검토함 | O | 별도 권한 필요 | **O** | 별도 부여 필요 |
| Catalog Editor | 권한 범위 내 | 별도 권한 | X | X | **O** |
| 사내 Agent/Validator 서비스 | 명시된 검색/근거 범위만 | **O (제출만)** | **절대 X** | **절대 X** | **절대 X** |

- `Space` 접근 권한/메뉴 권한, `workspace` 일치, capability grant+explicit deny, 객체 제한 ACL, Evidence 원천 ACL, 실제 작업자 session/서비스 신원 **모두** 체크. 모델 제한은 그 SW/Item/근거로 내려가며, 더 하위의 허용 grant만으로 상위 제한을 우회하지 못하게 한다.
- 기본 사내 공유는 **로그인한 내부 사용자에게 무제한 기밀 원본 공개**가 아니다. 민감 Model/SW/Item/Source는 선택적 `restricted`이며 actor/team 세부 grant와 현재 권한을 서버에서 계산. 팀/역할 정보는 Core의 현재 projection을 읽고 본 스키마에 멤버십 복제 금지.
- 객체 제한 규칙은 deny-first, 직접 URL/모델 트리 자손/검색 suggestion/총 개수/캐시/Export/AI 입력에 적용. 권한 회수는 기존 플랫폼의 sessionVersion/permission mechanism과 재평가되도록 설계.
- Evidence는 Item 공개여도 원본이 restricted면 본문/파일 다운로드 권한을 추가 검증하고 표시는 `근거 존재(접근 제한)` 등 안전 메타만 허용. 제목/미리보기 역시 기밀 포함 시 노출 불가.
- 자기 승인 가능 여부, `Publisher`의 승인 가능한 Draft 범위, 객체 ACL granularity, export 권한/retention은 보안 승인 전 `Open`으로 명시한다. AI는 승인 권한 경로를 받을 수 없는 신원 종류로 강제하며 단순 UI 숨김으로 대체하지 않는다.

## 9. 검색 기술 설계

**핵심 목표:** `stepprcess가 process start보다 먼저 발생` 검색에 대해 SW별 이벤트 문맥을 보존하면서 **동일 SW의 `STEP_PROCESS BEFORE PROCESS_START` 관찰과 반대 방향·명세상 기대를 구별**한다.

1. 원문 query/언어 보존 → 정규화 후보·`term_alias` 제안. 기술 토큰은 SW/Module 문맥을 포함해 추정; 불확실한 alias는 강제 교정하지 않음.
2. 후보 생성: 승인 Item 최신 Revision의 `tsvector` 정확/본문, `pg_trgm` 문자열 근접, SW-specific Event 관계 방향 매칭, confirmed common concept 매핑; 검색 요청마다 원천 LLM API 호출하지 않음.
3. 계층형 ACL 상속과 Actor capability를 후보 SQL/읽기 Projection에서 먼저 제한; 최종 결과·snippet·근거까지 재검증. 상위 Model 비공개면 하위 자동완성·통계도 비공개.
4. 랭킹(정량값은 측정 후): 동일 SW의 정확 Event+방향+관찰 kind > 정확 토큰 > confirmed concept > 승인 alias > text/trigram. 역방향이나 expected-only는 같은 결함 일치로 상위 분류 금지.
5. `item_id` 1회 결과, 다른 Model/SW의 유사 Item은 **별도 결과**와 `related/similar` 링크. 동일한 제목이라고 자동 병합 금지.
6. 변경 시 `search_outbox` → Worker retry/idempotent upsert, index revision check(낡은 outbox가 새 Revision을 덮지 않음). ACL 회수는 캐시/정형 검색도 즉시 fail-closed.
7. 성능 **가설**: 100,000 Item에서 서버 p95 ≤ 300ms, 30 동시 사용자, 기본 20/페이지; 실제 데이터+ACL+한국어 토큰으로 EXPLAIN ANALYZE/부하검증 전 보장 불가.
8. `SearchPort` 뒤의 PG FTS+trgm P0, 향후 검증된 사내 embedding+pgvector·OpenSearch 대체 후보. 기밀 원문 외부 모델 전송 금지.

## 10. 통합 구현 순서·의존성

| 순서 | 개발 슬라이스 | 종료 조건·게이트 |
|---:|---|---|
| 0 | 플랫폼 최신 Registry/SDK/권한·DB·실서버 `menuAction` 구현 상태 확인, UX Shell 가용성 점검 | #1108/#1087 및 ActionSpec 미구현 부분을 정확히 의존성으로 식별; 기존 MARS 회귀 없음 |
| 1 | `logKnowledge` 그룹·메뉴 기본 선언 + Fastify module skeleton + `knowledge` schema/Drizzle migration/테스트 | `log-dev` 단일 Host, 새 로그인 앱 없음, `meta/_journal.json` 등록, throwaway DB migration |
| 2 | Vendor/Process/Model/SW Catalog CRUD+비활성화+M:N+권한·감사 | 단일 Model ID, SW 독립성, inactive 보존, 403/409/중복 테스트 |
| 3 | Catalog CSV/XLSX 5단계 Import, 외부 ID map | preview 원본 불변, 충돌 승인, 행별 partial result/replay, injection 시험 |
| 4 | SW Spec Versioned Definitions + Model Common candidate/provenance + human approval | SW cross-write 없음, 출처 정확성, stale flag, Build 미포함 |
| 5 | Item single owner/Revision/Assessment/Evidence/분류·그룹·검색 | 독립 Item 검색, Model Item 미전파, 증거 ACL, 판단 이력 불변 |
| 6 | 사람/AI/Validator Draft Review 및 Skill | AI publish/approve API 우회 불가, digest CAS, human direct publish 가능 |
| 7 | Top View Viewer+Studio link, Parser/Validator 실제 Evidence Adapter | SW 매핑 유지, Viewer 실제 동작, 검증과 기술 판단 구분 |
| 8 | 통합 검색 품질/성능·보안/UX, 원본 ID 연결·운영 문서 | ACL/한국어/방향 반례, 1440/1280/1024 Visual regression, 운영 rollback |

- **Phase 0 제품 목표로 카탈로그 4개 엔터티 CRUD+Import는 반드시 포함**. 다만 플랫폼 권한/Host 공통 계약이 아직 Candidate/미구현이면 임시 우회(독립 앱, 직접 FastAPI 호출, 자체 인증)를 만들지 말고 해당 의존성과 검증 게이트를 명시한다.
- 실제 업무 Space ID는 **`log-dev`**이다. 새로운 Space를 중복 등록하지 않는다.
- 별도 GitHub 이슈·PR·코드는 이 설계 문서 갱신과 구별한다. 문서 저장만으로 구현 완료나 플랫폼 이슈 #1108 해결을 선언하지 않는다.

## 11. 테스트·보안·품질 인수 매트릭스

| 중요 반례/동작 | 기대 결과 | 검증 계층 |
|---|---|---|
| 같은 Model을 ETCH/CLEAN 두 Process에 연결 | Model 행·ID는 하나 | DB composite FK/UNIQUE, API, UI |
| 같은 버전 문자열을 다른 Model SW에 등록 | 허용; 같은 Model key 중복은 거부 | DB unique, API |
| SW 1.0 Spec 수정 시 SW 2.0 Spec | 자동 변경 없음; 별도 revision | DB, service |
| Model common 추출 시 SW 1개 | `1개 SW 기반`, 범용 승인으로 자동 단정 불가 | service/UI |
| Model common 승인 후 출처 SW Spec 변경 | 과거 승인본 유지, 재검토 필요 표시 | job/provenance/e2e |
| Item에 Model과 SW owner 두 개 전달 | 저장 거부; 정확히 하나만 | Zod, DB XOR/Composite FK |
| 서로 다른 SW의 유사 Item 둘 | 2개 별도 Item + 관계 링크 | Search/e2e |
| Model Item을 SW 상세에서 참조 | 자동으로 모든 SW 검증 판정하지 않음 | API/UI |
| Item 파생 초안 | 새 ID, exact parent rev; Evidence/assessment 초기 미확인 | service/DB |
| 같은 이름 Event 다른 SW | confirmed mapping 없으면 동치 검색 실패/후보만 | Search/contract |
| `A BEFORE B` vs `B BEFORE A`; observed vs expected | 동등 결함 취급 금지 | SQL/search tests |
| 판단 `이상 추정→정상 조건` | 과거 판단/해석/작성자/근거 모두 보존 | append-only DB test |
| 사람 Publisher 직접 발행 | 정식 Item+Revision+Audit+outbox 생성 | integration |
| AI/Validator service publish API 호출 | server-side forbidden; UI 우회 불가 | security integration |
| AI Draft 제출 후 사람 검토 중 payload 바꿈 | digest/expectedVersion conflict, 게시 없음 | concurrent integration |
| 동일 Draft 승인 재전송 | 단일 Item/Revision, replay same result | integration/idempotency |
| CSV/XLSX preview | catalog row 0변경; staging만 | DB wire integration |
| Import 적용 중 일부 row 실패 | partial_failure, row replay 안전, 덮어쓰기 없음 | integration |
| 비활성 Model / Group 삭제 | Item/Spec/Evidence 보존 | FK/cascade tests |
| 제한 Model/Evidence의 직접 URL/검색/autocomplete/count | 모두 비공개, 권한 404/403 안전 처리 | ACL no-leak tests |
| 지식 검색 outbox 지연·오래된 메시지 | 승인 원본 불변, 최신 version만 색인 | background/integration |
| MARS 분석 Scope·Menu 정상 작동 | 기존 Regression 통과, Site 없는 메뉴만 Scope 표현 제한 | platform E2E |
| 실제 Top View Layout 미연결 | Viewer가 가짜 도면 대신 미연결 표시 | UI/E2E |
| 1440/1280/1024 및 키보드/강조 강도 | v0.4 §16–17 시각·접근성 기준 | screenshots/Playwright |

**테스트 실행 위험:** `pnpm --filter @ap/platform-api test:integration`은 DB를 초기화/재시드하므로 **반드시 폐기 가능한 DB**에서만 실행. 기본 `pnpm test`는 DB-free 경로만 증명하므로 DB 계약 검증으로 대체할 수 없다. RBAC 테스트는 `platform_app`로, 마이그레이션은 `platform_migrate`로 수행해야 `GRANT` 검증이 의미 있다.

## 12. 설계 자체에 대한 적대적 검수(2026-10-30)

| 검수 관점 | 발견한 충돌/실패 가능성 | 반영한 수정 | 남은 확인 |
|---|---|---|---|
| 제품 정책 | v0.2에는 Item M:N 소유, v0.4 결정에는 단일 소유 | Model/SW owner XOR; N:M은 Subject/Process/Group뿐 | Owner 변경 업무 수요 |
| 명세·버전 | 과거 공통 baseline+SW override는 v0.4와 충돌 | SW Spec 독립 원본, common은 사람 승인 파생본 | 정확한 Spec field vocabulary |
| 도메인 형상 | SW Build 필수 키가 사용자 결정과 충돌 | `software_version`만, Build 계층 제외 | 장기 Build 필요 시 schema migration |
| 플랫폼 아키텍처 | 독립 서버/독립 로그인/독립 DB 및 별도 audit은 중복 소유 | `log-dev` 내 정적 Group+Fastify+`knowledge` schema+Core 서비스 재사용 | 실제 `menuAction`·신규 `menuQuery` 핸들러 구현 현황 |
| 권한·보안 | Site Scope 숨김을 ACL 삭제로 오해할 수 있음 | Space/menu/data/evidence 권한 독립, #1108 UI 정책 의존 | #1087 Site scope 미결정과 무관한 권한 최소 set |
| 이력 무결성 | Item Revision만 불변이면 Evidence/Subject/Tag가 나중에 바뀜 | **Revision별 근거·Subject·Tag·관계 스냅샷** | 물리 DDL 전체 FK/제거 정책 |
| Agent 경합 | 초안 승인 중 AI 수정 또는 Item 경합 | draft digest+item expectedVersion+row lock+트랜잭션 | machine credential 발급/회수 |
| 검색 | 교차 SW 유사 현상 자동 합치기/역순검색 위양성 | `item_id`만 중복 제거, Event 방향/관찰·기대 분리 | 한국어 검색 정량 품질 |
| 카탈로그 | 파일 Preview가 바로 DB 쓰거나 parent 없는 row 생성 | 5단계 staging, immutable Plan, row idempotency, 위상순 적용 | 실제 파일 한도·보관 정책 |
| 감사·원본 | 기밀 로그 복제/첨부 중복/다른 모듈 테이블 직접 쓰기 | Evidence 포인터+플랫폼 Attachment·Core Audit+Owner port | 실제 원천 ACL adapter 인증 |
| Top View | Viewer 링크만 제공한 뒤 완성으로 보고 | 실제 Viewer 최종 DoD, Studio 편집, SW mapping | equipment-visualization viewer 계약/버전 |
| UI | Standalone 전용 Shell와 플랫폼 Shell 이중 렌더 | platform Shell 단독, v0.4 UX 상세 유지 | #1108 실제 Hierarchy 컴포넌트 출시 |

### 12.1 아직 사람·운영 정책 결정이 필요한 항목

1. 카탈로그의 외부 공식 기준정보 원천, `vendor_code/model_code/version_key` 정규화·유일성 정책, 재소유 이동 승인.
2. `knowledge` Workspace/조직 간 공유 범위, default internal vs restricted 모델의 객체 ACL 수용 기준, 근거 source ACL과 결합 방식.
3. Contributor 작성 초안의 자기 승인 허용 여부, Publisher가 다른 사람·AI Draft도 승인 가능한지, Reviewer/Publisher 분리 구체 Capability Matrix.
4. 사내 Agent/Validator 서비스 계정 발급·토큰 갱신·네트워크·호출량·감사 보관, 원본 로그 발췌 허용 정책.
5. Catalog CSV/XLSX 크기·시트/파일 정책·보관 기간·개별 행 실패 처리/재시도 기간, 외부 변경 권위 우선순위.
6. SW Module/Event 안정 키 정의, 원본 Spec 문서 식별자, Model Common Candidate의 임계/동치 판정 기준.
7. 기존 Platform Saved Views의 본 도메인 검색 필터 수용 능력, `knowledge_saved_query`가 정말 필요한지.
8. Top View Viewer/Studio 실제 배포 버전 및 SW Mapping ID, Validator Finding 안정 참조 계약, Parser 원본 접근 API.
9. 플랫폼 `menuAction`/동적 HierarchyExplorer/#1108·권한 세부/#1087의 **실제 구현 상태**(ADR 결정 ≠ 구현 완료) 및 통합 단계.

미결을 무음으로 `Decided`로 승격하거나 일반 사용자에게 사내 민감 자료를 일괄 공개하지 않는다. 미결은 개발 이슈의 별도 결정 게이트로 관리한다.

## 13. 문서·구현 권위 및 갱신 규칙

- **이 v0.6:** 플랫폼 직접 탑재 방향, 기술 데이터 소유권, DB/API 제약, 트랜잭션/권한/검수의 기준선. 상세 SQL은 실행 전 후보.
- **v0.4:** 제품 결정 1–17번, 카탈로그 관리 Phase0 §15, UI/UX 상세 §16–17의 원본. 이 v0.6와 v0.4 사이에서 *통합 방식·Standalone 관련 문장*만 v0.5가 대체한다. v0.4 UI 레퍼런스 HTML은 정적 참고 자료, 런타임 검증 대체 불가.
- **플랫폼:** `docs/contract/*`, `docs/adr/0095...`, `0054...`, `0096...`, `docs/architecture/platform-api/02/03/04/05/06...`, `apps/platform-api/AGENTS.md`, 실제 구현/마이그레이션·API 스키마가 실행과 기술 경계의 우선 원본.
- 구현 시 `docs/architecture/platform-api/api/log-knowledge.md` 및 플랫폼 DB/권한·계약 문서에 최종 API/DDL을 반영. 변경 이슈/PR은 제품 v0.4 사용자 결정 및 마이그레이션/보안 게이트를 근거로 나눠 추적.
- 실제 배포 완료/이슈 등록/코드 변경/테스트 통과와 이 설계 문서의 작성은 별개의 상태. **이번 작업 범위는 검수된 설계 문서 최신화**다.

### 대조한 플랫폼 참고 문서

- [Analytics Platform repository](https://github.com/hjung3113/analytics-platform)
- [ADR-0095 — Dual Backend](https://github.com/hjung3113/analytics-platform/blob/main/docs/adr/0095-dual-backend-fastify-core-fastapi-analytics.md)
- [ADR-0054 — Menu Action](https://github.com/hjung3113/analytics-platform/blob/main/docs/adr/0054-write-port-declared-actions-idempotency-version.md)
- [ADR-0096 — Zod contract source](https://github.com/hjung3113/analytics-platform/blob/main/docs/adr/0096-contract-schemas-zod-source-and-reference-implementations.md)
- [ADR-0068 — Permission and system link](https://github.com/hjung3113/analytics-platform/blob/main/docs/adr/0068-permission-scope-and-business-system-link.md)
- [Platform hierarchy UX issue #1108](https://github.com/hjung3113/analytics-platform/issues/1108) (제품 기능 구현 범위 아님)
- [Site Scope Permission issue #1087](https://github.com/hjung3113/analytics-platform/issues/1087)
- [Repository layout](https://github.com/hjung3113/analytics-platform/blob/main/docs/integration/repository-layout.md)
- [Backend modules](https://github.com/hjung3113/analytics-platform/blob/main/docs/architecture/platform-api/02-domain-module-boundaries.md)
- [Database migrations](https://github.com/hjung3113/analytics-platform/blob/main/docs/architecture/platform-api/04-database-and-migrations.md)
- [Backend AGENTS](https://github.com/hjung3113/analytics-platform/blob/main/apps/platform-api/AGENTS.md)

---

**최종 설계 원칙:** `log-dev` 내 단일 플랫폼 Shell·Fastify 업무 모듈·PostgreSQL `knowledge` 도메인으로 붙인다. **Model↔Process는 N:M, SW 명세는 독립 원본, Item 소유는 Model/SW XOR, 모델 공통정보는 사람 승인 파생본, AI/Validator는 초안만, 감사/파일/인증은 플랫폼 공통 소유**를 유지한다.

## 14. 2026-11-01 GitHub 등록 전 재검수 보정 및 실행 게이트

### 14.1 확인된 플랫폼 상태 (문서 후보와 구분)

- 저장소 `hjung3113/analytics-platform`의 기본 브랜치 `main` / **public**. 비기밀 설계와 합성 예시만 게시하며 실제 장비/SW 식별정보·로그·도면·내부 호스트·토큰·개인정보는 넣지 않는다.
- 현재 메뉴 패키지는 `menus/<system>/<group>/src/index.ts`의 `manifests` export 형태다(`menus/AGENTS.md` 확인). 이전 v0.5 표에 있던 `manifest.ts` 가정은 `index.ts`로 교정했다.
- `apps/platform-api/src/modules/*`·`platform` DB·Drizzle journal·`platform_app/platform_migrate` 분리는 현재 플랫폼 계약과 일치한다.
- #1098(폴더 이동), #1099(SDK 내비게이션/명칭 변경)은 **closed**. 더 이상 미완료 선행 작업으로 표시하지 않는다. #1108(범용 계층 탐색)은 **open**이며 도메인 종속 기능은 이 이슈로 보내지 않는다. #1087(분석 Site 부여)은 **open**이지만 Knowledge가 Site Scope를 요구한다는 의미가 아니다.
- 브라우저 `menuAction` 계약과 HTTP adapter 정의는 확인했으나 **Knowledge용 Fastify handler/권한/Drizzle migration은 아직 존재한다고 주장하지 않는다**. 구현 착수 게이트에서 실제 server route/readiness 확인.

### 14.2 설계 결함/보완과 보류 사항

| 검수 항목 | 보정/정책 | 인수 판단 |
|---|---|---|
| Import sealed plan 일관성 | `catalog_import_job.sealed_plan_hash` + `catalog_import_row.plan_hash`를 후보 컬럼에 추가; 적용 시 planVersion·해시·행 상태 CAS, 중복 적용 방지. 원본 Job/Row가 재계획 가능하다면 새 planVersion에서 **기존 적용 결과를 덮어쓰지 말 것** | P0 #1195에서 schema/integration 확정 |
| 40개 테이블 과설계 위험 | 전체 논리 설계는 보존, P0에서 카탈로그/Import 최소 스키마만 materialize. 후속 기능 도입할 때 FK/인덱스/상태 머신 확인 | #1193–#1201 개별 PR |
| 메뉴 코드 실제 진입점 | `src/index.ts`는 manifests 전용; 메뉴·코어 import 경계 및 SDK tag/CODEOWNERS 준수 | P0 #1193 |
| 문서 우선순위 | v0.4 단독 셸/URL/DB·인증 관련 표현은 legacy; v0.6 및 현재 플랫폼 계약 우선. UI 독립 레퍼런스 HTML은 **이번 PR에 포함되지 않음**; 텍스트 화면·테스트 시나리오는 v0.4 §15–17에 보존 | UI #1194/#1201 |
| 카탈로그 공식 source of truth | 관리 원천·code_key 정규화·외부 ID 매핑 권위·모델 소유 이동은 구현 전에 명시적 결정. 서로 다른 외부 키 자동 병합 금지 | #1194/#1195 결정 게이트 |
| 검색·Evidence 보안 | 검색 색인과 텍스트 스니펫/자동완성의 동적 ACL 재검증, source ACL 철회 fail-closed. PG FTS의 한국어 성능 미보장 | #1199/#1201 실측 |
| 승인 권한/서비스 신원 | AI/Validator Draft-only, human session + capability, digest/expectedVersion CAS. 자기 승인·Reviewer/Publisher 권한 매트릭스와 machine token 보관 정책은 별도 사람 결정 | #1198 결정 게이트 |
| 데이터 소유권/Excel 처리 | Fastify가 Knowledge 도메인 변경의 유일한 소유자. 대용량 파일 파싱을 별도 내부 helper에 위임하더라도 카탈로그 쓰기 권위는 옮기지 않음 | #1195 아키텍처 게이트 |

### 14.3 구현 단계/연결

상위 추적 이슈: [#1192](https://github.com/hjung3113/analytics-platform/issues/1192). P0 [#1193](https://github.com/hjung3113/analytics-platform/issues/1193)·[#1194](https://github.com/hjung3113/analytics-platform/issues/1194)·[#1195](https://github.com/hjung3113/analytics-platform/issues/1195), P1 [#1196](https://github.com/hjung3113/analytics-platform/issues/1196)·[#1197](https://github.com/hjung3113/analytics-platform/issues/1197)·[#1198](https://github.com/hjung3113/analytics-platform/issues/1198)·[#1199](https://github.com/hjung3113/analytics-platform/issues/1199), P2 [#1200](https://github.com/hjung3113/analytics-platform/issues/1200)·[#1201](https://github.com/hjung3113/analytics-platform/issues/1201).

**이 PR은 설계 문서만 추가한다.** 생성된 폴더/문서는 feature implementation, 실행 가능한 migration, API 구현, 실제 운영 검증을 의미하지 않는다.
