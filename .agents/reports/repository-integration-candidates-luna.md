# 원격·로컬 저장소 통합 후보 조사 — Luna Max

조사일은 2026-09-22이고, 대상 플랫폼 기준 커밋은 `analytics-platform@ad5b18b`이다. 요청 범위는 `hjung3113`이 소유하고 직접 만든 것으로 근거를 확인할 수 있는 저장소뿐이다. 이 보고서에서 말하는 구현 성숙도는 파일·커밋을 정적으로 읽은 결과이며, 별도의 빌드·테스트·실서비스 호출을 실행했다는 뜻이 아니다.

> 후속 사용자 의견: `vocpage`는 FeedbackOps로 대체됐지만, FeedbackOps에 없는 유용한 부분은 선별 활용할 수 있다. 아래 평가는 조사 시점의 추천이며 채택/제외를 확정하는 규칙이 아니다. 후보를 넓게 모으는 최신 정리 공간은 [기존 프로젝트 활용 아이디어](../../docs/integration/repository-ideas.md)다.

## 결론

현재 실제 통합 결정을 진행할 가치가 있는 후보는 두 가지다.

1. **`ProjectGraph`** — raw field → parser → reference lookup → output column을 `evidence_id`와 lineage로 묶는 정적 분석 산출물을 **선택적으로 재사용**한다. 플랫폼 Kernel에 소스 코드를 넣기보다, 나중에 Data Trust·진단 화면이 소비할 versioned evidence/lineage artifact 또는 별도 read-only adapter로 연결하는 것이 맞다.
2. **`FileGateway`** — 원문 로그·Configuration 파일을 설비와 기간으로 조회·다운로드하는 **별도 서비스** 후보이다. raw evidence drill-through 요구와 MSSQL/FTP 운영 경계가 확정될 때만 OpenAPI adapter/context link로 붙인다.

`context_recognized_parser`는 이미 설계상 upstream 원천으로 분리돼 있으므로 흡수 후보가 아니다. `standard-log-lifecycle`와 `log-contract-lens`는 좋은 도메인·검증 UX 참고지만 구현이 없다. `jira-voc-nexus`와 `vocpage`는 현재 고정된 FeedbackOps와 VOC/권한/감사 범위가 중복되므로 신규 병합하지 않는다. `agent-platform`, `thin-agent-harness`, `agent-migration-pipeline`은 에이전트 운영·마이그레이션 도구이지 분석 플랫폼 도메인 구현이 아니다.

이 판단은 플랫폼 문서의 경계를 우선했다. Platform Kernel은 Shell/Auth Context/Menu Registry/Route·URL/Global Context/Permission Scope/Data Trust/Audit-aware UX를 소유하고, Equipment business logic·특정 지표 계산·VOC 상태 전이는 소유하지 않는다([플랫폼 UI 계약](../../docs/06_platform_ui_contract.md#L66-L133)). 메뉴는 선언형 Registry가 소비하는 manifest/route/permission/supported context/page type이어야 한다([Menu Extension Contract](../../docs/06_platform_ui_contract.md#L137-L159)). 데이터 측면에서는 parser PostgreSQL을 read-only로 읽고 플랫폼 소유 view/mart를 거쳐 API가 소비한다([아키텍처·데이터 계약](../../docs/01_architecture_and_data_contract.md#L3-L23)). 따라서 아래 후보의 코드를 그대로 Kernel에 복사하는 결론은 내리지 않았다.

## 조사 방법과 소유권 필터

- `gh api user`의 현재 결과는 `login=hjung3113`, `id=48512745`였다.
- `gh repo list hjung3113 --limit 200 --json name,isFork,isArchived,description,url`과 후보별 `gh api repos/hjung3113/<repo>`를 사용했다. 아래 후보 원격은 모두 `owner=hjung3113`, `fork=false`, `archived=false`였다.
- 로컬은 `/Users/hyojung/orca/projects`, `/Users/hyojung/Desktop/2026`, `/Users/hyojung/Documents` 및 `/Users/hyojung/orca` 아래의 Git 저장소를 훑었다. 같은 `origin`과 Git common-dir/HEAD가 반복되는 clone·worktree는 하나의 canonical remote로 합쳐 기록하고, 로컬 경로는 실제 파일을 읽은 증거 경로로만 남겼다.
- 후보는 소유·비포크 원격, 해당 origin, 그리고 `hjung3113 <...>` 또는 `kimhyojung <hjung3113@gmail.com>`인 실제 커밋 작성자와 구현 파일을 함께 확인했다. 계정에 보인다는 이유만으로 작성자라고 간주하지 않았다.
- 계정의 fork(`opencode_test`, `andrej-karpathy-skills-fork`, `Awesome-CS-Books`)와 외부 remote인 로컬 clone(`/Users/hyojung/Desktop/2026/llmwiki`, origin `lucasastorian/llmwiki`)은 후보에서 제외했다.
- 소유 계정의 모든 저장소를 장시간 내부 분석하거나 clone하지는 않았다. remote-only 저장소는 GitHub API의 metadata/tree/최근 커밋과 README를 좁게 확인했으며, 제품 관련 가능성이 없는 agent/bootstrap/문서·프레젠테이션 저장소는 아래 제외 목록으로 묶었다.

플랫폼 현재 상태도 확인했다. 루트 작업 트리는 clean이고 `products/feedbackops`는 `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e`에 고정돼 있다. 저장소 연결 문서는 아직 workspace/server/DB/deployment 통합이 확정되지 않았고, FeedbackOps의 인증·권한·감사·VOC·Finding·Task 구현을 유지하며 공통 패키지 승격은 하지 않았다고 명시한다([repository layout](../../docs/integration/repository-layout.md#L3-L34)).

## 기준선: `context_recognized_parser` — 흡수하지 않고 계약으로 소비

**소유권·실제 상태.** 원격은 `https://github.com/hjung3113/context_recognized_parser`이고, 로컬 `/Users/hyojung/orca/projects/context_recognized_parser`의 기준 커밋은 `d84fab18fa10ead7f59b8169de25848f34a5164b`이다. 마지막 커밋 작성자는 `hjung3113 <48512745+hjung3113@users.noreply.github.com>`이며, C# Domain/Processing/Persistence/Snapshot 프로젝트와 PostgreSQL/Dapper/DbUp/Npgsql 및 xUnit/Testcontainers 테스트 구조가 실제로 있다.

**계약 증거.** parser의 authoritative persistence 문서는 PostgreSQL, insert-only Result, source file 단위 transaction과 Snapshot/Segment를 정의한다([persistence contract@d84fab1](https://github.com/hjung3113/context_recognized_parser/blob/d84fab18fa10ead7f59b8169de25848f34a5164b/docs/11_persistence_and_carryover.md#L1-L17)). Business occurrence는 장비 stream 안에서 immutable `RecordSequence`를 anchor로 삼고 `(equipment_id, occurrence_anchor)`로 다시 가리킨다([occurrence anchor@d84fab1](https://github.com/hjung3113/context_recognized_parser/blob/d84fab18fa10ead7f59b8169de25848f34a5164b/docs/11_persistence_and_carryover.md#L360-L395)). 외부 소비 문서는 parser를 수정하지 않고 parser DB를 read-only로 읽어 별도 `mart_` schema에 materialize한다고 명시하며, `equipment_master`와 `occurrence_directory`도 소비 계층 책임으로 둔다([secondary processing@d84fab1](https://github.com/hjung3113/context_recognized_parser/blob/d84fab18fa10ead7f59b8169de25848f34a5164b/docs/23_secondary_processing_ideas.md#L1-L11), [occurrence directory@d84fab1](https://github.com/hjung3113/context_recognized_parser/blob/d84fab18fa10ead7f59b8169de25848f34a5164b/docs/23_secondary_processing_ideas.md#L76-L103)).

**판정.** 플랫폼 문서가 이미 같은 경계를 정하므로 parser 코드를 submodule로 다시 끌어오거나 분석 플랫폼 안에서 parser 로직을 복제하면 책임이 중복된다. 통합 방식은 **독립 upstream 유지 + 플랫폼 소유 thin compatibility view/materialized mart + source commit/schema/contract version을 포함한 fixture 계약**이다. View는 컬럼 rename만 흡수할 수 있고 의미·grain·관계 변경은 흡수하지 못하므로, 실제 dump 기반 snapshot contract test가 다음 결정이다([데이터 계약 리스크](../../docs/01_architecture_and_data_contract.md#L25-L51)).

실행 검증은 하지 않았다. 따라서 이 보고서는 parser의 현행 DB/런타임 동작을 재검증했다고 주장하지 않고, 저장소 문서·소스·커밋에 나타난 계약만 사용한다.

## 순위 후보

### 1. `ProjectGraph` — evidence/lineage artifact 선택 재사용

**근거와 성숙도.** 원격은 `https://github.com/hjung3113/projectgraph`; 로컬은 `/Users/hyojung/Desktop/2026/ProjectGraph`, `HEAD=bd3bda9aeeede6cd6856facb3aa70b64f88eb45a`, 작성자 `kimhyojung <hjung3113@gmail.com>`이다. README는 C# + MSSQL ETL/parser 입력을 raw record → parser → reference DB → process DB output 경로로 분석해 `evidence_id`가 붙은 canonical ETL graph JSON을 만든다고 설명한다([README@bd3bda9](https://github.com/hjung3113/projectgraph/blob/bd3bda9/README.md#L1-L7)). 실제 모델은 `EvidenceEntry`에 kind/source path/line range/content hash/sample set/analysis context를 담고([EvidenceEntry@bd3bda9](https://github.com/hjung3113/projectgraph/blob/bd3bda9/src/projectgraph/models/evidence.py#L7-L30)), Level 1 lineage에 raw field/output column/transformation chain/confidence/contract version/evidence IDs를 담는다([lineage model@bd3bda9](https://github.com/hjung3113/projectgraph/blob/bd3bda9/src/projectgraph/models/lineage.py#L18-L39)).

canonical export는 validation 통과 때만 graph/version/evidence/confirmed subgraph/lineage를 쓰고, 실패 시 validation 결과만 쓴다([writer@bd3bda9](https://github.com/hjung3113/projectgraph/blob/bd3bda9/src/projectgraph/export/writer.py#L77-L119)). 질문 bundle은 `OUTPUT_COLUMN_LINEAGE`와 `RAW_FIELD_IMPACT`를 지원하고, 확인된 path가 없으면 결론을 Confirmed로 올리지 않으며 모든 원인에 bundle 내부 evidence ID를 요구한다([bundle builder@bd3bda9](https://github.com/hjung3113/projectgraph/blob/bd3bda9/src/projectgraph/export/bundle_builder.py#L124-L250)). 운영 DB 직접 연결 금지, masked raw sample, `confirmed`의 사람 승인, validation 실패 시 export 차단도 README에 명시돼 있다([보안 경계@bd3bda9](https://github.com/hjung3113/projectgraph/blob/bd3bda9/README.md#L79-L87)).

README에는 `419 collected/full suite green`과 quickstart의 `404 tests green`이 동시에 적혀 있다([진행 상태@bd3bda9](https://github.com/hjung3113/projectgraph/blob/bd3bda9/README.md#L11-L32), [quickstart@bd3bda9](https://github.com/hjung3113/projectgraph/blob/bd3bda9/README.md#L36-L53)). 로컬에는 테스트 파일 64개가 보이지만 이 조사에서 테스트를 실행하지 않았으므로 수치나 초록 상태를 채택된 검증 결과로 취급하지 않는다. README의 M1/M2 완료 주장도 같은 이유로 저장소 주장으로만 기록한다.

**플랫폼 적합성.** Data Trust가 요구하는 원천 근거·관찰시각·품질 상태와, raw/field/column 단위 context link 및 진단 drawer를 설계할 때 가장 직접적으로 쓸 수 있는 후보이다. `graph_version`, `contract_version`, `analysis_context_id`, evidence kind/content hash, confirmed/suspected/unresolved/conflicted 구분은 플랫폼이 향후 evidence contract를 정할 때 참고 가치가 높다.

**불일치·위험.** 이것은 C# + MSSQL 소스와 metadata snapshot을 읽는 정적 분석기이지, parser PostgreSQL mart를 읽는 플랫폼 API나 Menu Registry 구현이 아니다. `serve`도 localhost read-only static server이며, URL `scopeId`, OIDC, server-side Scope 재검증, platform Context/route contract를 제공하지 않는다. `confirmed`는 ProjectGraph 분석의 사람이 확인한 결론이지 플랫폼의 권한·Data Trust 판정 자체가 아니다. 실제 사내 분석은 masked snapshot·metadata·raw sample을 별도로 준비해야 하고, live MSSQL/production VOC 연결은 README가 보장하지 않는다.

**통합 방식과 다음 결정.** **선택적 재사용/참조**가 적합하다. 우선 ProjectGraph의 JSON shape와 evidence/lineage 규칙을 그대로 플랫폼 public contract로 복사하지 말고, 플랫폼이 소유할 `analysisContextId`, source revision, Scope/ACL, retention/redaction, Data Trust outcome, correlation ID를 포함한 versioned read-only artifact contract를 설계한다. 그 뒤 별도 CLI/job 또는 service adapter가 산출물을 만들고, 플랫폼 메뉴는 Menu Registry의 `supportedContext`와 Context Link로 연결한다. Kernel에 ProjectGraph의 C# parser scanner·AI wrapper·static server를 넣거나 submodule로 묶는 것은 보류한다. 채택 여부를 가르는 첫 질문은 “플랫폼에서 field/column 원인 추적과 근거 drill-through를 1급 메뉴/상세 surface로 할 것인가”이다.

### 2. `FileGateway` — raw log/config evidence용 별도 서비스 연동

**근거와 성숙도.** 원격은 `https://github.com/hjung3113/FileGateway`; 로컬은 `/Users/hyojung/orca/projects/FileGateway`, `HEAD=30d89a5210e5b3bd8c9c6a6c1fff8469867d7be8`, 작성자 `hjung3113 <48512745+hjung3113@users.noreply.github.com>`이다. README는 설비 로그와 Configuration File을 `equipmentId`와 논리 조건으로 읽는 read-only gateway이며, MSSQL 기준정보와 FTP/FTPS/local filesystem을 내부 구현으로 둔다고 설명한다([README@30d89a5](https://github.com/hjung3113/FileGateway/blob/30d89a5/README.md#L1-L11), [architecture@30d89a5](https://github.com/hjung3113/FileGateway/blob/30d89a5/README.md#L25-L51)).

실제 endpoint는 `GET /api/v1/logs`와 `/logs/download`를 같은 resolver로 연결하고, `equipmentId`, `logType`, `[from,to)`, pagination cursor, dynamic `attr.*`를 받는다([log endpoints@30d89a5](https://github.com/hjung3113/FileGateway/blob/30d89a5/src/FileGateway.Api/Endpoints/LogEndpoints.cs#L12-L66)). Configuration current/history도 설비·유형·기간과 cursor를 제공한다([configuration endpoints@30d89a5](https://github.com/hjung3113/FileGateway/blob/30d89a5/src/FileGateway.Api/Endpoints/ConfigurationEndpoints.cs#L12-L75)). Audit middleware는 caller/equipment/log/config/file metadata/status/error/elapsed를 기록하면서 API key 원문·token payload·물리 경로는 기록하지 않는다([audit middleware@30d89a5](https://github.com/hjung3113/FileGateway/blob/30d89a5/src/FileGateway.Api/Audit/AuditMiddleware.cs#L1-L54)).

**플랫폼 적합성.** 분석 차트나 VOC/Finding에서 원문 로그를 확인하거나 파일을 다운로드해야 한다면, `equipmentId`와 기간 Context를 gateway query로 변환하는 drill-through가 유용하다. read-only, pagination, opaque cursor, status/error code, audit, health, physical path 비노출, partial FTP failure 차단은 Data Trust와 evidence surface에 참고할 실제 seam이다([testing/deployment contract@30d89a5](https://github.com/hjung3113/FileGateway/blob/30d89a5/docs/10-testing-and-deployment.md#L66-L139)).

**불일치·위험.** 기준정보 원천은 플랫폼 설계의 parser PostgreSQL/view/mart가 아니라 MSSQL stored procedure이고 파일 원천은 FTP/FTPS이다. 인증은 현재 `X-Api-Key` middleware이고([API key middleware@30d89a5](https://github.com/hjung3113/FileGateway/blob/30d89a5/src/FileGateway.Api/Auth/ApiKeyMiddleware.cs#L1-L42)), 시각 파서는 offset 없는 값을 고정 `Asia/Seoul`로 해석한다([SiteTime@30d89a5](https://github.com/hjung3113/FileGateway/blob/30d89a5/src/FileGateway.Core/Time/SiteTime.cs#L5-L32)). 이는 현재 플랫폼의 OIDC/Scope 재검증, 설비 wall-clock과 URL의 naive `[from,to)`, source time-domain assertion과 맞춰야 한다. 배포 전 Windows Server/IIS + 실제 MSSQL/FTP 검증이 필요하다는 문서도 있다([배포 구조·완료 기준@30d89a5](https://github.com/hjung3113/FileGateway/blob/30d89a5/docs/10-testing-and-deployment.md#L154-L214)). README의 “MVP 구현 완료”와 테스트 통과 주장은 이 조사에서 실행 검증하지 않았다.

**통합 방식과 다음 결정.** **선택적 서비스 연동**이 적합하다. raw log/config drill-through가 실제 제품 요구인지 먼저 확정하고, 필요하면 gateway를 별도 배포한 채 플랫폼 adapter/OpenAPI contract를 만든다. adapter는 URL의 `equipmentIds`/`from`/`to`/`scopeId`를 gateway 요청으로 바꾸고, 플랫폼 authorization gateway 또는 OIDC-to-caller mapping으로 Scope를 재검증하며, gateway의 `ProblemDetails`/health 상태를 플랫폼 Data Trust outcome으로 변환해야 한다. FileGateway의 MSSQL/FTP resolver와 .NET/IIS 구현을 Kernel이나 플랫폼 DB로 복사하지 않는다. raw 파일이 제품 범위가 아니거나 parser의 DB/view만으로 충분하다면 이 후보는 defer한다.

### 3. `standard-log-lifecycle` + `log-contract-lens` — 검증 도메인 설계 참고

**근거와 성숙도.** `standard-log-lifecycle`은 원격 `https://github.com/hjung3113/standard-log-lifecycle`, 로컬 `/Users/hyojung/orca/projects/standard-log-lifecycle`, `HEAD=2d2dce2`, 작성자 `kimhyojung <hjung3113@gmail.com>`이다. Equipment Model → Alpha/Beta → Validation Round → Rule/Parser/Data result → Defect/Re-test → Gate를 정의하고([README@2d2dce2](https://github.com/hjung3113/standard-log-lifecycle/blob/2d2dce2/README.md#L1-L82)), 현재 상태를 `Concept / UX design`, 구현 기술·DB 미확정이라고 명시한다([현재 상태@2d2dce2](https://github.com/hjung3113/standard-log-lifecycle/blob/2d2dce2/README.md#L125-L136)).

`log-contract-lens`는 원격 `https://github.com/hjung3113/log-contract-lens`, 로컬 `/Users/hyojung/orca/projects/log-contract-lens`, `HEAD=4911388`, 작성자 `kimhyojung <hjung3113@gmail.com>`이다. 원본 줄 → 추출 필드 → parser input contract → 진단 근거를 추적하는 도구를 제안하지만, README가 요구사항·간략 설계뿐이며 실행 앱·설치파일·실제 로그 검증은 없다고 명시한다([README@4911388](https://github.com/hjung3113/log-contract-lens/blob/4911388/README.md#L1-L21)).

**플랫폼 적합성.** 이 둘은 새 설비/로그 검증을 workflow/validation page로 올릴 때 Validation Round, evidence 연결, defect history, 이전 round 비교, Gate/완료 근거를 설계하는 데 유용하다. `standard-log-lifecycle`의 핵심 Navigation 초안(Models/Validate/Defects/Specs/Reports)도 향후 Menu Registry의 domain candidate를 만드는 입력이 될 수 있다. 현재 플랫폼 문서도 이를 외부 설계 reference로 고정하고 기존 계약을 대체하지 않는다고 명시한다([문서 인덱스](../../docs/INDEX.md#L42-L44)).

**통합 방식과 다음 결정.** **설계 reference / defer**다. 구현 없는 문서를 submodule이나 공통 UI 패키지로 합치지 않는다. 실제 메뉴가 승인되면 Requirements → IA → Context/Scope/URL/Data Trust contract를 먼저 플랫폼 쪽에 작성하고, 반복이 확인된 공통 validation surface만 추출한다. parser 결과를 이 lifecycle 안에서 다시 생성하는 식으로 parser 책임을 넓히지 않는다.

### 4. `jira-voc-nexus` — evidence/recommendation 참고, FeedbackOps 기준선에 종속

**근거와 성숙도.** 원격은 `https://github.com/hjung3113/jira-voc-nexus`; 로컬 `/Users/hyojung/orca/projects/jira-voc-nexus`, `HEAD=db80abb`, clean, 작성자는 `hjung3113` 계열이다. README는 `nexus`와 `rag` 두 독립 local Python surface이며 connected Jira service가 아니라고 명시한다([README@db80abb](https://github.com/hjung3113/jira-voc-nexus/blob/db80abb/README.md#L1-L7)). Nexus fixture는 synthetic same-project filter, lexical retrieval, SQLite replay, dry-run proposal만 하고 Jira ingress/production ACL/write path가 없다([nexus boundary@db80abb](https://github.com/hjung3113/jira-voc-nexus/blob/db80abb/README.md#L16-L30)). RAG도 `AllowAllAcl` fixture에 한정되고 OpenSearch/PostgreSQL/BGE adapter seam은 adopted production deployment가 아니다([RAG boundary@db80abb](https://github.com/hjung3113/jira-voc-nexus/blob/db80abb/README.md#L32-L43)). README는 fixture check가 Jira access·company ACL·provider·DB adapter·adoption을 증명하지 않는다고 직접 경고한다([quickstart limitation@db80abb](https://github.com/hjung3113/jira-voc-nexus/blob/db80abb/README.md#L45-L81)).

**플랫폼 적합성.** evidence-limited answer, audience split, replay/conflict, “근거 없으면 provider를 시작하지 않음” 같은 아이디어는 Data Trust·human review·VOC context link를 설계할 때 참고할 수 있다. 그러나 FeedbackOps가 이미 VOC → Triage → Finding → Task → Outcome와 entity link, permission-limited content를 실제 제품 흐름으로 보유한다([FeedbackOps baseline@b5dd614](https://github.com/hjung3113/FeedbackOps/blob/b5dd614ac8da3792cb1627e7daeffb8fc9c4944e/README.md#L1-L40)).

**통합 방식과 다음 결정.** **reference/defer**다. Jira ingress·trusted principal/ACL·Nexus↔RAG wiring·automatic write가 실제 요구로 확정될 때에만 FeedbackOps의 권한·감사·VOC 계약과 충돌하지 않는 별도 recommendation adapter를 설계한다. Nexus의 fixture engine, AllowAllAcl, local SQLite, optional RAG adapter를 플랫폼 서비스로 승격하지 않는다.

## FeedbackOps와 VOC 후보 비교

FeedbackOps는 새 후보로 순위를 매기지 않고 현재 platform baseline으로 취급했다. 부모 저장소의 submodule은 `b5dd614`에 고정돼 있고, 원본 README는 authenticated single Workspace, VOC/Finding/Task/Outcome entity link, reporter status와 internal state 분리, permission-limited content path를 제품 불변식으로 둔다([FeedbackOps README@b5dd614](https://github.com/hjung3113/FeedbackOps/blob/b5dd614ac8da3792cb1627e7daeffb8fc9c4944e/README.md#L1-L40)). 실제 submodule에는 auth/permissions/scope, audit, VOC/Finding/Task, saved view, entity link, frontend admin permission gate가 있다. 다만 analytics-platform 계약의 Menu Registry/Global Context/URL deep-link/공통 Data Trust를 이미 구현했다고 간주하지 않는다. repository layout도 현재는 기존 구현을 유지하고 플랫폼 공통 패키지로 승격하지 않았다고 명시한다([연결 문서](../../docs/integration/repository-layout.md#L17-L25)).

`vocpage`는 원격 `https://github.com/hjung3113/vocpage`, 로컬 `/Users/hyojung/Desktop/2026/vocpage`, `HEAD=df1dde7b`이며 VOC 목록·상세 drawer·댓글·history·attachment·공지/FAQ·role UI를 설명한다([README@df1dde7b](https://github.com/hjung3113/vocpage/blob/df1dde7b/README.md#L1-L13), [use cases@df1dde7b](https://github.com/hjung3113/vocpage/blob/df1dde7b/README.md#L46-L133)). README가 안내하는 `prototype/`는 mock-data static surface지만, 이 커밋에는 별도의 backend/frontend 구현도 있다. 따라서 아래 추가 조사에서 실제 코드와 prototype UX를 나누어 평가한다. FeedbackOps와 직접 겹치므로 `vocpage` 자체를 합치지는 않고, 필요 시 FeedbackOps와 플랫폼 contract를 확정할 때 UX·검토 흐름 참고로만 사용한다.

## 추가 조사: VOC bot 여부와 원격 inventory coverage

### 원격 전체 확인과 소유권 경계

2026-09-22에 다시 실행한 `gh repo list hjung3113 --limit 200`의 결과는 **49개**다. 이 중 `fork=false`이고 `isArchived=false`인 소유 저장소는 **46개**, archived는 0개이며, `Awesome-CS-Books`, `andrej-karpathy-skills-fork`, `opencode_test` 세 개는 fork라 후보에서 제외했다. `analytics-platform`은 현재 조사 대상 자체이므로 소유 저장소 수에는 포함하되 통합 후보에서는 제외했다. `voc-bot`, `voc_bot`, `bot`이라는 별도 저장소는 없었다.

이름·description에 `voc|bot|jira|feedback|nexus`가 걸린 소유 비포크 저장소는 다음 네 개뿐이다. 네 저장소 모두 GitHub API에서 `owner=hjung3113`, `fork=false`, `archived=false`를 확인했고, 아래의 pinned commit과 로컬 `origin`/작성자도 대조했다. 계정에 있다는 사실만으로 작성자라고 판단하지 않았다.

| 저장소 | 조사 기준 커밋 | 실제 확인한 범위 | 소유·작성자 근거 | 결론 |
|---|---|---|---|---|
| `vocpage` | `df1dde7b309b48b360fa2c6699fa1c580a9d638b` | backend VOC/알림/외부 master, frontend API와 prototype UX | `hjung3113` 소유 non-fork remote, 커밋 author `kimhyojung` | 실제 VOC 기능은 있으나 FeedbackOps와 중복. UX/검토 계약 reference |
| `jira-voc-nexus` | `db80abb` | JSON intake, SQLite replay/conflict, lexical evidence, dry-run proposal | `hjung3113` 소유 remote, 로컬 origin 및 작성자 확인 | Jira connector가 아니다. evidence/replay reference 또는 별도 adapter 후보 |
| `FeedbackOps` | `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e` | 현재 submodule의 VOC/Finding/Task/Outcome, auth/scope/audit 경계 | 플랫폼 submodule pinned baseline | 새 후보가 아니라 현재 VOC 기준선 |
| `feedbackops-workflow` | `1d384986b5312c801ca89b1682f21a822df329e6` | canonical REVIEW/VERIFY, HEAD/content hash, stale/atomic artifact lifecycle | `hjung3113` 소유 non-fork remote, 커밋 author `kimhyojung` | VOC bot이 아니라 agent workflow governance reference |

### 46개 후보 universe의 검토 범위와 제외 이유

다음 19개는 README만 보지 않고 실제 구현·schema·설계 문서 중 관련 seam을 좁게 읽었다. 이 목록에는 기존 조사분과 이번 추가 조사를 합쳤다.

`Agent-forge`, `FeedbackOps`, `FileGateway`, `agent-migration-pipeline`, `agent-platform`, `ai_reporter`, `context_recognized_parser`, `feedbackops-workflow`, `general-ai-harness`, `general-low-reasoning-agent-harness`, `jira-voc-nexus`, `lifetimeworkflow`, `log-contract-lens`, `new-parser`, `projectgraph`, `standard-log-lifecycle`, `system-survey`, `thin-agent-harness`, `vocpage`.

나머지 26개는 GitHub metadata, 최근 commit, tree와 README를 확인한 뒤 다음 이유로 후보에서 제외했다. 이 저장소들은 이 조사에서 제품 기능을 전수 검증한 것으로 해석하지 않는다.

- **분석 플랫폼·VOC seam이 없는 일반/레거시/학습 저장소 12개:** `SWPro`, `VirtualMssql`, `csharp-legacy-improve`, `desktop-tutorial`, `exp10`, `mssql-query-optimizer`, `multicore`, `py-legacy-improve`, `servey_Remix`, `swtrack_master`, `test`, `xv6`.
- **문서·설치·agent 보조·저작 도구이고 제품 구현을 확인하지 못한 14개:** `ForgeRoom`, `conductor-playground`, `confluence-material-studio`, `env-setup`, `how-i-use-llm-agents`, `meta-prompting-skill`, `new-project`, `opencode-orchestrated-agent-workflow`, `orcaskills`, `parser-presentation`, `presentationformat`, `report-web`, `roocode-skeleton`, `wsl-sandbox-bootstrap`.

이 coverage는 “voc bot 저장소를 놓쳤는가”를 확인하기 위한 bounded inventory다. remote-only 저장소를 모두 clone하거나 실행하지 않았으며, 후보로 올린 저장소만 실제 path와 commit 근거를 추가로 읽었다.

### 기능별 비교: intake부터 알림까지

| 저장소 | bot/intake | Jira·외부 connector | dedup/replay | evidence retrieval | 사람 승인 | notification | FeedbackOps와의 추가 가치·판정 |
|---|---|---|---|---|---|---|---|
| `vocpage@df1dde7b` | `POST /api/vocs`와 frontend VOC API, 첨부·댓글·history가 실제 구현돼 있다([create route/repository](https://github.com/hjung3113/vocpage/blob/df1dde7b/backend/src/repository/voc.ts#L170-L212), [frontend API](https://github.com/hjung3113/vocpage/blob/df1dde7b/frontend/src/entities/voc/api/vocApi.ts#L42-L90)) | Jira client/webhook은 없다. `external-masters.ts`는 MSSQL **stub**와 JSON 파일을 cache/snapshot으로 읽는 경계다([external master boundary](https://github.com/hjung3113/vocpage/blob/df1dde7b/backend/src/services/admin/external-masters.ts#L1-L21)) | `issue_code` unique와 DB sequence는 식별자 중복 방지일 뿐 inbound event id/hash/idempotency/replay 처리는 아니다([VOC DDL](https://github.com/hjung3113/vocpage/blob/df1dde7b/backend/migrations/003_vocs.sql#L35-L65)) | `voc_history`, payload history/review, embedding/`embed_stale` 컬럼은 있으나 조사한 소스에서 evidence/RAG retrieval pipeline은 확인하지 못했다([history/review schema](https://github.com/hjung3113/vocpage/blob/df1dde7b/backend/migrations/003_vocs.sql#L78-L112)) | manager/admin의 `voc_payload_reviews`가 승인/거절을 기록하고 VOC 상태를 transaction으로 갱신한다([review transaction](https://github.com/hjung3113/vocpage/blob/df1dde7b/backend/src/repository/voc.ts#L214-L258)) | comment/status/assignment 인앱 알림과 5분 debounce가 실제 구현돼 있다([notification service](https://github.com/hjung3113/vocpage/blob/df1dde7b/backend/src/services/notifications.ts#L1-L126), [debounce repository](https://github.com/hjung3113/vocpage/blob/df1dde7b/backend/src/repository/notifications.ts#L31-L65)) | FeedbackOps의 VOC·권한·history·attachment와 크게 겹치며, in-app notification은 추가 seam이다. 추가 가치는 payload review, 외부 master snapshot, list/drawer UX다. **전체 병합 비추천, 차이 확인 후 선별 활용 후보** |
| `jira-voc-nexus@db80abb` | normalized event/corpus JSON을 local CLI가 받는다([CLI](https://github.com/hjung3113/jira-voc-nexus/blob/db80abb/nexus/cli.py#L14-L54)) | 실제 Jira ingress/API/write/webhook은 없다. `render_issue`도 현재 CLI가 publish하지 않는 template다([issue template](https://github.com/hjung3113/jira-voc-nexus/blob/db80abb/nexus/proposals.py#L202-L234)) | `event_id + payload_fingerprint`를 SQLite에 저장하고 같은 event는 replay, 다른 payload는 conflict로 거부한다([StateStore](https://github.com/hjung3113/jira-voc-nexus/blob/db80abb/nexus/storage.py#L44-L112)) | same-project synthetic filter 뒤 lexical top-5 evidence를 만들고, cited source와 text token을 검증한다([retrieval](https://github.com/hjung3113/jira-voc-nexus/blob/db80abb/nexus/retrieval.py#L48-L84), [grounding](https://github.com/hjung3113/jira-voc-nexus/blob/db80abb/nexus/proposals.py#L31-L71)) | `dry_run=true`, `published=false`, evidence 없으면 provider를 부르지 않지만 사람 승인 상태/승인자 기록은 없다([service](https://github.com/hjung3113/jira-voc-nexus/blob/db80abb/nexus/service.py#L30-L78)) | `recipients`는 `user-support`/`dev-team` label일 뿐 전송 구현이 없다([recipient rendering](https://github.com/hjung3113/jira-voc-nexus/blob/db80abb/nexus/proposals.py#L148-L170)) | FeedbackOps에 없는 replay/grounding 아이디어가 추가된다. 그러나 trusted Jira principal/ACL과 실제 ingress가 없으므로 **adapter 설계 시 reference/defer** |
| `system-survey@79b93be8` | authenticated survey draft/submit, comments, answer attachment가 실제 Express/Prisma 경계에 있다([response routes](https://github.com/hjung3113/system-survey/blob/79b93be8/backend/src/responses/router.ts#L20-L123)) | SSO header integration point만 있고 Jira/webhook/외부 source connector는 없다([SSO point](https://github.com/hjung3113/system-survey/blob/79b93be8/backend/src/auth/router.ts#L20-L35)) | draft는 `(survey,user)`로 upsert하지만 submitted response는 매번 새 row이며 event hash/idempotency/replay는 없다([repository](https://github.com/hjung3113/system-survey/blob/79b93be8/backend/src/responses/repository.ts#L42-L110), [schema](https://github.com/hjung3113/system-survey/blob/79b93be8/backend/prisma/schema.prisma#L83-L125)) | attachment/comment을 저장·조회하지만 evidence retrieval/ranking은 없다 | admin role/status `reviewing`은 있지만 별도의 approve/reject decision/audit record는 없다([admin routes](https://github.com/hjung3113/system-survey/blob/79b93be8/backend/src/admin/router.ts#L15-L87)) | notification/Slack/email/webhook 구현을 확인하지 못했다 | draft/attachment/comment UX는 참고할 수 있으나 FeedbackOps VOC intake와 겹친다. **전체 병합 비추천, intake UX reference** |
| `feedbackops-workflow@1d384986` | issue-scoped workflow artifact intake이지 VOC bot intake가 아니다 | Jira/Slack/email/webhook product connector는 없다 | dispatch ordinal marker, run/round/head/content hash, atomic publication과 stale rejection이 실제 script/schema에 있다([artifact lifecycle](https://github.com/hjung3113/feedbackops-workflow/blob/1d384986/toolkit/docs/agents/artifact-lifecycle.md#L1-L37), [candidate close](https://github.com/hjung3113/feedbackops-workflow/blob/1d384986/toolkit/scripts/lib/candidate-close.cjs#L28-L37)) | REVIEW/VERIFY/ROUND-STATE와 immutable snapshot이 evidence artifact이지 제품 VOC 검색이 아니다 | independent reviewer/Release Captain gate는 있으나 end-user VOC 승인 흐름은 아니다 | product notification은 없다 | 플랫폼 Data Trust/Audit에 freshness/authority 규칙을 참고할 추가 가치. **제품 submodule/service 통합은 하지 않음** |

### `vocpage`의 실제 구현을 다시 판정

이번 추가 확인으로 이전의 “static prototype”만을 근거로 한 평가는 정정한다. `vocpage@df1dde7b`에는 backend migration과 Express/TypeScript 서비스가 실제로 있으며, prototype은 그중 별도 mock UX surface다. VOC DDL은 `source`를 `manual|import`으로 제한하고 `issue_code`를 unique로 만들며, `voc_payload_reviews`와 `voc_payload_history`를 둔다([DDL](https://github.com/hjung3113/vocpage/blob/df1dde7b/backend/migrations/003_vocs.sql#L35-L112)). 서비스는 status/assignee 변경 뒤 5분 debounce 알림을 호출하고([VOC update](https://github.com/hjung3113/vocpage/blob/df1dde7b/backend/src/services/voc.ts#L105-L127)), 알림 repository는 `(user_id,type,voc_id)` 최근 row를 확인한다([notification debounce](https://github.com/hjung3113/vocpage/blob/df1dde7b/backend/src/repository/notifications.ts#L31-L65)). 이 구현은 “VOC bot이 없다”는 뜻이 아니라, **별도 `voc-bot` 저장소는 없고 기존 VOC 제품 안에 수동 intake·review·in-app notification이 있다**는 뜻이다.

그 추가 기능도 FeedbackOps baseline과 경계가 겹친다. `vocpage`를 submodule로 붙이거나 화면·DB 모델을 복사하면 두 VOC 상태·권한·history 계약과 병렬 notification 규칙이 생긴다. 필요한 것은 다음 세 가지를 플랫폼 소유 계약으로 다시 정하는 일이다.

1. 외부 VOC/Jira를 받을지 결정하고, 받는다면 `source_event_id`, payload fingerprint, trusted principal, Scope/ACL, replay/conflict 결과를 포함한 별도 ingress adapter를 둔다.
2. `vocpage`의 payload review와 FeedbackOps의 Finding/Task/Outcome 중 어느 것이 승인·감사 권위인지 결정한다. 두 상태 머신을 병렬로 합치지 않는다.
3. drawer/filter/notification UX가 실제 두세 메뉴에서 반복될 때만 platform component로 추출한다. 지금은 `vocpage` UX reference로 보류한다.

## agent 저장소에서 실제로 쓸 수 있는 설계 reference (3개만)

agent 계열에서 제품 코드 통합 후보로 올릴 것은 없다. 다만 다음 세 저장소는 실제 파일이 있어 플랫폼 Data Trust/Audit와 승인 경계를 설계할 때 한정된 reference 가치가 있다. `general-low-reasoning-agent-harness`, `Agent-forge`, `agent-platform`, `thin-agent-harness`, `how-i-use-llm-agents` 등은 읽었지만 이 세 가지와 겹치거나 현재 플랫폼에 더 직접적인 seam이 없어 별도 추천하지 않는다.

### 1. `feedbackops-workflow` — 현재 HEAD에 결속된 검증 증거

`toolkit/README.md`는 worker prose·process exit·`RUN.json`을 완료 권위로 보지 않고 현재 HEAD에 맞는 canonical `REVIEW`와 `VERIFY`만 merge authority로 둔다([README@1d384986](https://github.com/hjung3113/feedbackops-workflow/blob/1d384986/toolkit/README.md#L1-L7)). artifact lifecycle은 `head_sha`, `content_sha256`, lifecycle, immutable review snapshot을 보존하고 stale artifact를 거부하도록 규정한다([lifecycle@1d384986](https://github.com/hjung3113/feedbackops-workflow/blob/1d384986/toolkit/docs/agents/artifact-lifecycle.md#L9-L31), [candidate close@1d384986](https://github.com/hjung3113/feedbackops-workflow/blob/1d384986/toolkit/scripts/lib/candidate-close.cjs#L76-L119)). 플랫폼에서는 이를 `analysisContextId + sourceRevision + evidenceContentHash + verifierIdentity + observedAt` 형태의 Data Trust/Audit 필드로 번역할 수 있다. toolkit script/schema를 제품 runtime이나 submodule로 가져오는 결정은 하지 않는다.

### 2. `general-ai-harness` — host receipt와 artifact digest 경계

원격 기준은 `bdadc5e970d80d7f2c72ed7a184d80771aa71790`이며 README의 현재 thin MVP는 RunSpec/AcceptanceContract 검증, 새 sandbox, 한 번의 local Codex 실행, host-owned receipt, artifact SHA-256 gate만 구현한다고 설명한다([README@bdadc5e](https://github.com/hjung3113/general-ai-harness/blob/bdadc5e/README.md#L7-L26)). 실제 Admission은 side-effect-free binding과 `contractDigest`를 만들고([admission@bdadc5e](https://github.com/hjung3113/general-ai-harness/blob/bdadc5e/src/admission.mjs#L24-L79)), run path는 기존 sandbox/receipt를 재사용하지 않고 host가 산출물 hash와 exit code를 receipt에 기록한다([run-once@bdadc5e](https://github.com/hjung3113/general-ai-harness/blob/bdadc5e/src/run-once.mjs#L85-L132)). 이는 플랫폼 job/analysis artifact의 “계약을 먼저 고정하고 결과를 host가 판정”하는 reference가 된다. 현재 slice에는 VOC intake, Jira/external connector, evidence retrieval, human approval, retry, notification이 없으므로 제품 코드 병합이나 공통 harness dependency는 보류한다([MVP boundary@bdadc5e](https://github.com/hjung3113/general-ai-harness/blob/bdadc5e/docs/design/THIN_MVP_GRILL.md#L126-L166)).

### 3. `lifetimeworkflow` — machine proposal과 human ratification 분리

원격 기준은 `6e0e12650a95d1bbb9c992701de16794b1e28efc`다. parser reference instance의 `golden_runner`는 machine이 `baseline.received.tsv`를 만들 수는 있지만 `--approve`, ADR reference, 인간 confirmation token 세 가지가 없으면 `baseline.verified.tsv` 승격을 거부한다([approve.py@6e0e126](https://github.com/hjung3113/lifetimeworkflow/blob/6e0e126/examples/log-parser/golden_runner/approve.py#L1-L71)). 비교 runner도 `.verified`를 덮어쓰지 않고 mismatch 때 `.received`만 제안한다([runner.py@6e0e126](https://github.com/hjung3113/lifetimeworkflow/blob/6e0e126/examples/log-parser/golden_runner/runner.py#L115-L140)). parser의 승인 baseline과 platform Audit/Data Trust의 human decision을 분리하는 데 쓸 수 있지만, 이는 parser/reference instance용이며 Platform Kernel이나 VOC 상태 머신에 넣지 않는다.

## 제외·보류한 소유 저장소

| 저장소 | 확인한 사실 | 판정 |
|---|---|---|
| `NewParser` | `/Users/hyojung/Desktop/2026/NewParser`, origin `hjung3113/new-parser`, `HEAD=654bf89`, 설비 로그 Bronze/Silver/Gold와 .NET Core/Plugins/DbWriter/Scheduler/UI 설계가 상세하지만 현재 상태가 “설계 완료 — 구현 진입 가능”이며 다음 단계가 scaffold/DDL/interface 구현이다([README@654bf89](https://github.com/hjung3113/new-parser/blob/654bf89/README.md#L471-L493)). | `context_recognized_parser`와 경쟁하는 parser 설계. 현재 platform 계약과도 중복되므로 exclude/defer. |
| `agent-platform` | `/Users/hyojung/orca/agent-platform`, `HEAD=6c17c55`, task-graph orchestration, evidence/finding/receipt lineage, permission/approval gates를 목표로 하는 agent Kernel이다([scope](https://github.com/hjung3113/agent-platform/blob/6c17c55/docs/product/scope.md#L1-L21), [architecture](https://github.com/hjung3113/agent-platform/blob/6c17c55/docs/architecture/overview.md#L5-L40)). | analytics 데이터·메뉴·mart가 아니라 agent execution authority. 제품 코드 병합은 exclude; authority/evidence 어휘만 참고. |
| `thin-agent-harness` | `/Users/hyojung/Documents/Codex/thin-agent-harness`, `HEAD=d05e54b`, immutable workflow/attempt/finding/evidence/receipt와 canonical JSON/digest를 소유하는 범용 orchestrator다([README@d05e54b](https://github.com/hjung3113/thin-agent-harness/blob/d05e54b/README.md#L1-L29), [architecture@d05e54b](https://github.com/hjung3113/thin-agent-harness/blob/d05e54b/docs/architecture.md#L18-L38)). | analytics platform runtime이 아님. common agent tooling로 별도 유지; 제품 submodule/service 통합은 defer. |
| `agent-migration-pipeline` | `/Users/hyojung/orca/agent-migration-pipeline`, `HEAD=bef5b43`, C#/WPF/MSSQL를 React/FastAPI/PostgreSQL로 전환하는 discovery → contract → design → implement → review → verify scaffold이며 Phase 0, legacy source 미분석이다([README@bef5b43](https://github.com/hjung3113/agent-migration-pipeline/blob/bef5b43/README.md#L1-L24), [status@bef5b43](https://github.com/hjung3113/agent-migration-pipeline/blob/bef5b43/README.md#L98-L126)). | 이 플랫폼을 위한 제품 기능이 아니며 아직 대상 분석도 없다. process reference로만 defer. |
| `Agent-forge`, `general-ai-harness`, `general-low-reasoning-agent-harness`, `opencode-orchestrated-agent-workflow`, `orcaskills`, `env-setup`, `wsl-sandbox-bootstrap`, `presentationformat`, `confluence-material-studio`, `parser-presentation` 등 | agent runtime, bootstrap, skill, document/presentation authoring 범위다. `general-ai-harness`는 위에서 receipt 경계 reference로, `Agent-forge`와 `general-low-reasoning-agent-harness`는 승인·orchestration reference로 좁게 읽었지만 분석 platform의 Menu/Context/Scope/mart 제품 구현은 아니다. | 제품 통합 후보에서는 제외하고, 위의 세 agent reference 외에는 별도 추천하지 않는다. 저장소 수가 많으므로 각 파일의 전수 검토 결과로 해석하지 않는다. |

## 추천 의사결정 순서

1. **Evidence drill-through를 제품 1급 요구로 확정할지 결정한다.** 채택하면 `ProjectGraph`의 evidence/lineage artifact를 참고해 플랫폼 소유 versioned contract를 먼저 만든다. 이 contract에 source revision, `analysisContextId`, Scope/ACL, redaction/retention, Data Trust outcome, correlation ID를 넣고, 실제 Menu Registry/URL/Context Link를 그 뒤에 설계한다.
2. **원문 파일 접근을 확정한다.** 필요하면 `FileGateway`를 별도 서비스로 두고 adapter/OpenAPI, OIDC·Scope mapping, naive wall-clock `[from,to)` 변환, 오류·health/Data Trust 매핑을 검증한다. raw 파일이 필요 없으면 후보를 defer한다.
3. **parser 소비 계약을 먼저 고정한다.** `context_recognized_parser`의 `(equipment_id, anchor)`와 최신 field/anchor 의미를 기준으로 플랫폼 소유 compatibility view/mart 및 dump fixture를 만든다. parser의 로직·DB migration·정적 분석기를 플랫폼 Kernel에 넣지 않는다.
4. **검증 lifecycle 메뉴가 승인될 때만 설계를 확장한다.** `standard-log-lifecycle`/`log-contract-lens`에서 Validation Round/Defect/Evidence UX를 참고하되, 플랫폼의 Requirements → IA → Context/Scope/URL/Data Trust 순서로 다시 계약한다. FeedbackOps VOC와 겹치는 기능은 새 저장소에서 재구현하지 않는다.

## 검증 한계

- 모든 후보 저장소에서 `dotnet`, Python, Node, DB, FTP/MSSQL, Jira, provider 또는 live UI 실행을 하지 않았다. README의 “tests green”, “MVP complete”, “pilot ready”는 모두 저장소 주장으로만 취급했다.
- dirty clone은 수정하거나 정리하지 않았다. 특히 `FileGateway`의 `?? .review/`, `standard-log-lifecycle`의 다수 미추적/수정 파일, `ProjectGraph`의 `CLAUDE.md` 변경을 보존했다.
- remote tree/README와 필요한 소스·문서만 읽었으며, 비식별·합성 자료 외의 raw data/credential은 열지 않았다.
- 이 파일은 조사 결과를 담는 유일한 산출물이다. 코드·설정·submodule 참조·commit/push는 변경하지 않았다.
