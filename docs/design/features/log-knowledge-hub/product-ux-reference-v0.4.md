# Log Knowledge Hub — 제품·기술 통합 설계서

> [!CAUTION]
> **역사적 제품·UI 레퍼런스(v0.4)** — v0.4의 §15 카탈로그 UX·§16–17 화면/접근성 사양과 사용자 확정 도메인 불변식은 유지한다. 다만 이 파일의 '독립 웹 우선·후속 플랫폼 이식', 전용 Shell/로그인/서버/URL 관련 문장은 더 이상 유효하지 않다. 플랫폼 직접 탑재 및 기술 소유권은 [v0.6 설계](./design-v0.6-candidate.md)가 우선한다. 이 파일에 실원본 장비 데이터는 포함하지 않는다.


> **버전:** v0.4 (카탈로그 관리 Phase 0 상세 + 구현 가능한 UI/UX 화면 설계)  
> **작성일:** 2026-10-30  
> **프로젝트:** ChatGPT 프로젝트 `로그지식허브`  
> **개발 형태:** 독립 웹 애플리케이션 우선, Analytics Platform SDK 재사용, 추후 플랫폼 탑재  
> **상태:** 제품/도메인 결정 반영본. 구현 완료, 개별 DB·API 상세/인프라 확정, GitHub 이슈 등록 또는 실서비스 배포를 뜻하지 않음.
> **개정 근거:** v0.3에서 확정한 1–17번 결정을 유지하면서, 2026-10-30 요청에 따라 카탈로그 등록·관리 화면/플로우/Import·외부 ID 검토 및 구체적인 UI 규격/와이어프레임/검수 기준 추가. 원본 v0.2·v0.3 보존.  
> **문서 해석:** 제품 방향은 사용자 확정, 상세 API/필드 검증/픽셀·레이아웃/시각 샘플은 구현을 위한 후보 사양. 실제 SDK와 사내 기준정보 확인이 우선.

## 0. 1페이지 요약

**목적:** 반도체 설비의 로그·기술 현황을 설비사→공정→모델→설비 SW 기준으로 정리하고, 모듈·이벤트 명세·Top View·결함·확인사항·개선 제안과 **근거(Evidence)**를 연결하여 **전 모델을 가로지르는 검색 가능한 기술 지식 자산**을 만든다.

**우선순위:** 신규 로그 개발 Lifecycle 관리는 후속이다. 우선 **현황 파악·정리·검색·재사용**에 집중한다.

**확정된 핵심 설계 규칙 (결정 1–17)**

1. `Vendor → Process ↔ Model → SW`는 **탐색 뷰**다. 공정–모델은 M:N. Model/SW는 안정 ID를 가지며 카탈로그는 수동 입력·Excel/CSV Import·외부 시스템 연동을 병행한다. **관리자용 카탈로그 관리 화면(설비사·공정·모델·SW CRUD/비활성화/충돌 검토)은 Phase 0 필수**로 상세화했다(§15).
2. **SW 버전별 모듈·이벤트 명세를 독립 원본**으로 저장한다. 모델 공통정보는 SW 명세들로부터 자동 **후보 추출 → 사람 확정**한 파생 데이터이며, 원본 명세를 덮어쓰거나 역전파하지 않는다. Build 관리는 초기 제외/후속 확장 후보.
3. **기술 Item은 하나의 소유 범위(Model 또는 특정 SW)에만 귀속**한다. 다른 Model/SW의 유사 기술 문제는 새 Item으로 만들고 `similar/related/derived_from` 등 명시적 관계로 잇는다. 하나의 Item을 여러 Model/SW에 공유 소유시키지 않는다.
4. 같은 SW의 여러 모듈·이벤트는 Item에 N:M **참조**할 수 있다. **소유 범위(owner scope)**와 **참조(subject/evidence link)**는 서로 다른 개념이다. Model 공통 Item은 특정 SW의 검증 사실로 자동 전파하지 않는다.
5. Event/Module의 SW별 ID는 독립적이다. 의미상 `동일/유사/대체/명칭만 동일` 등 공통 개념 관계는 별도로 관리하고, AI 매핑은 **사람 확정 전 후보**다.
6. Item 본문은 관찰 사실, 기준/기대, 가설·해석, 판단 변경 이력, 개선 방향, Evidence를 분리한다. 판단 상태 변경은 **별도 불변 기록**으로 보존한다.
7. **Parser / Validator / Knowledge Hub는 다른 책임**이다. Parser는 원천 로그를 Raw Data로 변환, Validator는 스펙/원본/파서 결과를 독립 검증, 허브는 자동 결과뿐 아니라 엔지니어의 휴리스틱 판단·사례·해석을 축적한다. 검증 결과를 정식 Item과 동치로 취급하지 않는다.
8. 사람은 권한에 따라 `작성→검토` 또는 `직접 발행`한다. **AI는 초안 제출만** 가능하고 항상 인간 승인 필요. 발행 승인과 기술적 검증은 별개다.
9. 허브의 기본 조회는 **사내 공유**, 민감한 Model/SW/Item/Evidence에 선택적 제한. 검색·제안·AI에도 동일하게 적용한다.
10. Evidence는 **원본 외부 참조 + 선택적 허브 첨부**를 병행한다. 원본 허위 인용/권한 우회 복제 금지.
11. 그룹은 **표준 유형·카테고리 + 사용자 수동 그룹 + 저장된 검색 뷰**를 병행한다. 그룹 삭제가 원본 Item을 삭제하지 않는다.
12. 기존 Item으로부터 다른 SW의 **독립 신규 초안**을 만들 수 있지만, 근거/검증 상태를 그대로 승계하지 않고 출처 Item·리비전을 연결한다.
13. 기본 검색은 권한이 허용한 **전체 Model/SW의 독립 Item**. 정확 이벤트/별칭/오타/방향관계 검색과 유사 Item 링크를 제공하고 서로 다른 Item을 무음 병합하지 않는다.
14. Top View는 **허브 내 뷰어 통합 / Studio에서 편집**으로 역할을 분리하고, 특정 SW의 레이아웃을 선택해 모듈→명세·Item 탐색한다.
15. 기술 명세는 핵심 구조화 필드 + 상세 문서를 병행한다. 문서 자동 추출 결과는 사람 확인 전 확정 명세가 아니다.
16. 독립 웹을 먼저 개발하고 Analytics Platform UI SDK를 소비하며, 후속 플랫폼 탑재는 Host Adapter를 통해 수행한다.

**화면 설계 기준:** 플랫폼의 실제 SDK/토큰을 근거로 **디자인 상세 사양·와이어프레임·스크린샷 검수 기준**을 §16–17에 추가했다. 독립 웹은 플랫폼 전역 레일을 무조건 복제하지 않으며 플랫폼 탑재 시 단일 Host Shell을 사용한다.

**확정/후보의 구분:** 위는 제품·도메인 정책이다. 세부 API 경로, 테이블 명칭, 실제 사내 인증/보관소, 속도 목표 및 릴리스 단계 배정은 구현 전 검증이 필요한 **기술 설계 후보**다. 특히 사용자 결정으로 승인되지 않은 기술적 세부사항을 임의로 `확정` 표시하지 않는다.

---

## 1. 해결하려는 문제와 범위

### 1.1 주된 사용자 질문

- 특정 모델이 어떤 설비이며 어느 공정에 속하는가? 어떤 모듈·이벤트·로그 특성을 갖는가?
- 어떤 SW 버전에서 어떤 문제가 관찰되었고, 적용 범위가 어디까지인가?
- 원본 로그/스펙/분석 결과 중 **어떤 근거**로 결함이나 확인사항을 기록했는가?
- `StepProcess가 ProcessStart보다 먼저 나오는 문제` 같은 사례가 **다른 설비사·모델·SW에도 존재했는가?**
- 이전에 제안된 개선 방향이나 해석을 다시 활용할 수 있는가?
- AI가 제안한 항목 중 사람이 검토해야 할 것은 무엇인가?

### 1.2 초기 제품 범위 (Phase 0–1)

- 설비사/공정/모델/SW 탐색 및 전체 모델 인덱스
- **카탈로그 관리**: 네 객체의 권한별 수동 등록·조회·수정·비활성화, 모델–공정 M:N 연결, Excel/CSV Import 단계별 검증·충돌 해결·적용 결과, 외부 ID 매핑 구조(§15)
- SW별 독립 모듈·이벤트 명세와 검토된 모델 공통 파생 프로파일, Top View 뷰어 연동 경계(실제 탑재 시점은 단계적)
- Model 또는 SW 단일 소유의 기술 Item 등록·수정·조회·분류·키워드·다중 모듈/Event 참조·근거·판단 이력·유사 Item 링크
- 전체 모델 통합 검색, 자동완성/동의어/오타 후보, 이벤트 순서 관계 검색, 작성 중 유사 사례 제안
- 작성자/발행자 권한 차등, **AI 제안·Validator 유래 후보**와 정식 Item 분리, 검토/수정/승인/반려, 변경·판단 감사 이력
- 독립 웹 빌드 및 자체 API/DB, 플랫폼 UI SDK 재사용, 미래의 플랫폼 호스팅 경계

### 1.3 후속 범위 (Phase 2–3)

- 허브 내 Top View 뷰어와 모듈 상호작용 실제 연결(편집은 Studio), 원본 로그/Spec/Validator Run 딥링크
- SW 버전 간 차이 시각화, Build 세분화 필요성 검토, 항목별 판단·변경 이력 UX 고도화
- 기존 Standard Log Lifecycle(Alpha/Beta, Round, Gate, Defect, Retest) 연동
- 온프레미스 임베딩/하이브리드 의미 검색, 더 정교한 관계 추론
- Analytics Platform 메뉴 탑재·SSO/권한/감사 연계

### 1.4 현재 범위 밖

- 실시간 설비 제어, 실시간 원본 로그 전량 수집/저장, 생산설비별 운영 상태 모니터링 제품 대체
- Jira 수준 복잡한 워크플로우와 개발 프로젝트 스케줄러
- LLM의 무인 승인·무인 결함 확정·무인 원본 수정
- 시스템 전역의 범용 위키/검색 엔진을 초기부터 새로 만드는 일
- 외부 LLM에 민감 원본 로그·기술 자료를 전송하는 구현

---

## 2. 정보 구조(Information Architecture)

### 2.1 전체 탐색

```text
Log Knowledge Hub (독립 웹)
├─ 홈/전체 현황                 # 현황 요약, 최근/즐겨찾기, 진입 경로
├─ 모델 탐색                   # 설비사·공정·모델 검색/필터
│  └─ Vendor                   # 동적 데이터 노드
│     └─ Process               # 동적 데이터 분류
│        └─ Model              # 모델 공통 프로파일
│           ├─ 공통 개요(검토된 파생정보)/Model 공통 Item/Top View 참조
│           └─ Software Release
│              ├─ SW 개요       # 독립 SW 명세 기준 + 모델 공통 파생정보 비교
│              ├─ 모듈·이벤트 명세  # 해당 SW의 독립 원본
│              ├─ 기술·검증 현황  # 수동 기술 판단과 Validator 출처를 분리
│              └─ 기술 항목
│                 ├─ 전체 항목
│                 ├─ 이벤트·순서
│                 ├─ Parser·데이터
│                 ├─ 개선 제안
│                 └─ ITEM-... 상세 (독립 객체)
├─ 통합 검색                   # 기본: 권한 있는 전체 모델
├─ 전체 기술 항목              # 모델을 가로지르는 필터/보기
├─ 카탈로그 관리               # 권한자 전용: 설비사/공정/모델/SW 등록·수정·비활성화
│  ├─ 설비사 · 공정 · 모델 · SW
│  └─ 일괄 등록(Import) · 외부 연동/ID 매핑
└─ 제안 검토함                 # 일반 작성자·AI·Validator 후보; 권한별
```

**화면용 계층 ≠ 데이터 소유 구조.** `Vendor → Process → Model → SW`는 탐색 경로다. **Model↔Process는 M:N**이며 하나의 Model은 공정 트리 여러 위치에 표시돼도 안정 ID·SW·Item 데이터를 중복 복제하지 않는다. Model의 기술 Item과 SW의 기술 Item은 독립 소유이고, 공통 파생 정보는 SW 명세로부터 별도 계산/승인한다.

### 2.2 진입 UX

- **탐색형:** 홈 → 모델 인덱스(설비사/공정 필터) → 모델 공통 개요 → SW 선택 → 상세/항목
- **검색형:** 홈 또는 전역 검색 → 결과(여러 모델) → 항목 상세 → 관련 모델/SW로 이동
- **연관형:** Top View 모듈 선택 → 해당 모듈의 이벤트/기술 항목 필터 → 항목 상세
- 사용자는 매번 설비사→공정→모델을 네 번 클릭하지 않아도 된다. 계층 필터, 모델 검색, 최근 항목, 바로가기를 함께 제공한다.
- 사이드바는 현재 위치·최근·즐겨찾기를 보여 주는 **보조 탐색**으로 시작한다. 수천 개의 모든 노드를 펼치지 않는다.

### 2.3 경로(예시; 최종 라우트 미확정)

```text
/                       홈
/models                 모델 인덱스
/models/:modelId         모델 공통 프로파일
/models/:modelId/software/:softwareId  SW 프로파일
/items                  전체 기술 항목
/items/:itemId          안정 객체 ID 기반 상세
/search                 전체 검색
/review/drafts          제안 검토함(사람·AI·Validator)
/review/drafts/:draftId  초안 검토 상세
/admin/catalog/vendors         설비사 관리(권한 필요)
/admin/catalog/processes       공정 관리(설비사 독립 사전)
/admin/catalog/models          모델 관리(설비사·공정 연결)
/admin/catalog/software        SW 버전 관리(초기 Build 제외)
/admin/catalog/imports         CSV/XLSX 일괄 등록과 충돌 해결
/admin/catalog/sources         외부 기준정보 ID 매핑·연동 상태
```

- URL의 핵심은 **객체 안정 ID**. 모든 조상 분류명/필터를 URL에 실어 객체 정체성으로 삼지 않는다.
- 검색 조건·펼침 상태는 UI 작업 상태. 공유 링크가 필요할 때만 명시적 상태 스냅샷/필터를 포함한다.
- 직접 링크로 진입해도 대상 객체 조회 → 서버 허용한 조상 경로 확인 → Breadcrumb 복원.
- 이후 플랫폼 탑재 시에는 호스트의 메뉴 URL 계약으로 변환하며 도메인 객체 ID는 바꾸지 않는다.

---

## 3. 화면 요구사항

| 화면 | 핵심 요소 | 1차 동작 |
|---|---|---|
| 홈/전체 현황 | 모델 수·SW 수·미해결 항목·검토 대기(권한별), 최근 목록 | 모델/검색 진입 |
| 모델 인덱스 | 설비사·공정·모델·SW·특성 필터, 빠른 검색, 표 | 모델 선택/버전 바로가기 |
| **카탈로그 관리** | **설비사/공정/모델/SW 탭, 고밀도 표, 등록·수정 우측 패널, 비활성화·감사** | **권한별 수동 CRUD, 공정 M:N 편집, 신규 모델→SW 등록 연결** |
| **일괄 등록·외부 연동** | **CSV/XLSX 5단계(파일→열 매핑→검증→충돌 해결→적용), 외부 ID 차이 비교** | **중복·권한·부모 참조 검토, 명시적 적용, 행별 결과 확인** |
| 모델 공통 개요 | 기본 설명, 공정/설비사, 승인된 공통 파생 명세(출처 SW·검토 시점), 모델 Item, SW 목록 | 특정 SW 선택/공통정보 재검토 |
| SW 프로파일 | 독립 명세 버전, Top View 뷰어, 이벤트 요약, 기술 판단·검증 출처, 해당 SW Item | 모듈→명세/Item 드릴, Studio 편집 링크 |
| 모듈·이벤트 명세 | SW별 Module/Event ID, 주요 필드, 발생 조건, 관계, Spec/문서 | 관계 매핑/공통후보 확인, 관련 Item 탐색 |
| 기술 항목 목록 | 표준 분류, 수동 그룹, 저장된 뷰, Model/SW 소유 범위, 상태·키워드 | 독립 Item 열기/유사사례 연결 |
| 항목 상세 | 소유 Model/SW, 관찰·기대/실제·근거·판단 이력·분석·개선·연관 Item | 판단 이력 비교/원문 확인/독립 Item 파생 |
| 통합 검색 | 전체/현재 모델/현재 SW 범위, 검색어 해석·검색 이유 | 유사 항목 비교/이동 |
| 통합 검토함 | 사람 작성·AI 제안·Validator 후보 출처를 구분, 근거/주장 나란히, 변경 Diff | 발행 권한자 승인·수정·반려·보류 |

### 3.1 화면 디자인 원칙

- 플랫폼 `@ap/ui`와 `@ap/components`를 **배포된 SDK 버전으로 소비**. 색·간격·타이포·상태 의미를 독립 구현으로 복제하지 않는다.
- 데스크톱 중심, 한 화면에 근거/목록/상세를 동시에 볼 수 있는 밀도 유지.
- 표가 적합한 정보는 표로, 분포/추세만 차트로 표현. 정보 없는 KPI 카드를 남발하지 않는다.
- 상태 미확인·미평가·데이터 없음·실패는 서로 다른 상태. 예: 검증 데이터 미연결이면 `통과`나 `결함 없음`으로 표시하지 않는다.
- 자세한 로그는 3-pane/하단 상세 등으로 보여주고, 대용량 원문을 화면에 무작정 올리지 않는다.
- **구체 UI 기준은 §16–17을 따른다.** 실제 SDK semantic token을 사용하고, 등록·수정·선택이 주변 UI를 과격하게 어둡게 만들지 않아야 한다. **화면 스크린샷·예외 상태를 확인하기 전에는 시각 구현 완료로 보고하지 않는다.**

### 3.2 기술 항목 상세 필드

| 구역 | 필드 | 비고 |
|---|---|---|
| 헤더 | itemId, 제목, 유형, 카테고리, 태그, 작성자, 작성/갱신 | 안정 ID로 링크 |
| 소유/관련 대상 | 소유자 1개(Model **또는** SW); 소유 범위 내 모듈/Event는 N:M 참조 | 다른 Model/SW 사례는 별도 Item + 명시적 관계 |
| 관찰 사실 | 현상, 재현 조건, 관측 이벤트·시각·순서 | 관찰 vs 판단 구분 |
| 기대/기준 | 스펙·룰, 기대 이벤트·순서, 기준 버전 | 명세 출처 필수 |
| 근거 | Source ID, 로그 파일/행·발췌, Spec·이미지·검증 Run, 체크섬 | 접근 권한 별도 |
| 분석/의견 | 추정 원인, 기술적 해석, 논의 | 사실로 승격하지 않음 |
| 개선 방향 | 조치 제안, 재확인 포인트 | 실제 조치 완료는 별도 이력 |
| 연결 | 유사·파생·관련·중복 후보 Item(출처 Item Revision 포함), 참조 문서/모듈 | 다른 SW 복사 시 새 Item만 생성 |
| 상태·판단 이력 | 게시 상태/기술 검증 상태/처리 상태 분리; 판단 변경의 행위자·시각·근거·사유 | 이견·정정·이전 판단 보존 |

**유형/카테고리/태그/그룹은 서로 다른 축**이다. 예: 유형 `확인 필요`, 카테고리 `이벤트 순서`, 태그 `PM1, START_END`, 수동 그룹 `설비사 확인 대기`, 동적 저장 뷰 `미해결+순서문제`. 그룹 변경은 Item의 소유 범위/존재에 영향을 주지 않는다.

### 3.3 판단·검증의 사용자 경험

- **Parser 화면 대체가 아니다.** Raw Data는 Parser의 출력이며 자체 신뢰성 판정으로 간주하지 않는다.
- **Validator 실행 화면 대체가 아니다.** Validator가 만든 Run/Rule/위반 건수·구체 샘플은 별도 시스템의 검증 결과로 표시하고, 실측 시점/출처·실패/미평가를 구분한다.
- 허브는 자동 판정 불가능한 예외·설비 물리 동작·운영 맥락·담당자 경험을 **기술 지식으로 관리**한다. 수동 의견을 기계 검증 점수로 둔갑시키지 않는다.
- 검증 결과가 필요하면 `검증 결과 확인 → 검토 후보 제안 → 인간 판단·Item 발행` 흐름으로 연결한다. 모든 Validator finding을 자동 Item화하지 않는다.
- 기존 Item 기반 신규 작성 시 제목/분석은 참고 초안으로 복사하되, **새 SW의 관찰·근거·검증 상태는 초기 미확인**으로 시작한다.
- 게시 승인(`published`)은 기술적 사실 확정(`verified`)이 아니다.

---

## 4. 도메인 모델 및 데이터 소유권

### 4.1 핵심 객체 (확정 개념, 테이블 명칭은 후보)

- **Vendor / ProcessCategory / EquipmentModel**: 설비사·공정·모델. `EquipmentModel ↔ ProcessCategory`는 **M:N**; 분류 변경과 모델 안정 ID를 분리.
- **SoftwareVersion (`software_release`는 기존 후보 명칭)**: 한 모델에 소속된 SW **버전**. 초기엔 Build 하위 체계를 구현하지 않으며 추후 확장 여지만 둔다. 표시 문자열과 시스템 안정 ID 구분.
- **SWSpecRevision / SWModuleDefinition / SWEventDefinition**: **SW 버전별 독립 원본 명세**. 핵심 구조(모듈·Event ID·필드·발생 조건·관계)를 정형화하고 상세 규칙·예외는 Spec 문서/설명으로 보존. SW 변경이 다른 SW 명세를 갱신하지 않음.
- **ModelCommonProfile / CommonExtractionCandidate**: 여러 SW 독립 명세로부터 계산한 **파생된 모델 공통 후보**와 사람이 확정한 리비전. 어떤 SW 스냅샷의 어떤 정의를 사용했는지 출처·검토 시각·판단자를 보존. 신규/수정 SW로 영향이 생기면 `needs_revalidation` 표시, 기존 승인 결과를 자동 변경하지 않음. SW가 1개뿐이면 `1개 SW 기반`이라고 표시하고 타 SW 보편성을 확정하지 않음.
- **CommonConcept / ConceptMapping**: SW별 Module/Event 식별자는 독립. 동일/유사/대체/명칭만 동일 등의 관계·확신/검토 상태를 가진 매핑만 교차 검색에 사용. 표기 유사성은 동일 의미의 증거가 아님.
- **KnowledgeItem**: **소유 대상 1개 = 특정 Model 또는 특정 SW 버전**. 별개의 Model/SW 현상은 독립 Item 생성. 다른 시스템이나 모델의 관련 사항은 `ItemLink`로 참조한다.
- **ItemSubjectRef**: 소유 Model/SW의 여러 Module/Event에 붙는 N:M 설명·분류 링크. 링크 자체가 Item의 추가 소유권을 부여하지 않음.
- **ItemLink**: `similar`, `related`, `derived_from`, `duplicate_candidate`, 필요하면 `supersedes`. 방향/대칭성이 다른 관계를 구분하고 수동 검토를 통해 확정. `derived_from`은 원본 Item **특정 Revision**을 참조.
- **KnowledgeDraft / ReviewDecision / ItemRevision**: 일반 작성자·AI·Validator 유래 후보, 심사/수정 및 게시 스냅샷. 발행 권한이 있는 사람의 직접 게시도 Revision과 Audit은 동일하게 기록.
- **ItemAssessmentHistory (판단 변경 이력)**: 게시 Revision과는 별도로 `검증 판단`, `처리 상태`, `판단 근거`, `이견`, `변경 사유`, `작성자·시간`을 불변으로 기록. 현재 상태는 최신 유효 판단에서 파생.
- **ValidationFindingRef**: 별도 Validator가 생성한 Run/Rule/샘플/Result의 **참조**. 자동 검증 결과로부터 검토 후보 제안을 생성할 수 있으나 자동으로 Item의 검증 상태를 확정하지 않는다.
- **SourceAsset / Evidence**: 외부 원본 포인터 + 선택적 첨부 보관의 출처/버전/좌표/해시/ACL. 사실 근거와 해석을 구분.
- **ItemCategory / Tag / ManualGroup / SavedView**: 표준 분류·자유 키워드·사용자 구성 그룹·저장된 필터를 분리. 그룹은 원본 Item의 소유자가 아니다.
- **ExternalIdentityMap / CatalogImportJob**: 수동 등록·Excel/CSV Import·외부 기준정보에서 온 ID와 출처, 충돌/중복 검토 이력. 카탈로그의 `staging → preview → review → apply`를 정식 쓰기와 분리하며 권한·행별 적용 결과·재시도를 관리한다.
- **CatalogAudit / CatalogState(구현 후보)**: 카탈로그 객체 생성·수정·비활성화, 공정 매핑 변경, 외부 ID 수용/거부/충돌에 대한 사용자·시각·이전/새 버전 기록. 기존 범용 `audit_event`로 구현해도 된다.

### 4.2 개념 관계

```text
Vendor 1 ─ N EquipmentModel
EquipmentModel N ─ M ProcessCategory          # 탐색 분류, 복사 금지
EquipmentModel 1 ─ N SoftwareVersion         # Build 하위 객체 없음(초기)
SoftwareVersion 1 ─ N SWSpecRevision         # SW별 독립 원본
SWSpecRevision 1 ─ N SWModuleDefinition / SWEventDefinition
SW 정의 N ─ M CommonConcept (검토된 개념 매핑)
SWSpecRevision 여러 개 ─► CommonExtractionCandidate ─사람 승인─► ModelCommonProfileRevision
KnowledgeItem N ─ 1 Owner(Model XOR SW)       # 단일 소유, 1번 결정
KnowledgeItem N ─ M Module/Event (참조만)       # 소유 재정의 아님
KnowledgeItem N ─ M KnowledgeItem (유사/파생/연관)
KnowledgeItem 1 ─ N ItemRevision / ItemAssessmentHistory / Evidence
Validator Run/Finding ─► KnowledgeDraft 후보 ─사람 검토─► KnowledgeItem
Human/Ai Draft ─사람 또는 권한자 발행─► KnowledgeItem
```

### 4.3 소유 범위 및 불변조건

1. `owner_kind`는 `model` 또는 `software` 중 하나이고 `owner_id`는 해당 객체에 존재해야 한다. 한 Item이 복수 Model/SW에 **공동 귀속될 수 없다**. 범위를 옮겨 독립 사실을 섞는 대신 새 Item과 관련 링크를 생성한다.
2. SW Item은 오직 그 SW의 기술 사실을 나타낸다. 모델 공통 Item은 **모델 수준의 지식**을 나타내고 하위 SW의 모든 현상이 확인되었다는 뜻이 아니다.
3. 하나의 Item이 다수 Event/Module에 참조되어도 동일 소유 범위 내의 주제 연결이다. 다른 SW의 Module/Event를 참고로 표시할 때는 명시적으로 `external_reference`처럼 분리하고 그 범위에서 결론을 주장하지 않는다.
4. SW별 명세의 수정·재추출이 모델 공통의 승인 기록을 자동 덮어쓰지 않는다. 모델 공통 후보와 승인된 모델 프로파일은 출처 스냅샷과 검토 시각을 가진다.
5. 판단(관측/검증/이견/해결)과 발행(초안/심사/게시)은 다른 상태 축이다. 과거 판단을 수정/삭제하지 않고 추가 판단 기록으로 정정한다.
6. 사용자가 기존 Item을 파생해 새 SW Item을 만들면 `derived_from(source_item_id, source_revision)` 관계를 남기고, 새 Evidence/검증은 **미확인**에서 시작한다.

### 4.4 프로그램 책임 경계

| 프로그램 | 입력 | 책임 | 허브에서 취급 |
|---|---|---|---|
| Parser | 원본 로그 | 시작/종료 매칭·관계화·보정, 구조화 Raw Data 생성 | 산출물 출처 및 관련 Evidence 링크 |
| Validator (별도) | 원본 로그 + 명세 + 필요한 Parser 결과 | Coverage/Traceability/Logical Consistency/Parser Defect 등 **규칙 기반 검증** | Run/Rule/샘플 참조, 사람이 볼 후보 제공 |
| Log Knowledge Hub | 사람 기록 + AI 제안 + Validation Finding | 원본 사실·휴리스틱 해석·판단 변화·유사사례·개선 방향의 지속적 축적과 탐색 | **기술 판단의 기록 시스템**, 자동 검증 결과 저장소 대체 아님 |

Validator의 룰이 잡은 위반은 `검토가 필요한 신호`일 수 있다. 실제 결함인지, 정상 예외인지, 조건이 잘못 이해됐는지는 Evidence와 사람 판단을 통해 결정한다. 경험적 규칙이 검증 가능한 형태로 성숙하면 **Validator 규칙 후보**로 피드백할 수 있지만, 허브가 자동으로 검증 엔진을 변경하지 않는다.

---
## 5. 전체 모델 통합 검색 설계

### 5.1 요구되는 검색 성격

사용자 질의 예시: **`stepprcess가 process start보다 먼저 발생하는 문제`**

검색 시스템은 다음을 구분해야 한다.

| 층 | 의미 | 예 |
|---|---|---|
| 정확 키워드 | 표준 Event ID, 모델/모듈·SW 문자열 | `STEP_PROCESS` |
| 별칭·오타 | 표기법/띄어쓰기·자주 발생하는 오타 | `stepprcess`→`STEP_PROCESS` 후보 |
| 주제 검색 | 제목·설명·의견·승인된 근거 발췌 | `이벤트 순서` |
| **관계 검색** | 이벤트 A/B와 방향(선행·후행·누락 등) | `STEP_PROCESS BEFORE PROCESS_START` |
| 유사 사례 | 문장이 달라도 같은 문제/대상일 수 있는 항목 | `ProcessStart 이전 Step 이벤트` |

`A BEFORE B`와 `B BEFORE A`를 **같은 의미로 취급하면 안 된다**. 관측된 순서와 명세상 기대 순서도 각각 다른 관계다.

### 5.2 처리 파이프라인

```text
사용자 검색어
  → 입력 정규화/오타·동의어 후보(원문 보존)
  → Event/Model/Module 토큰 인식
  → 방향성 관계 추출(미확정은 자동 단정 금지)
  → PostgreSQL FTS + pg_trgm + 관계 인덱스 후보 생성
  → 현재 사용자 ACL에 맞는 검색 후보 제한
  → 관계 일치/정확 일치/문맥/텍스트 유사도 랭킹
  → itemId 기준 동일 레코드 중복 제거 + 소유 Model/SW 표시 + 관련 독립 Item 묶음·근거·일치 이유
```

- 질의 해석에 실패하면 **정확/텍스트 검색으로 폴백**하고, 자동 관계 해석 미확정을 UI에 표시한다.
- 검색 결과는 제목, 유형, **단일 소유 Model 또는 SW**, 관련된 독립 Item, 일치 이유, 허용된 근거, 기술 판단 상태, 갱신 시각을 포함한다.
- **기본 범위:** 사용자가 조회 가능한 전체 모델. 현재 모델/현재 SW 범위로 원클릭 축소.
- 문서/근거/AI 초안까지 검색할 수 있는 권한은 분리한다. 일반 공개 검색은 **승인/발행된 KnowledgeItem만** 대상으로 하고, 검토함에서만 승인 대기 초안을 별도로 검색한다.
- AI/Validator/사람 작성 화면 모두 기존 유사 사례를 추천하지만, **다른 Model/SW Item을 자동 합치지 않으며** 기존 Item 기반 작성은 새 Item+`derived_from` 링크로 처리한다. 동일 Item 중복은 정규 페이지네이션/인덱스 표현 차이만 제거한다.

### 5.3 검색 기술 선택 및 확장점

- **P0:** PostgreSQL Full Text Search(GIN), `pg_trgm` (유사 문자열), 관리형 용어 사전, 방향성 관계용 인덱스, 서버 정렬/커서 페이지네이션.
- 영어 및 이벤트 토큰은 언더스코어·대소문자·숫자·약어의 정규화 사전을 명시적으로 관리한다.
- 한국어 문장 품질은 실제 사내 샘플로 측정한다. 기본 FTS만으로 한국어 형태소 처리가 충분하다고 가정하지 않는다. PGroonga/형태소 분석기는 필요한 경우 검토.
- **P2 후보:** 사내에서 실행하는 임베딩 모델 + `pgvector` / 하이브리드 재랭킹. 질의마다 외부 LLM을 동기 호출하는 구조는 채택하지 않는다.
- 데이터/동시성 규모가 커져 전용 검색엔진 이점이 입증되면 `SearchPort` 뒤의 PostgreSQL 구현을 OpenSearch 등으로 교체할 수 있게 분리한다.

### 5.4 검색 결과 품질 평가

반드시 검증할 반례:

1. 이벤트 정확 일치 vs 오타 vs 단순 본문 우연 일치를 분리한다.
2. `STEP_PROCESS BEFORE PROCESS_START`와 역방향을 같은 결함으로 상위 노출하지 않는다.
3. 서로 다른 SW에서 발생한 유사 현상은 **서로 다른 Item**으로 유지한다. 다만 각 Item이 여러 모듈/그룹에 연결되어 검색 후보에 중복 등장하면 `item_id` 기준으로 1회만 노출하고 `related/similar` 사례를 묶어 탐색한다.
4. 불확실한 별칭은 하나로 강제하지 않고 후보·원문을 보여준다.
5. 접근 불가한 모델·Evidence가 제목, 스니펫, 자동완성, 전체 건수, 추천, 캐시에 새지 않는다.
6. 색인 지연/재빌드 중에도 원본 항목과 승인 상태가 바뀌지 않으며, 모델 공통정보 후보/미승인 명세 매핑이 확정 사실로 노출되지 않는다.
7. 한국어+영어 혼합 질의와 약어(예: `StepProcess`, `STEP_PROCESS`, `step process`)를 검증한다.
8. 같은 이름이지만 의미가 다른 이벤트를 자동 동일 개념으로 인식하지 않는다. 승인된 SW별 의미 매핑만 정확 매핑으로 표시한다.

---

## 6. PostgreSQL 데이터 저장 설계 (후보)

**원칙:** 제품 도메인의 확정 규칙과 물리적 테이블 설계를 구분한다. DB/검색엔진은 기술 후보이고, 실제 사내 운영 환경과 데이터 분포를 보고 확정한다. 정규화된 원본·파생 승인·검색 인덱스·검토 초안·판단 이력은 분리한다.

### 6.1 테이블/컬렉션 책임 (권장 스키마 후보)

| 객체/테이블 후보 | 책임 | 주요 제약 및 설계 힌트 |
|---|---|---|
| `vendor`, `process_category`, `equipment_model`, `model_process` | 설비사/공정/모델/다대다 탐색 + **카탈로그 관리 CRUD/비활성화** | 안정 PK; `(model_id, process_id)` unique, normalized code unique 정책은 원천 확인 후 확정, 변경 Revision/Audit; 물리 삭제보다 비활성화 |
| `software_version` | **Model→SW 버전** 단위만 관리 | `software_id` 안정 PK, `(model_id, version_key)` 충돌 검증; Build 컬럼/자식 객체는 후속 검토 |
| `sw_spec_revision`, `sw_module_definition`, `sw_event_definition` | SW별 독립 모듈·Event 원본/문서 참조 | `software_id`, 불변 `revision`, 내부 Definition ID; 변경 시 별도 SW 원본에 영향 없음 |
| `common_extraction_candidate`, `model_common_profile_revision` | SW 명세 비교 결과와 **사람이 승인한 공통 파생정보** | 사용 SW Spec Revision 목록, 후보 상태, 승인자·시각, `needs_revalidation` |
| `common_concept`, `sw_concept_mapping` | 서로 다른 SW의 Module/Event 의미 관계 | SW별 Definition ID와 concept ID; 관계 kind, evidence, reviewer; AI 후보 분리 |
| `knowledge_item` | Model **또는** SW **단일 소유**의 정식 Item | `item_id`, `owner_kind`, `owner_id`, `latest_revision`; 소유 참조 유효성은 서버/DB로 보장 |
| `knowledge_item_revision` | 정식 게시 본문/분류의 불변 스냅샷 | `(item_id, revision)` unique, actor, time, workflow source |
| `item_subject_ref` | 같은 Owner 범위 Module/Event 다중 참조 | `(item_id, subject_kind, subject_id)`; 외부 범위 참조는 별도 링크 타입 |
| `item_link` | 관련·유사·파생·중복 후보 링크 | `source_item_id`, `target_item_id`, `kind`, `source_revision?`, reviewer; 방향성 명시 |
| `item_assessment_history` | **기술 판단 변경** 별도 불변 이벤트 | prior/new state, 사실/해석 구분, rationale, evidence_ids, author, recorded_at |
| `item_category`, `tag`, `item_tag`, `manual_group`, `manual_group_member`, `saved_view` | 표준 분류·태그·수동 모음·쿼리 기반 뷰 | group/view 삭제 시 Item cascade delete 금지; 뷰 실행시 실시간 ACL |
| `source_asset`, `item_evidence`, `managed_attachment` | 외부 원본 참조·허용 발췌·선택적 파일 보관 | locator/version/hash/권한/보관 정책 및 attachment storage key |
| `validation_finding_ref` | Validator Run·Rule·Sample 참조 | 원본 시스템의 immutable identifier, result_at, data contract version |
| `knowledge_draft`, `draft_revision`, `draft_review` | 사람/AI/Validator 초안·검토 | origin, proposed owner, schema version, payload digest, reviewer/time |
| `catalog_import_job`, `catalog_import_row`, `catalog_import_resolution`, `external_identity_map` | 수동/Excel/CSV/외부 연동의 출처·ID 매핑 + **행별 검증·충돌 해결·적용 결과** | source_system, external_key, internal_id, conflict_state, row_status, review_version; staging 데이터를 승인 전 카탈로그 원본에 반영 금지 |
| `term_alias`, `knowledge_search_document`, `search_outbox` | 기술어 사전·FTS/trigram·색인 outbox | 승인된 공개 범위만 색인; 권한 변경 시 무효화 |
| `audit_event` | 사람 게시·검토·AI 제출·권한 변경·Evidence 행위 | actor/action/object/revision/timestamp; 원본 기밀 본문 미복제 |

### 6.2 도메인 및 검색 제약

1. **Item 단일 소유:** (`owner_kind='model'` XOR `owner_kind='software'`)에 대응하는 실재 객체를 참조. `item_scope` M:N으로 동일 Item을 여러 Model/SW에 귀속하던 v0.2 구조는 **폐기**. 물리적 polymorphic FK 처리는 DB 설계 시 트리거/분리 FK 등에서 선택한다.
2. **SW 독립 명세:** 특정 SW 버전의 Spec Revision이 원본이고 `model_profile_revision + SW override` 합성은 **폐기**. 승인된 모델 공통 파생정보는 원본 SW Spec Revision의 집합 및 해시를 보관한다.
3. **Build 보류:** 초기 `software_version`만 정의. 사용자에게 Build를 필수 입력시키거나 SW Build마다 별도 Item·명세 소유를 강제하지 않는다. Build 식별이 필요한 경우 향후 분리/마이그레이션할 확장 경계를 문서로 둔다.
4. **상태축 분리:** 게시 Workflow vs 사실 검증 vs 기술 Item 처리 상태는 별개. 판단 변경은 `item_assessment_history` append-only. 본문 편집은 `knowledge_item_revision`으로 기록.
5. **검색 소유:** 유사 사례는 Item을 독립적으로 보여 주며, 인덱스/태그/모듈 때문에 중복 발생한 **동일 item_id만** 중복 제거. 교차 SW 자동 통합 금지.
6. **승인 정보만 투영:** 검색·모델 공통 명세에는 승인되지 않은 AI 초안/공통 후보/미확정 개념 매핑을 확정 데이터로 포함하지 않는다. 검토자 전용 API는 별도.
7. **색인과 권한:** `search_outbox` 재처리/idempotent upsert, 접근권한 회수 시 자동완성·목록 수·스니펫·캐시 무효화. 각 조회에서 최종 객체 ACL 재검사.
8. **분류 분리:** 유형/카테고리는 관리되는 공통 기준, 수동 그룹은 N:M 멤버십, 저장된 뷰는 필터/정렬의 정의다. 어떤 경우도 Item의 생존·소유에 영향을 주지 않는다.
9. **대상 검증:** 동일 SW 내 Module/Event Subject는 유효한 해당 SW Spec Revision을 참조. 외부 SW와의 연관은 ItemLink 또는 ConceptMapping으로 명시한다.
10. **카탈로그 입수:** 수동·Excel/CSV·외부 연동 시 미리보기/중복 후보/매핑 충돌/원천 우선순위가 필요. 외부 원본을 임의로 덮어쓰지 않는다. 실제 등록은 `Vendor/Process(독립) → Model(Vendor+Process M:N) → SW(Model)` 관계를 서버에서 검증하며, `Import 업로드 ≠ 데이터 발행`이다.
11. **카탈로그 변경:** 활성·비활성 상태/Revision/Audit을 분리. 기존 SW·Item·Evidence를 보유한 Model/Vendor/Process는 연결 자료를 연쇄 삭제하지 않는다. 모든 관리자 쓰기는 별도 `catalog:*` 권한과 expectedVersion을 검증한다.

### 6.3 원본·선택적 첨부 Evidence

Evidence는 **외부 참조**와 **허브에 보관한 선택적 안전 첨부** 두 방식을 지원한다. 원본 로그 파일 전체를 일괄 DB에 중복 복사하지 않는다.

```text
Evidence
  storage_mode   = external_reference | managed_attachment
  source_type    = raw_log | spec | report | validation_run | image | manual_note
  source_id      = 원천 시스템 또는 허브에 등록된 자료 ID
  source_version = 원천 파일 스냅샷 / Spec Revision / Validator Run
  locator        = fileId + line range / EventId / SectionId 등
  allowed_excerpt= 정책상 노출 가능한 발췌(없을 수 있음)
  content_hash   = 가능할 때 원본·첨부 무결성 검증
  sensitivity    = 자료 보안 등급 및 접근 정책
  observed_at    = 원천 관측 시점 (알 때만)
  captured_at    = 허브 연결/첨부 등록 시점
```

- 외부 원본은 원천 시스템 ACL을 우회하지 않고 접근한다. 첨부는 허브의 서버 측 ACL, 파일 형식/크기 제한, 악성코드 검사, 보관·삭제·접근 감사가 적용돼야 한다.
- 파일 업로드 구현(파일 서버, 사내 Object Storage, DB 메타+외부 바이너리 등)과 retention 상세는 **사내 보안/운영 조건 확인 후 결정**할 기술 후보.
- 출처가 삭제·이동돼도 기존 저장 항목에서 원문 접근이 불가능하다는 사실을 명시한다. 과거 허용 발췌만 남았을 때 전체 원본을 재검증한 것으로 주장하지 않는다.
- 관찰 기록이 시간 파일 경계를 넘을 수 있으므로 샘플 파일 끝의 Start/End 불일치만으로 결함을 확정하지 않는다.
- 미제공/검증 불가 원본의 인용은 `unverified_source`처럼 구분하며 AI가 만들어낸 텍스트를 검증된 Evidence로 꾸미지 않는다.
- 민감 원본·발췌를 원천 ACL 무시한 채 검색/Export/AI 입력·외부 공유 경로로 복사하지 않는다.

---

## 7. AI 분석 결과 접수와 사람 승인 (Human-in-the-Loop)

### 7.1 사람·AI·Validator 유래 제안과 게시 권한

지식 허브의 정식 Item 생성 경로는 권한에 따라 분리된다. `KnowledgeDraft`는 제안/검토 대기 기록이고 `KnowledgeItem`은 발행된 기술 지식이다.

```text
[사람 직접 작성]
   ├─ Contributor(일반 작성권) ──► [Draft] ──► [Publisher/Reviewer가 검토] ──► [정식 Item]
   └─ Publisher(발행권) ────────────────────────────► [정식 Item + Revision + Audit]

[사내 AI/Agent] ──► [Draft Intake (초안만)] ──► [사람 검토/수정/승인] ──► [정식 Item]
[별도 Validator] ──► [Finding/Run 참조] ──► [선별된 검토 후보] ──► [사람 판단] ──► [정식 Item]
```

- **AI는 반드시 사람 검토·승인**, 서비스 계정으로 `publish/approve` 수행 불가.
- **Validator의 결과는 단순한 자동 신호/증거**다. 전체 위반을 자동 Item화하지 않고 선별·중복검토·사람의 해석을 거쳐서 등록한다.
- **일반 작성자는** 자신의 초안 작성·제출·수정 요청을 수행할 수 있지만 정식 게시 전 승인 필요.
- **발행권자는** 사람 세션에서 직접 작성·수정·게시 가능. 직접 발행이어도 Revision, 작성자, 발행 시점, 감사 흔적은 동일하게 남긴다.
- **검토권자**의 초안 승인, 반려, 수정 후 승인 권한은 명시적 ACL. 작성자=검토자가 가능한지 등 상세 분리 정책은 운영/보안 검토 대상.
- 신규 Draft/Item은 반드시 단일 Model 또는 단일 SW를 소유 대상으로 선택한다. 기존 Item 파생 작성은 새 Item ID를 만들고 원본 Item의 특정 Revision과 `derived_from` 링크를 기록한다.

### 7.2 서로 독립적인 상태 축

| 상태 축 | 의미 | 초기 상태 예시(정확한 ENUM은 구현 전 확정) |
|---|---|---|
| 초안 처리 | 제출/검토/보류/승인/반려 | `submitted`, `in_review`, `changes_requested`, `approved`, `rejected`, `withdrawn` |
| 게시/접근 | 사용자에게 발행된 Item인지 | `draft`, `published`, `archived` |
| 기술적 사실 검증 | 관찰·판단의 확인 수준 | `not_checked`, `observed`, `verified`, `disputed` |
| 문제 처리 | 조치 중/종결 등 업무 진행 상태 | `open`, `under_investigation`, `resolved` |
| 모델 공통 추출 | 승인 전 후보/재검토/확정 | `candidate`, `needs_revalidation`, `approved` |
| 개념 매핑 | SW Event/Module 의미관계 확인 | `proposed`, `confirmed`, `rejected` |

**승인(Published/Approved) ≠ 기술적 검증(Verified).** 사람이 게시한 미확인 지식도 가능하다. 판단이 바뀌면 `ItemAssessmentHistory`에 새 기록을 추가하고 과거 판단/이견은 남긴다.

### 7.3 API 안전 규칙

1. AI/Agent 서비스 신원은 최소 `draft:create`, 필요한 경우 `knowledge:search`만 가진다. **approve/publish/update_published는 거부**.
2. 출처를 가장할 수 없도록 AI 요청의 `actorId`, `approvedBy`, `createdAt` 등 신원/시각 필드는 서버가 세션 또는 서비스 자격으로 확정한다.
3. 초안 입력은 **버전 있는 JSON Schema**로 검증하고 필수 필드, 최대 크기, target 존재, 예상 관계 토큰, 인용 근거의 검증 가능성을 확인한다.
4. 기밀 원문, 명령/코드, 외부 링크 등에서 온 프롬프트 인젝션 텍스트는 **신뢰하지 않는 데이터**로 취급하고 에이전트의 권한/스킬 규칙을 바꾸지 못하게 한다.
5. 제안/Item 작성 전 전체 Model/SW의 유사 항목 검색을 수행하고 관계 후보를 표시한다. **서로 다른 Model/SW의 Item을 자동 병합/공유하지 않는다.**
6. 수정 제안은 기존 Item의 **현재 리비전**을 명시한다. 승인 시 바뀌었다면 `conflict`로 사람에게 재검토 요청, 조용히 덮어쓰지 않는다.
7. 승인자는 저장할 **정확한 payload digest/버전**을 확인한다. AI가 제출 후 수정한 내용이 검토자 승인 시점에 바뀌지 않게 한다.
8. 검토 승인/반려 또는 직접 발행은 서버가 **사람의 인증 세션과 발행·검토 권한**으로 판단. AI/Validator 서비스 계정이 UI 또는 API를 우회해 자기 승인할 수 없음.
9. 초안 원본, 수정 내용, 판단·사유·승인자·시각, 생성 모델/실행 ID(식별 가능한 범위)를 감사 가능하게 기록한다.
10. 사람 검토 후에도 **근거가 부족한 주장**은 `미검증` 상태로 게시하거나 승인 자체를 보류할 수 있다. 검토 UI가 출처 문제를 명시적으로 표시한다.
11. AI/Validator 유래 후보는 자동 **분류/연관 추천**만 가능하며, 기술 결함/원인을 자동 확정하거나 검증 규칙을 변경하지 않는다.
12. 카탈로그·공통 명세·SW 개념 매핑의 AI 자동 제안도 해당 객체별 별도 승인 게이트를 거쳐야 한다.

### 7.4 통합 검토 UI (초기 범위)

- 좌측: 실제 Evidence 원본 위치/발췌, Validator Run/Rule 링크(해당하는 경우), 출처 접근 상태, 기대 vs 관측(있으면)
- 우측: 사람·AI·Validator 중 초안 출처를 표시하고 제목·소유 Model/SW·유형·카테고리·상세·분석·개선 방향 편집
- 아래: **소유 대상 1개**와 관련된 다른 SW의 독립 유사 Item, 출처 미검증·중복·버전 충돌 경고
- 액션: 승인, 수정 후 승인, 수정 요청/보류, 반려 + 사유
- 제안 원문(AI/사람/검증 Finding)과 사람 수정본 **Diff**, 변경 담당/시각 표기
- 승인되지 않은 초안은 일반 검색 결과, 공개 통계 및 외부 공유 링크에서 제외(검토 권한자 전용)

### 7.5 LLM Skill (MCP 없이 시작)

계획 파일: `skills/knowledge-draft-submit/SKILL.md` (제품 전용, 플랫폼 SDK 소스에 포함하지 않음)

절차:

1. 내부 인증된 API에서 필드/스키마/기술 용어 사전/허용 타깃 조회
2. 허용된 원본 로그/문서/스펙을 읽어 **관찰 사실과 해석을 분리**
3. 전체 모델 검색 API로 다른 Model/SW의 유사 사례 확인; 별도 Item 유지, 새 초안에 출처/관련 링크만 기록
4. `sourceId`, 버전, 줄/구간 등 검증 가능한 Evidence 포인터 생성
5. 단일 소유 Model/SW를 지정하고 `JSON Schema`에 맞춰 후보 작성. 불확실한 사항은 `not_checked`로 표시
6. AI Draft API로 초안 제출(멱등 키 포함)
7. 반환된 Draft ID / 검토 링크를 기록하고 사람 승인 전에는 완료로 단정하지 않음

기술적으로는 문서화된 REST API와 스키마 파일이 있으면 구현 가능하다. MCP는 **후속 선택지**이며 초기에 별도 서버를 만들 필요가 없다.

---

## 8. 독립 웹 API 계약 (후보, REST 예시)

**API URL·DTO·서버 프레임워크는 미확정 구현 후보**다. 도메인 경계는 확인된 제품 정책을 따르되 인터페이스 스키마는 기술 설계 시 확정한다.

| 기능 | 예시 엔드포인트 | 계약·권한 포인트 |
|---|---|---|
| 구조 계약 | `GET /api/v1/knowledge/schema` | Item/Draft/Spec/공통개념 계약과 허용 유형 |
| **설비사 관리** | `GET/POST /api/v1/catalog/vendors`, `GET/PATCH /api/v1/catalog/vendors/{id}` | 설비사 목록·신규·수정·비활성화 권한, stable ID/중복 검증 |
| **공정 관리** | `GET/POST /api/v1/catalog/processes`, `GET/PATCH /api/v1/catalog/processes/{id}` | 독립 분류 사전, Model N:M, 중복 검증 |
| **모델 관리** | `GET/POST /api/v1/catalog/models`, `GET/PATCH /api/v1/catalog/models/{id}` | 수동 등록/수정, Vendor 1개, Process M:N, 제한 객체 ACL |
| **SW 관리** | `GET/POST /api/v1/catalog/software`, `GET/PATCH /api/v1/catalog/software/{id}` | 해당 모델의 SW 버전 등록/수정, Build 필수 입력 없음 |
| 카탈로그 Import | `POST /api/v1/catalog/imports`, `POST /imports/{jobId}/validate`, `POST /imports/{jobId}/apply` | Excel/CSV 5단계: **파일 → 열 매핑 → 검증 → 충돌 해결 → 적용**; 미리보기 단계 쓰기 금지 |
| 외부 ID 매핑 | `GET/POST /api/v1/catalog/identity-mappings` | 외부 마스터와 내부 ID 대응, 자동 병합 금지 |
| Model 프로파일 | `GET /api/v1/catalog/models/{modelId}` | 승인된 공통 파생정보 + Model 자체 Item |
| SW 프로파일 | `GET /api/v1/catalog/software/{softwareId}` | SW별 독립 명세/Revision, Build 미포함 |
| SW 명세 | `GET/POST /api/v1/specs/software/{softwareId}/revisions` | 핵심 정형 명세 + 관련 문서; 승인/검토 권한 |
| 공통정보 추출 | `POST /api/v1/catalog/models/{modelId}/common-candidates` | SW 명세 기반 후보 생성, 확정은 사람 승인 |
| 이벤트/모듈 의미매핑 | `GET/POST /api/v1/concepts/mappings` | 제안·검토·확정 상태 분리 |
| 정식 Item 조회 | `GET /api/v1/knowledge/items/{itemId}` | 단일 Model/SW owner, 관련 모듈/Event/판단 이력/근거 |
| 통합 검색 | `POST /api/v1/knowledge/search` | 전체 Item 독립 결과 + 유사 연결 + ACL |
| 유사 Item | `POST /api/v1/knowledge/similar` | `similar/related/derived_from` 링크 후보 |
| Item 파생 초안 | `POST /api/v1/knowledge/items/{itemId}/derive-draft` | 새 Model/SW owner와 Item ID, 원본 Revision provenance |
| 수동 그룹·저장 뷰 | `/api/v1/knowledge/groups`, `/api/v1/knowledge/views` | Item 독립, 뷰 호출 시 ACL 재평가 |
| AI/사람/Validator 초안 | `POST /api/v1/knowledge/drafts` | origin 및 서비스 신원별 생성 권한; 게시권 없음 |
| 초안 목록·수정 | `GET/PATCH /api/v1/knowledge/drafts/{draftId}` | 작성자·검토자 권한, 변경 이력/충돌 보호 |
| 사람의 초안 검토 | `POST /api/v1/knowledge/drafts/{draftId}/review` | 승인/반려/보류; 사람 독립 세션 필요 |
| 발행권자의 직접 Item | `POST /api/v1/knowledge/items` | 사람 `publish` 권한 필요, Revision+Audit 원자적 저장 |
| 정식 Item 수정 | `POST /api/v1/knowledge/items/{itemId}/revisions` | 발행권자의 사람 수정 또는 승인된 Draft 반영 |
| 판단 변경 이력 | `GET/POST /api/v1/knowledge/items/{itemId}/assessments` | 판단자·근거·사유·이견 포함 append-only |
| 근거 참조/첨부 | `/api/v1/knowledge/evidence`, `/api/v1/knowledge/attachments` | 외부 링크 + 보안정책 허용된 선택적 업로드 |
| Validator 연동 | `POST /api/v1/knowledge/validation-candidates` | Run/Rule/Finding의 참조로 **검토 후보만** 생성 |
| Top View 정보 | `GET /api/v1/visualization/software/{softwareId}` | SW별 Layout/Topology Viewer mapping; 편집은 Studio |

**예시 AI Draft 요청 (실제 로그가 아닌 합성 데이터):**

```json
{
  "schemaVersion": "1",
  "proposalType": "create_item",
  "origin": "ai",
  "target": {
    "ownerKind": "software",
    "ownerId": "sw-demo-240"
  },
  "item": {
    "type": "needs_review",
    "title": "STEP_PROCESS 선행 발생 확인 필요",
    "categoryCode": "event_sequence",
    "keywords": ["STEP_PROCESS", "PROCESS_START"],
    "observation": "관찰된 샘플에서 STEP_PROCESS가 PROCESS_START보다 앞에 기록됨",
    "analysisOpinion": "이벤트 기록 조건 또는 시퀀스 정의 검토 필요",
    "improvementProposal": "정상 이벤트 순서와 생성 조건을 설비 SW 담당자와 확인"
  },
  "eventRelations": [{
    "subjectEvent": "STEP_PROCESS",
    "predicate": "BEFORE",
    "objectEvent": "PROCESS_START",
    "relationKind": "observed"
  }],
  "evidence": [{
    "sourceId": "sample-demo-001",
    "startLine": 421,
    "endLine": 435
  }],
  "observationState": "not_checked"
}
```

**예시 응답:** `202 Accepted` + `draftId`, `status=submitted`, `draftVersion`, `reviewUrl`, `similarItemCandidates`, `validationWarnings`. 이것은 **초안 접수**를 뜻하며 `publishedItemId`가 반환되지 않는다. `origin`은 요청자가 자의적으로 사칭할 수 없으며 서버가 인증된 실행 신원과 비교해 확인한다.

API 구현 시:

- JSON 스키마 및 코드 생성물의 버전이 어긋나면 제출 거부/명시 오류.
- `Idempotency-Key` 재시도 지원, 서명된 액터 신원, 호출량 제한, 요청 크기 제한.
- 승인/수정 시 불투명 `expectedVersion`, 충돌 응답, 감사의 원자적 저장.
- 안전한 원본 참조/관리형 첨부의 presigned URL 또는 서버 매개 조회는 실제 저장소·권한 모델 확정 뒤 결정.
- SDK/호스트에 탑재할 때 기존 플랫폼 `menuQuery/menuAction`과 기능을 매핑하는 **어댑터**를 제공하되, 독립 도메인 REST API의 의미를 UI 직접 fetch에 종속시키지 않는다.

---
## 9. 독립 웹 아키텍처 및 패키지 설계

### 9.1 실행 구조

```text
          ┌──────────────────────────────────┐
          │ Standalone Web (React/TS/Vite)   │
          │ @ap/ui · @ap/components 재사용    │
          │ standalone host adapter           │
          └────────────────┬─────────────────┘
                           │ HTTPS + 자체 웹 세션/Agent 자격
          ┌────────────────▼─────────────────┐
          │ Knowledge API (Fastify 후보)      │
          │ AuthN/AuthZ · Catalog · Items     │
          │ Draft Review · Search · Audit    │
          └───────┬─────────┬────────────────┘
                  │         │
        ┌─────────▼─────┐   └───────► Evidence/Validator/TopView Adapter
        │ PostgreSQL    │             (원본/Validator Run/Studio Viewer)
        │ 원본 + 색인   │
        │ outbox + audit│
        └─────────┬─────┘
                  ▼
          Search/Index Worker

[향후] Analytics Platform Host
          └─ platform-adapter(메뉴·Auth·Context·Link·Theme)
               └─ 기존 Knowledge UI/domain/API를 그대로 소비
```

- 독립 제품의 **기능/DB는 플랫폼에 붙는다는 이유만으로 재작성하거나 자동 병합하지 않는다.** 플랫폼 통합은 호스트·인증/권한·라우팅·디자인·연동 계약부터 단계적으로 수행.
- 백엔드는 **Fastify + PostgreSQL을 우선 후보**로 한다. 실제 팀·배포·회사 환경에 따라 변경 가능; 확정하지 않았다. 독립 실행 중 FastAPI가 필수는 아니다.
- 향후 Analytics Platform의 기존 서버 책임과 연동하는 경우 Fastify가 코어, FastAPI가 분석 데이터를 맡는 기존 ADR-0095 경계를 존중한다. 독립 지식 허브가 인증/권한 정책을 장기적으로 중복 운영하지 않도록 어댑터로 통합한다.
- 도메인 서비스와 DB 스키마는 독립 테스트·이관 가능한 단위로 유지한다. 같은 인스턴스/별도 인스턴스 운영 방식은 통합 시점에 결정한다.

### 9.2 권장 저장소 구조 (Candidate)

```text
log-knowledge-hub/
├─ apps/
│  └─ web/                    # 독립 호스트/라우팅/인증/앱 조립
├─ packages/
│  ├─ core/                   # Domain types, rules, Value Objects (AP 의존 금지)
│  ├─ features/               # Catalog(Vendor/Process/Model/SW/Import), Items, Search, Review 화면/UseCase
│  ├─ api-client/             # 계약 생성 모델·HTTP 클라이언트
│  ├─ ui/                     # 이 제품 전용 UI 패턴; 공통 primitive는 @ap/ui
│  ├─ standalone-adapter/     # 독립 앱용 Auth/Nav/Context/Services
│  └─ platform-adapter/       # 향후 AP 메뉴/호스트 연결, 코어 역방향 import 금지
├─ server/
│  ├─ api/                    # HTTP 라우트·인증 경계
│  ├─ domain/                 # SW Spec/Model Common/Item/Assessment/Review/Search
│  ├─ adapters/               # PostgreSQL, Evidence, Validator, Top View, Import
│  ├─ workers/                # 색인 outbox 작업
│  └─ migrations/             # versioned SQL/ORM migration
├─ contracts/                 # JSON Schema/OpenAPI, 오류/버전/권한 계약
├─ skills/
│  └─ knowledge-draft-submit/ # LLM Skill: 정식 발행 금지
├─ fixtures/                  # 합성 설비·로그·검색 사례(기밀 금지)
├─ tests/                     # unit/integration/e2e/perf/security
└─ docs/
   ├─ architecture/
   ├─ decisions/
   └─ operations/
```

**의존성 방향:** `core`는 `@ap/*`, DOM, 특정 서버 프레임워크, 실제 DB에 의존하지 않음. `features`는 Host Port를 통해 인증·네비게이션·API를 소비. `standalone-adapter`와 `platform-adapter`가 각자의 Host Port를 구현. `@ap/ui`/`@ap/components`는 공개 SDK 릴리스만 pin하여 사용하고, 디자인 토큰을 복제하지 않는다.

### 9.3 Host Adapter에서 추상화할 최소 계약

| 기능 | Standalone Host | Platform Host(나중) |
|---|---|---|
| 인증 | 사내 독립 세션/SSO 후보 | 플랫폼 인증/SSO 연동 |
| 권한 | 제품의 item/model/evidence/draft 정책 | 플랫폼 공통 권한 + 제품 객체 ACL |
| 네비게이션 | 자체 route + breadcrumbs | 메뉴 Registry · linkTo · breadcrumb |
| 데이터 요청 | Knowledge REST + 클라이언트 | 플랫폼의 적절한 query/action 어댑터 |
| UI | @ap/ui/@ap/components + 독립 AppShell | 플랫폼 Shell 내 메뉴/패널 |
| 알림·감사 | 독립 제품 책임 | 플랫폼 공통 서비스에 이벤트/감사 연동 |
| DB | 독립 운영 | 독립 유지 또는 승인된 경계로 연결 |

**주의:** 기존 SDK의 모든 화면 부품이 독립 호스트에서 즉시 동작한다는 보장은 없다. 사용 부품의 Peer Dependency/Kernel·Provider 요구를 먼저 검사하고, 호스트 결합된 컴포넌트는 얇은 통합 어댑터에서만 소비한다. 제품 전체에 플랫폼 Kernel을 주입하는 것을 기본으로 삼지 않는다.

### 9.4 Top View 연동 원칙 (확정 기능 경계)

**허브 안에서 Viewer를 렌더링**하고, **편집은 `equipment-visualization` Studio**에서 수행한다. 허브는 Layout 편집 소유자가 아니다. `equipment-visualization`의 구조화된 Layout + Component Catalog + Topology + Mapping Version이 시각화 원본이며 SVG는 표현 결과다.

- 허브의 해당 **SW 버전**과 Top View의 Mapping/Layout Revision을 대응시킨다. SW가 다르면 다른 구성을 보여줄 수 있다.
- 모듈·로봇 블레이드·HoldingSite 등의 semantic ID를 명세/Item과 연결해 `모듈 클릭 → 해당 SW의 Event 및 Item` 탐색을 지원한다.
- 레이아웃을 수정할 때는 Studio 딥링크로 이동시키고, 저장 후 새 Mapping/Revision을 명시적으로 다시 연결한다.
- 실제 제조사 도면임을 근거 없이 주장하거나 미관측 material motion을 실측 Replay로 표현하지 않는다.
- **기능의 최종 목표는 Viewer 통합으로 확정**. 독립 릴리스 초기 단계에서 SDK/Studio 버전 의존성 확인 전까지 링크/placeholder를 임시로 사용할 수 있으나, 링크만으로 완료 처리하지 않는다.

---

## 10. 보안·권한·감사·사내망

1. **Site 비의존:** 설비사/모델/SW 분류가 MARS의 MEM/FDR Site/room_name Scope와 다르다는 사실을 유지. Site가 없다는 이유로 ACL/인증도 없다고 가정하지 않는다.
2. **기본 공유 + 예외 제한:** 허용된 사내 사용자에게 일반 정식 지식을 기본 공유하되, 민감 Model/SW/Item/Evidence 및 검토 Draft는 선택적 접근 제한. 객체별 읽기/작성/검토/발행 권한은 분리하고 직접 URL/검색/자동완성/통계/AI 추천에서도 서버가 최종 판정한다.
3. **사람 역할 차등 + AI 제한:** Viewer/Contributor/Publisher/Reviewer/Administrator 등 역할(정확한 역할 정책은 구현 시 확정)을 구분. **카탈로그 편집/Import 권한은 Item 작성·발행 권한과 별도로 부여**한다. AI는 초안 생성만, Validator는 검토 후보 제출만. 모두 서비스 계정으로 발행 endpoint 접근 금지.
4. **자료 등급:** 실제 장비 원본 로그·모듈 구조·도면·기술 사양과 출력 발췌는 사내 정보분류/보관·접근 정책을 따른다. 외부 공개 GitHub에 실원본 자료를 넣지 않는다.
5. **출처와 주장 분리:** 원천 관찰·Validator 자동 검사·사람의 휴리스틱 분석·AI 초안은 서로 다른 신뢰 수준. 승인되지 않은 AI 요약이나 검증 Finding만을 확정 기술명세/결함으로 노출하지 않는다.
6. **입력 보안:** 서버의 JSON Schema 검증, HTML/Markdown sanitization, 파일 검사, 요청/문자열 크기 제한, rate limit, 멱등성, audit logging.
7. **수명주기:** 자료 삭제·권한 회수·정정 때 검색 인덱스/미리보기/캐시/초안/관리형 첨부와 연결되는 유출 경로까지 고려. 민감 객체의 제목/존재/건수도 접근 불가 사용자에게 노출하지 않는다.
8. **에이전트 프롬프트 인젝션:** 로그/스펙/문서 속 텍스트는 신뢰하지 않는 출처. `approve`를 지시하는 문장이 포함되어도 실행하지 않는다.
9. **망분리 지원:** 외부 API 호출 없는 실행 가능성, 내부 Git/패키지 미러, SDK tarball 고정, 합성 fixture 기반 오프라인 테스트.
10. **감사:** 사람 승인/거부/직접 발행, 초안 변경, 기술 판단 이견/변경, SW 공통 추출 승인, ID 매핑, Evidence 연결·삭제를 행위자·시각·대상 Revision과 함께 추적. 원본 로그를 감사 로그 본문에 무분별하게 복제하지 않는다.

---

## 11. 성능·품질·관측 목표 (측정 전 가설)

| 항목 | 초기 목표/정책 | 검증 조건 |
|---|---|---|
| 전체 검색 | **10만 Item 기준 서버 p95 ≤ 300ms** (후보 목표) | 권한 필터 및 인덱스 포함 실측 |
| 동시 사용자 | 30명 동시 검색 시 부하 확인 | 대표 mixed Korean/English 질의 |
| 검색 페이지 | 초기 20건, 서버 커서 페이지네이션 | 정확 순서·중복 억제 |
| 검색 입력 | 약 250–300ms 디바운스, 진행 중 요청 취소 | 늦은 응답이 최신 결과 덮지 않음 |
| 트리 | lazy children + cursor + 가상화 | 수천 노드 성능/메모리 |
| 색인 | outbox 재시도, lag·failure 모니터링 | 저장/승인 후 검색 반영 검증 |
| UI | 접근 가능한 키보드/포커스/상태 표시 | Playwright/Vitest + 접근성 점검 |
| 검토 | 모든 미승인 초안/Validator 후보의 일반 정식 검색 노출 0 | 서비스 계정 직접 발행·권한 우회 테스트 |
| 링크 | 안정 ID / 경로 복원 / 권한 회수 처리 | 새 탭·새로고침·Back/Forward |

**목표치는 성능 보장/기술적으로 입증된 사실이 아니다.** 샘플 크기, 근거 첨부 크기, 별칭 분포, 권한 조인 선택도, 요청 동시성, 네트워크 지연에 따라 조정한다.

관측 지표 후보: `search_latency_p50/p95`, `search_result_count`, `index_lag`, `index_retries`, `query_normalization_fallback`, `similar_item_suggestion_rate`, `draft_submitted/reviewed/approved/rejected`, `validator_candidate_reviewed_count`, `common_profile_needs_revalidation_count`, `evidence_unresolved_count`, `permission_denial_count`.

---

## 12. 단계별 구현 계획과 수용 기준

**단계 배정은 권장 계획**이다. 1–17번 결정은 기능 정책 확정이고, 어느 Phase에 실제 탑재할지는 개발/의존성 검증 후 조정할 수 있다. 단 축소된 임시 구현을 최종 기능 완료로 표시하지 않는다.

### Phase 0 — 독립 실행 기반·카탈로그·명세 기초

- [ ] 독립 Repository, React/TS 웹 + API 서버 + PostgreSQL 후보, Analytics Platform UI SDK/Peer Dependency 검증.
- [ ] Vendor/Process/Model/SW 안정 ID·Process↔Model M:N·Model/SW 기본 탐색·모델 단위 Item 개념.
- [ ] **카탈로그 관리 UI**: 설비사·공정·모델·SW 목록/등록/수정/비활성화, 역할별 CTA와 우측 편집 패널, 생성 후 모델→SW 연결(§15–16).
- [ ] **SW별 독립 Spec Revision** + 핵심 Event/Module 구조와 원문 문서 참조. Model 공통 후보·확정 정보의 소유권 분리.
- [ ] 카탈로그 **수동 등록 + Excel/CSV Import**(파일·열 매핑·행별 검증·충돌 해결·명시 적용·결과 리포트의 5단계) 및 외부 ID 매핑 경계. 실제 외부 시스템 동기화는 후속.
- [ ] ACL(사내 기본 공유+민감 선택 제한), 사용자의 `Contributor/Publisher/Reviewer` 정책 기본 구현, Audit.
- [ ] Validator/Top View/외부 원본 연동을 위한 포트·DTO. 실제 연결 데이터가 없으면 `미평가/미연결` 표시.
- [ ] 합성 fixture, 마이그레이션·스키마 검증·기본 보안 테스트.
- [ ] **UI 품질 게이트**: SDK 테마/토큰 준수, 1440/1280/1024 해상도에서 목록·생성 패널·Import 충돌 화면 스크린샷/접근성/선택 강조 검수(§16–17).

### Phase 1 — 지식 허브 본래 기능의 실사용 단계

- [ ] **단일 Model 또는 SW에 귀속되는 Item** CRUD + 수동 그룹/저장된 뷰/표준 유형·카테고리/태그.
- [ ] 판단 변경 **별도 이력**, 게시 Revision, 관찰·기대·해석·이견·개선 구분.
- [ ] 외부 Evidence 포인터 및 정책 허용 첨부 파일; 권한·보관·출처·해시.
- [ ] 전체 독립 Item 검색(FTS/pg_trgm/별칭/관계 방향), 유사 사례 연결·역방향 반례, 검색 이유 표시.
- [ ] 기존 Item 기반 **새 Item 파생 초안** 및 `derived_from(source revision)` 관계. 근거/검증 상태 자동 승계 금지.
- [ ] 일반 작성자 검토/발행권자 직접 게시/AI Draft Intake+Skill, 검토·수정·승인·반려, 역할별 테스트.
- [ ] Validator의 Run/Rule/Finding을 **선택적 검토 후보**로 받아 사람이 지식화하는 연동 계약. 실제 Validator 구현은 별도 프로젝트.
- [ ] SW 공통 후보 자동 비교·사람 확정, SW별 ID와 개념 매핑 후보/사람 승인(데이터 공급 여건에 따라 최소 구현부터).
- [ ] 실측 검색 성능·ACL 누출·AI/Validator 무단 발행 금지 테스트.

### Phase 2 — 시각화·출처 연결·명세 고도화

- [ ] **허브 내 `equipment-visualization` Viewer** 실제 렌더링(완료 기준); SW별 Layout/Mapping Revision과 명세/Item 연결, 모듈 클릭 탐색.
- [ ] **Top View 편집은 별도 Studio** 딥링크; 허브가 Layout을 직접 수정하지 않음.
- [ ] 기존 원본 로그·Spec·Validator Run·Parser 결과 실제 접근 가능한 근거/딥링크.
- [ ] SW 버전 간 명세 비교, 모델 공통 재추출/재확정 및 영향 분석, 판단 이력 비교 UX.
- [ ] 정교한 개념 매핑/한국어 검색 품질, 대용량 인덱스 검증.
- [ ] 필요성/자료 정체성/이관 비용을 검증한 뒤 **Build 하위 관리 도입 여부** 검토; 초기 약속 기능 아님.

### Phase 3 — 플랫폼 탑재·장기 확장

- [ ] Analytics Platform Host Adapter, `System → Group → Menu`에서 객체 탐색/라우팅 연동.
- [ ] 인증·권한·감사·API 경계 통합, 독립 도메인 API·Item ID·Evidence 정체성 유지.
- [ ] Standard Log Lifecycle/Validator Round·Defect·Retest 연동. 허브가 해당 워크플로우를 대체하지 않음.
- [ ] 사내 검증된 임베딩 모델 기반 유사성 평가/반자동 지식 추천 PoC; 외부 LLM에 원문 전송 금지.

### 통합 인수 시나리오 (Phase 별 준비 조건 고려)

1. Model X100을 두 공정에서 탐색해도 **동일 Model ID**로 열리고, SW/Item이 복제되지 않는다.
2. Model X100 / SW 1.0과 SW 2.0의 이벤트 명세는 서로 독립적으로 저장되고, SW 1.0 변경이 SW 2.0 원본을 변경하지 않는다.
3. 두 SW 명세의 공통 후보는 자동 제안될 수 있지만 사람 승인 전 공통 확정으로 표시되지 않는다. 승인 후 SW 원본 변경 시 재검토가 걸린다.
4. Model 공통 기술 Item과 SW 고유 기술 Item을 **각각** 등록·조회할 수 있다. Model Item이 SW 모두의 검증된 사실로 자동 복사되지 않는다.
5. 같은 현상이 Model A/SW 1.0과 Model B/SW 2.0에서 발견되면 **Item A, Item B 두 개**가 존재하고 `similar` 또는 `derived_from`으로 연결된다. 검색도 두 개의 Item으로 보여 준다.
6. 한 Item이 모듈/이벤트/그룹 여러 곳에 표시돼도 동일 item_id 중복 표기만 제거하고 원본은 1개로 유지한다.
7. Item A를 기반으로 Item B 초안 생성 시 원본 Revision 링크는 유지하되, Item B의 원본 근거·검증 상태는 자동 확정되지 않는다.
8. 기술 판단이 `비정상 추정 → 정상 조건 확인`으로 바뀌면 이전 판단·새 판단·근거·판단자·시점을 모두 추적할 수 있다.
9. Contributor는 초안만 제출하고 Publisher는 사람 인증으로 직접 게시 가능하며, AI/Validator 서비스 신원으로 발행 API를 호출하면 거부된다.
10. Validator가 규칙 위반 100건을 생성해도 100개 정식 Item을 자동 생성하지 않는다. 선별된 후보만 사람 검토 후 발행할 수 있다.
11. 외부 Evidence 링크와 관리형 첨부를 모두 저장할 수 있고, 원본 권한 회수 시 비인가 사용자는 발췌·첨부·검색 힌트에서도 접근 불가다.
12. `stepprcess가 process start보다 먼저 발생` 검색은 오타/동의어 후보·Event 방향성을 구분하고 역방향 사례를 같은 결함으로 단정하지 않는다.
13. 동일 이름의 이벤트라도 SW별 발생 조건이 다르면 공통 의미 매핑이 자동 확정되지 않는다.
14. 카탈로그 **설비사·공정·모델·SW**를 순서에 상관없이 권한에 맞게 CRUD할 수 있고, 모델–공정 두 관계를 만들고도 모델 객체는 하나다. Import 업로드/미리보기는 원본 무변경, 외부 ID 충돌은 무음 합병하지 않고 검토 대상으로 표시한다.
15. Top View Viewer에서 특정 SW의 모듈을 선택해 해당 SW의 명세/Item으로 이동하고, 편집은 Studio에서만 이뤄진다.
16. Build 전용 입력 없이 `Model→SW 버전`의 명세/Item을 운영할 수 있다.
17. 앱을 플랫폼 호스트 없이 독립 실행·테스트할 수 있으며, SDK 공개 릴리스를 참조하고 사내 원본 없이 합성 데이터로 CI 통과한다.

---

## 13. 결정 로그, 미확정 사항, 개정 영향

### 13.1 사용자 선택 결과 (2026-10-29, 1–17번)

| 번호 | 확정된 방향 | 설계 반영 포인트 |
|---|---|---|
| 1 | **B. 모델/SW별 독립 Item + 유사 관계** | 동일 현상도 별도 Item, 교차 소유 M:N 폐기 |
| 2 | **B. SW별 독립 명세 + 모델 공통정보 추출** | 공통 기준선+Override 폐기; SW 원본 우선 |
| 3 | **C. 권한에 따라 승인 차등** | Contributor 검토, Publisher 직접 발행, AI 승인 필수 |
| 4 | **C. 수동 지식 + Validator 후보 병행** | Parser/Validator/허브 분리, Validator Finding은 후보일 뿐 |
| 5 | **C. 외부 참조 + 선택적 근거 파일 보관** | Evidence storage_mode·보안·원천 ACL |
| 6 | **C. 수동 등록 + Excel/CSV Import + 외부 연동** | 카탈로그·외부 ID 매핑·중복 검토 |
| 7 | **C. 기본 사내 공유 + 선택적 제한** | Model/SW/Item/Evidence 개별 접근 제어 |
| 8 | **B. Top View Viewer 통합, 편집 별도** | SW별 Viewer, Studio에서 편집 |
| 9 | **B. SW별 독립 Module/Event ID + 공통 개념 매핑** | 매핑 의미·검토 단계 분리 |
| 10 | **B. 상태·판단 변경 이력 분리** | ItemRevision vs ItemAssessmentHistory 분리 |
| 11 | **SW 버전까지만 관리, Build는 추후 검토** | 초기 Build 계층·필수 필드 제외 |
| 12 | **C. 핵심 명세 정형화 + 상세 문서 병행** | Event ID, Module, 필드, 조건, Event 관계 정형 관리 |
| 13 | **C. 모델 공통후보 자동 추출 + 사람 확정** | 원본 SW Revision provenance·재검토 경고 |
| 14 | **B. Model↔Process 다대다** | 분류 트리 복수 표시 / 단일 Model ID |
| 15 | **C. 표준 분류 + 사용자 그룹 + 저장된 뷰** | category/tag/manual_group/saved_view 분리 |
| 16 | **B. 기존 Item 기반 신규 작성 + 관계 링크** | `derived_from(source revision)` + 독립 Evidence/상태 |
| 17 | **B. Model 또는 SW에 Item 등록** | 단일 Owner 레벨 선택; Model 지식 하위 SW 자동 승계 금지 |

> **결정 근거:** 1~16번은 사용자의 개별 선택(11번은 별도 답변으로 `SW까지만` 지정). 17번은 사용자의 “나머지도 다 추천대로”에 따라 제시된 **추천 B**를 수용한 것으로 기록. 아직 질문하지 않은 선택지를 추가로 사용자 결정인 것처럼 표기하지 않는다.

### 13.2 설계에서 교정된 v0.2의 전제/충돌

1. **v0.2:** Item 하나를 여러 Model/SW의 소유로 공유 → **v0.3:** Model 또는 SW 1개만 Owner. 같은 현상은 독립 Item과 관계 링크로 표현.
2. **v0.2:** Model 공통 명세 + SW Override가 원본 → **v0.3:** SW별 Spec이 독립 원본. Model 공통정보는 자동 추출 후 사람 확정하는 파생 리비전.
3. **v0.2:** `software_release`의 Build 정체성까지 필수 고려 → **v0.3:** 초기 `SW 버전`만 필수, Build 후속 설계.
4. **v0.2:** 로그 현황/검증 수치를 Parser 책임처럼 혼재할 여지 → **v0.3:** Parser=변환, Validator=규칙 검증, Hub=휴리스틱 지식. Validator Finding을 Review Candidate로 연결.
5. **v0.2:** AI 검토에 무게를 둔 초안 UI → **v0.3:** 일반 작성자·AI·Validator를 통합 검토하되, 발행권자의 직접 게시는 허용.
6. **v0.2:** 모델/SW 스코프 다대다/중복 검색 통합 가정 → **v0.3:** 소유 단일, subject/group N:M, 교차 SW Item 병합 금지. 검색은 같은 ID의 기술적 중복만 제거.
7. **v0.2:** Top View Viewer는 임시 링크 수준도 완료 가능해 보이는 표현 → **v0.3:** 최종 Viewer 내장 확정, Studio가 편집 책임. 초기 링크는 임시.
8. **v0.2:** 확정 여부가 섞인 몇몇 Candidate 표기 → **v0.3:** 사용자 정책과 기술 구현 후보를 명확히 분리.

### 13.3 여전히 구현 전 확정할 세부 사항 (사용자가 일괄 승인했다고 주장하지 않음)

- **실행 명칭/저장소 URL/도메인/배포 환경:** 실제 사용처와 내부 도메인 등 운영 선택.
- **인증·RBAC 상세:** SSO/독립 세션, Contributor/Publisher/Reviewer의 역할 매트릭스, 조직/객체 ACL 상속·예외, 자기 승인 금지 여부.
- **카탈로그 기준정보의 권위 원본:** 수동+Import+외부 연결은 지원 확정이나, 어느 외부 시스템을 official source로 삼는지는 미정. 매핑 충돌 처리 정책, 코드 유일성/정규화, 비활성화 정책, Import 크기·보관·일부 성공 처리, `catalog:*` 권한 규칙 필요. §15의 구체 규칙은 검증 전 후보다.
- **정체성/버전 규칙:** Model·SW·Event·Module·TopView Mapping의 ID 정규화, SW 버전 문자열 중복/별칭, Build를 나중에 추가할 마이그레이션 전략.
- **Evidence 저장소·보안:** 선택적 첨부 저장 위치, 허용 자료 등급, 실제 파일 유지/삭제기간, 원본 시스템 연결·원천 ACL 연동.
- **Validator 인터페이스:** Run/Rule/Finding 식별자, 데이터 스키마, 후보 선별 기준·재시도/멱등성. 별도 Validator 프로그램 자체 설계/구현은 본 문서 범위 밖.
- **AI 인증/연결:** 사내 허용 LLM의 네트워크·서비스 토큰·발급/회수, Draft/Concept/Spec 제안 권한의 세부 경계.
- **Top View 실제 통합:** Viewer API 버전, Layout/Spec Mapping 계약, 독립 빌드·Studio 딥링크, Stage별 탑재 일정.
- **검색 품질/성능:** 실제 약어·오타·역방향 데이터, 권한 복잡성, 한국어 처리를 포함한 수용 테스트와 목표치 측정.
- **기술 스택 물리 확정:** Fastify/PostgreSQL/API 라우트·ORM·인덱스·첨부 Object Storage, AP Host Adapter의 제공 계약.

### 13.4 변경 관리 규칙

- 새 대화에서 해당 정책을 바꾼다면 결정 번호, 변경 이유, 관련 도메인/API/DB/테스트 영향을 함께 개정한다.
- **제품 정책 확정 = 구현 완료가 아니다.** 각 Phase 체크박스·API 경로는 개발/검증 후에만 완료 표시.
- **UI 구현 완료 역시 캡처 검수 전에는 확정 불가:** 특정 SDK 버전의 실제 컴포넌트·토큰·화면 스크린샷과 예외 상태가 §16–17 수용 기준을 만족한 후에만 완료 표시.
- v0.2 문서의 공통-Override, 복수 Owner, Build 필수 가정은 구현 근거로 사용하지 않고 **본 v0.4 기준선을 우선**한다.

---

## 14. 관련 문서 및 시스템 경계

### 프로젝트 설계 참고

- 이전 `log_knowledge_hub_design_summary.md`와 HTML 프로토타입은 **초기 IA/UI 검토 자료**. v0.3은 v0.2의 구현 후보를 계승하되 1–17번 사용자 결정을 반영해 **v0.2 설계 기준선을 대체**한다.
- 설비 Top View 관련: [equipment-visualization](https://github.com/hjung3113/equipment-visualization) — 독립 실행·플랫폼 어댑터 분리, semantic layout/증거 수준 관리 참고.
- 로그 개발 Lifecycle 관련: `standard-log-lifecycle` — Alpha/Beta·Validation Round·Defect/Evidence/Retest의 **미래 통합 대상**. 당장 본 제품과 동일하게 구현하지 않는다.
- 플랫폼 UI/SDK: [analytics-platform](https://github.com/hjung3113/analytics-platform) — `DESIGN.md`, `docs/contract/*`, `docs/adr/0095-dual-backend-fastify-core-fastapi-analytics.md`.
- 플랫폼 공통 계층 탐색 이슈: [analytics-platform #1108](https://github.com/hjung3113/analytics-platform/issues/1108). 기존 System/Group/Menu 유지 및 동적 객체 탐색 지원은 플랫폼 책임.
- 플랫폼 쓰기 계약: [ADR-0054](https://github.com/hjung3113/analytics-platform/blob/main/docs/adr/0054-write-port-declared-actions-idempotency-version.md) — 멱등성·버전 충돌·감사의 참고. 독립 웹에 해당 코드를 직접 가져오는 결정은 아님.

### 문서 사용 방법

- 이 **v0.4 파일**을 **`로그지식허브` ChatGPT 프로젝트의 소스**에 추가하여 이후 설계·개발 논의의 우선 기준선으로 사용한다. Library 저장이나 채팅 첨부만으로 프로젝트 소스에 자동 반영되는 것은 아니다.
- 설계가 확정될 때 해당 절에 `Decided` 표기, 결정자/시각/근거, 변경 사항을 업데이트한다. 미구현을 구현 완료로 바꾸지 않는다.
- 사내 자료/구체 업체·설비 SW·기밀 로그를 프로젝트 소스에 추가하기 전에 보안·데이터 공유 정책을 확인한다.

---

**한 줄 원칙:** SW별 독립 명세와 Model/SW 단일 소유 Item을 원본으로 하여, Parser/Validator의 기계적 검증과 사람의 휴리스틱 지식을 구분하고, **증거·이력·유사 관계를 기반으로 축적·재사용**하는 독립 지식 허브를 구축한다. AI는 초안만, 사람은 권한별 검토·발행을 책임지며, Top View는 Viewer/Studio 역할을 분리한다.

---

## 15. 카탈로그 관리 상세 설계 — Phase 0 필수

> **상태:** 설비사·공정·모델·SW를 수동 등록/파일 Import/외부 연동으로 관리하는 **기능 방향은 사용자 확정(결정 6·14)**. 이 절의 입력 필드, UI 배치, URL, API·제약조건은 그 결정을 구현하기 위한 **권장 상세 설계(Candidate)**이다. 사내 공식 모델 코드 규칙·실제 ID 원천·권한 매트릭스는 개발 전에 확인한다.

### 15.1 책임과 화면 범위

`모델 탐색`은 읽기/검색 화면이고 `카탈로그 관리`는 **등록·수정·비활성화·연결·Import 충돌 해결**을 수행하는 권한자 전용 공간이다. 둘은 같은 `Vendor/Process/Model/SW` 원본을 읽는다. 관리자에게만 편집 제어를 보여 주되, 권한 검증은 반드시 서버에서 한다.

```text
카탈로그 관리  /admin/catalog                           (권장 라우트; 실제 계약 미확정)
├─ 설비사     /admin/catalog/vendors                  목록·신규·수정·비활성화
├─ 공정       /admin/catalog/processes                독립 분류 사전·신규·수정·비활성화
├─ 모델       /admin/catalog/models                   설비사 1개 + 공정 여러 개 매핑
├─ SW         /admin/catalog/software                 모델 아래 SW 버전 등록·수정
├─ 일괄 등록  /admin/catalog/imports                  파일 → 매핑 → 검증 → 충돌 해결 → 적용
└─ 외부 연동  /admin/catalog/sources                  외부 ID·매핑·동기화 차이·승인 이력
```

- 내비게이션에서 읽기 중심 `모델 탐색`과 편집 중심 `카탈로그 관리`를 **분리**한다. 권한 없는 사용자에게 등록 CTA나 Import 버튼을 보여주지 않는다.
- 카탈로그 등록 권한(`catalog:create`, `catalog:edit`, `catalog:deactivate`, `catalog:import`, `catalog:reconcile`)은 **Knowledge Item의 Contributor/Publisher 권한과 별개**. Publisher라고 자동으로 모델 마스터 관리자가 되지 않는다.
- 일반적인 사용자 작업은 `카탈로그 관리 → 목록 → 신규 등록/행 선택 → 우측 상세 패널`이다. 모델·SW처럼 관련 필드가 많은 경우에는 **독립 전체 페이지 편집으로 확장**할 수 있지만 동일 입력 검증 규칙을 사용한다.
- 초기 필수 범위: 4개 엔터티의 조회/신규/수정/비활성화, 모델–공정 M:N 관리, CSV/XLSX Import 검토·적용·결과 확인. **외부 시스템과의 실시간 동기화 실행은 후속**이어도, 외부 ID 매핑 구조와 화면 진입/상태는 설계한다.

### 15.2 객체별 등록·수정 필드와 입력 검증

실제 기업 코드·문자 허용 범위는 사내 기준정보 소유자와 결정한다. 아래 `필수`는 **권장 폼 초기값**이며 승인된 외부 공식 키 정책을 대체하지 않는다. 안정 ID(UUID/ULID 등 형식 미정)는 서버가 발급하고 사용자가 편집할 수 없다.

| 객체 | 권장 필수 입력 | 선택 입력 | 중복·무결성 기준(후보) | 독립성·표시 규칙 |
|---|---|---|---|---|
| **설비사 Vendor** | 설비사 코드(`vendor_code`), 표시명 | 영문명, 별칭, 설명, 활성 여부, 외부 ID | 정규화 코드 전역 유일. 표시명은 동일 가능성 경고·별칭 검토 | 업체명 변경돼도 `vendor_id` 유지 |
| **공정 Process** | 공정 코드(`process_code`), 공정명 | 설명, 정렬순서, 별칭, 활성 여부 | 정규화 코드 전역 유일, 이름 유사성은 후보 경고 | **설비사의 하위 소유 객체가 아님**. 어떤 Vendor/Model에도 재사용 |
| **모델 Model** | 설비사 1개, 모델 코드(`model_code`), 표시명 | 복수 공정 ID, 별칭, 설명, 특성 메모, 활성 여부, 자료 링크 | 같은 설비사 안에서 정규화 모델 코드 유일(후보). 공정 0개면 `미분류`로 표시 후 분류 권장 | `model_id` 하나. 여러 공정에 나타나도 중복 레코드 생성 안 함 |
| **SW 버전 SoftwareVersion** | 소속 모델 1개, SW 버전 문자열(`version_key`) | 표기명, 설명, 변경 요약, 상태, 명세 참조 링크 | 같은 모델 안에서 정규화 버전 키 중복 검사. 실재 Build의 구분 필요 시 현재 중복/충돌로 보이게 하고 자동 병합 금지 | 별도 `software_id`; **Build 입력/하위 목록 없음** |

**입력 세부 규칙:**

1. 코드/버전 입력은 저장 전에 공백 트림, 사내 허용 정규화와 원문 표시값을 구분한다. **자동 소문자화·하이픈 삭제 등 파괴적인 정규화는 기준이 검증되기 전 금지**한다.
2. 등록 폼은 `필수 필드만 먼저 표시 → 선택 필드 접기`로 구성하되, 편집 화면은 입력값을 모두 보여 준다. 미입력과 빈 문자열을 서버 계약에 따라 구분한다.
3. 모델의 공정은 **여러 개 선택 가능**하고 태그처럼 보이되, `모델당 대표 공정`을 강제하지 않는다. 공정이 하나도 없으면 `미분류` 배지를 보여 주고 탐색 가능한 `미분류` 필터를 둔다.
4. 설비사/모델/SW의 코드·버전 중복은 **쓰기 전 서버 검사**가 최종 권위. 프론트 사전 중복 알림은 보조일 뿐 동시 생성 충돌을 막지 못한다.
5. 기존 모델이 SW/Item을 가지면 설비사 변경은 단순 폼 저장이 아니라 **영향 경고 + 별도 승인되는 변경 작업(후보)**으로 제한한다. 모델을 삭제 후 재등록시키지 않는다.
6. 외부 공식 ID가 있는 항목은 수동 수정권·원천 우선순위가 다를 수 있으므로 `관리 원천`, `마지막 동기화`, `차이/충돌`을 속성으로 표시한다. 권위 소유자가 확정되지 않았을 때는 `미지정`으로 표시한다.
7. 정렬·조회용 표시명과 안정 ID를 분리한다. 브레드크럼/링크는 표시명을 보여 주고 실제 URL/관계는 ID로 유지한다.
8. 비활성화는 일반 목록에서 기본 제외할 수 있으나, 기존 Item·Evidence·Import 감사·SW 링크는 보존한다. **연관 레코드 일괄 삭제 금지**. 이미 참조된 공정/설비사/모델은 삭제 대신 비활성화가 기본이다.

### 15.3 등록 작업 흐름 및 화면 상태

**설비사 등록:** 관리 메뉴 `설비사` → `+ 설비사 등록` → 오른쪽 생성 패널(`코드`, `이름`, 추가 정보) → 서버 중복 검사 → `등록` → 생성 행 선택 상태 유지 + 저장 성공 토스트 + 해당 설비사 상세 정보 노출. 실패하면 편집 내용과 스크롤/포커스 유지.

**공정 등록:** `공정` 목록은 설비사와 무관한 사전이다. `+ 공정 등록` → 코드·표시명 → 저장. 공정을 먼저 등록하지 않아도 모델 등록 화면에서 `공정 검색 → 결과 없음 → 공정 관리 권한이 있을 때만 새 공정 등록` 링크를 제공할 수 있다(후보). 권한 없으면 요청 경로만 표시.

**모델 등록:** `모델` 목록 → `+ 모델 등록` → 설비사 필수 단일 선택 → 모델 코드·표시명 → 공정 다중 선택(선택 칩, 검색) → 설명/별칭 선택 → `등록`. 저장 후 새 모델의 상세 페이지에 `SW 버전 0개` Empty State와 **`+ SW 버전 등록`** 후속 동작을 보여 준다. 모델과 SW를 하나의 거대한 등록 마법사로 합치지 않는다.

**SW 등록:** 모델 상세의 `SW 버전` 섹션 또는 카탈로그 `SW` 목록 → `+ SW 버전 등록` → 부모 모델 사전 선택(모델 상세에서 시작하면 고정 표시) → 버전 문자열 → 설명/명세 참조 → `등록`. 등록 직후 SW 프로파일은 **모듈·이벤트 미등록**으로 표시한다. 자동으로 이전 SW 명세를 복사하거나 모델 공통정보를 확정하지 않는다. 별도 **`명세 등록/Import`** 명시 동작을 제공한다.

**공통 폼 동작:**

- 패널 제목 = `설비사 등록` / `공정 수정` 등 실제 작업명. 헤더에는 닫기, 본문에는 필드, 하단 고정 Footer에는 `취소`와 **유일한 Primary** `등록`/`변경 저장`.
- `Tab` 순서: 제목 → 첫 입력 → 다음 입력 → 보조 링크 → 취소 → 등록. 첫 입력에 포커스. Esc/닫기 시 변경 사항이 있으면 **미저장 변경 확인**.
- 검증 실패는 해당 필드 바로 아래 오류 텍스트+`aria-describedby`; 페이지 최상단 단일 오류만 내고 필드를 찾게 하지 않는다. 제출 실패 시 입력값을 보존한다.
- 삭제 확인은 실제 삭제가 허용된 경우만 별도 `Dialog`; 연결 항목이 있으면 비활성화 옵션과 영향 수치(접근 권한 범위 내) 제공. 기본값은 비파괴적.
- 저장 진행 중 버튼 `저장 중…`/중복 제출 방지; 실패 시 서버 `error_code`/재시도 안내, 성공 후 목록 데이터·선택 행 갱신. `expectedVersion`으로 **동시 수정 충돌**을 감지하여 병합 비교/새로고침 안내.
- 등록 도중 `모델 탐색`으로 이동해도 데이터가 등록되지 않은 초안을 게시/승인된 것으로 보이지 않는다.

### 15.4 CSV/XLSX 일괄 등록 — 반드시 5단계 화면

단계는 `파일 선택 → 열 매핑 → 검증 결과 → 충돌 해결 → 적용 결과`이다. **업로드 = DB 확정 반영이 아니다.** 모든 단계의 상단에 `파일명`, `시트`, `원천`, `검사 시각`, `총 행 수`, 처리 상태를 표시한다.

| 단계 | 화면 구성 | 유효성·오류·행동 |
|---|---|---|
| **1. 파일 선택** | CSV/XLSX 업로드 영역(클릭/드래그), 허용 형식 안내, `템플릿 받기`, 관리 객체 선택(설비사·공정·모델·SW) | 클라이언트 검사는 보조; 서버는 MIME·확장자·크기·바이러스·인코딩·파일 해시 검사. 파일은 격리/임시 보관. 안전 기준은 사내 정책 확정 필요 |
| **2. 열 매핑** | 좌측 원본 파일 열·샘플 3~5행, 우측 대상 필드 드롭다운, 필수 매핑 체크, 파일 시트 선택 | 동일 원본 열을 서로 다른 필수 필드에 무음 중복 매핑 금지. 모델은 설비사 코드/ID, SW는 모델+버전의 참조를 필수 연결 |
| **3. 검증 결과** | 요약 `신규 후보 / 기존 일치 / 갱신 후보 / 충돌 / 오류`, 행별 가상화 표, 오류 필터, 다운로드 가능한 검증 리포트 | 필수 누락, 중복 키, 참조 부모 없음, 권한 없음, 버전 충돌을 **행·열·원인**으로 제시. 이 시점에는 저장 건수 0임을 명확히 표시 |
| **4. 충돌 해결** | 충돌 행 선택 → 원본과 기존 DB 값을 좌우 비교, `건너뛰기`, `기존 항목에 매핑`, `신규 생성(조건 충족 시)` 등 명시 액션 | 외부 원천의 덮어쓰기는 소유 정책이 확인되기 전 금지. 자동 병합·자동 삭제·일괄 덮어쓰기 금지. 관련 부모가 미확정이면 자식 적용 막음 |
| **5. 적용 결과** | 반영 성공/기존 유지/건너뜀/실패 수, 행별 결과·실패 사유·Import ID·재시도 대상 다운로드 | 승인 후에만 DB 변경; 재시도는 Import Job/행 멱등 키로 중복 생성 방지. 부분 반영 시 완료 범위와 남은 범위를 분명히 표시 |

**Import 형식 예(가상, 실제 사내 코드 아님):**

```csv
vendor_code,model_code,model_name,process_codes
VENDOR_DEMO,MODEL_X100,Demo Model X100,ETCH|CLEAN
```

- Import 대상별 최소 열은 `Vendor: vendor_code,vendor_name`, `Process: process_code,process_name`, `Model: vendor_code,model_code,model_name,(선택)process_codes`, `Software: vendor_code,model_code,version_key`를 **제안**한다. 다중 공정 구분자는 템플릿에서 고정 정의하고 사용자가 알 수 있도록 표시한다.
- 순서 의존성: 같은 배치에 Vendor/Process/Model/SW가 함께 있을 경우 **부모 참조 검증 → 적용 계획 미리보기 → 승인된 행만 순서대로 반영**. 참조가 유효하지 않은 자식 행은 적재하지 않는다.
- 원천 Excel의 수식은 **실행하지 않고 값으로 처리**. 예상하지 않은 시트·공식·병합셀·보호범위는 명확한 실패/검토 상태로 표시한다. CSV 수식 주입에 대비해 검증 리포트 Export도 escape한다.
- `전체 적용` 버튼은 오류 0건과는 무관하게 **사용자가 승인한 적용 계획만** 실행한다. 임포트 시작 전 `신규 N / 갱신 M / 건너뛰기 K / 미해결 충돌 C`를 확인한다. 미해결 충돌 행은 자동 스킵하거나 적용 차단하되 정책을 명시한다(권장: 미해결 행은 적용 제외, 결과에 남김).
- 대규모 파일의 서버 적용은 상태 조회 가능한 Job으로 처리. 미리보기·적용 상태를 혼동하지 않고 `pending/validating/review_required/applying/completed/partial_failure/failed` 등으로 분리한다(정확 ENUM 후보).

### 15.5 외부 시스템 연동 및 변경 비교

초기에는 원본 ID 매핑과 수동 Import로 시작하고, 외부 연동이 도입되면 `외부 시스템 → staging/snapshot → 차이 비교 → 승인 → 반영` 경계를 사용한다.

- 비교 항목: `내부 객체`, `외부 원천/키`, `기존 값`, `유입 값`, `마지막 동기화`, `충돌 원인`, `권한`, `승인자`.
- 외부 원본에서 이름/분류가 변경되었다고 **Model/SW 안정 ID, 판단 이력, Item 소유권을 자동 변경하지 않는다**.
- 외부 원본이 삭제됐다고 내부 Knowledge Item이나 Evidence를 연쇄 삭제하지 않는다. 관계 상태를 `원천에서 누락`으로 표시하고 담당자의 처리 결정을 받는다.
- 양쪽 원본이 다를 때 우선순위는 아직 미정. UI는 차이를 보고 승인/보류/무시할 수 있어야 한다. **소유자 결정 없이 조용히 한쪽 값으로 덮어쓰지 않는다**.
- 최초 연동 때 `기존 항목과 매핑`, `새 항목 생성`, `충돌 보류`를 분리하고 매핑 결과와 변경자는 감사 기록으로 남긴다.

### 15.6 관리 API 및 트랜잭션 계약 (후보)

| 객체 | 읽기 | 쓰기(서버 권한 검사 필수) | 특수 동작 |
|---|---|---|---|
| Vendor | `GET /api/v1/catalog/vendors`, `GET /vendors/{id}` | `POST /vendors`, `PATCH /vendors/{id}` | `POST /vendors/{id}/deactivate` |
| Process | `GET /api/v1/catalog/processes`, `GET /processes/{id}` | `POST /processes`, `PATCH /processes/{id}` | `POST /processes/{id}/deactivate` |
| Model | `GET /api/v1/catalog/models`, `GET /models/{id}` | `POST /models`, `PATCH /models/{id}` | `PUT /models/{id}/processes`, `POST /models/{id}/deactivate` |
| SW | `GET /api/v1/catalog/software`, `GET /software/{id}` | `POST /software`, `PATCH /software/{id}` | `POST /software/{id}/deactivate` |
| Import | `GET /api/v1/catalog/imports`, `GET /imports/{jobId}` | `POST /imports`, `POST /imports/{jobId}/apply` | `POST /imports/{jobId}/validate`, `PATCH /imports/{jobId}/resolutions` |
| 외부 ID | `GET /api/v1/catalog/identity-mappings` | `POST /api/v1/catalog/identity-mappings` | `POST /identity-mappings/{id}/review` |

> 위 표의 `/vendors`, `/models` 등 축약 경로는 모두 **`/api/v1/catalog/` 하위**로 읽는다. HTTP Verb/endpoint는 계약 초안이며 실제 SDK/API 아키텍처 심사 후 확정한다.

- 목록 API는 `q`, `vendorId`, `processIds[]`, `status`, `sort`, `cursor` 등 **명시적 필터**를 지원. 같은 모델이 공정 둘에 매핑되어도 **목록 행과 결과 건수는 모델 ID 기준 1건**이다.
- Create/Patch는 예상 Revision, Actor 권한, 유효한 참조, 코드 충돌, 감사 기록을 검증한다. 반환은 `id`, `revision`, `updatedAt`, `source`, `validationWarnings`를 포함할 수 있다.
- 중복/동시 충돌: `409 Conflict` + 중복 후보 또는 `expectedVersion` mismatch 정보를 서버가 제공(민감 객체는 권한이 허용한 범위만). 인증 실패/권한 없음/검증 오류/원천 서비스 실패는 별도로 처리.
- `deactivate`는 의미상 soft-delete로 설계. 참조 자료 존재 시 경고·영향 확인을 거치며 데이터는 남긴다. 실제 삭제 API는 초기 범위에서 노출하지 않는다.
- 배치 변경 시 부모·자식 참조 무결성, 개별 행 멱등성, 재시도 가능한 오류 리포트를 보장한다. DB commit 정책(일괄 트랜잭션 vs 행 단위)은 파일 규모·원천 정책 테스트로 확정; **부분 성공을 전체 성공으로 표시하지 않는다**.

### 15.7 카탈로그 전용 인수 기준

- [ ] 설비사→모델→SW를 차례로 새로 등록하고 목록/상세/탐색에서 같은 안정 ID로 조회된다.
- [ ] 공정은 Vendor 없이 독립 생성되며, 모델 한 개에 Etch/Clean 2개를 연결해도 모델 목록 결과는 **1행**이다.
- [ ] 모델을 신규 등록한 뒤 `SW 버전 없음`과 `+ SW 버전 등록`이 보인다. SW를 등록해도 Spec/Top View/검증 결과를 자동 완료 표시하지 않는다.
- [ ] 중복 코드, 존재하지 않는 부모 ID, 변경 충돌, 비활성 객체 선택을 각각 적절한 위치에 오류로 표시한다.
- [ ] Item이 연결된 모델을 비활성화해도 Item·판단 이력은 유지되고 접근 정책에 맞게 탐색 가능하다.
- [ ] CSV/XLSX Import의 업로드/미리보기 단계에 실제 데이터 변경이 없고, 미해결 충돌을 자동 덮어쓰지 않는다.
- [ ] Import 적용 후 생성/업데이트/스킵/실패 수를 재현할 수 있고 재시도 시 Item/Model/SW가 중복 생성되지 않는다.
- [ ] 외부 ID 충돌을 매핑 담당자가 검토하기 전 내부 안정 ID를 임의 결합하지 않는다.
- [ ] 저장/정합성 실패 후 폼 입력, 파일 매핑, 충돌 해결 선택이 사라지지 않는다.
- [ ] 카탈로그 조회 권한만 있는 사용자가 POST/PATCH/deactivate/Import API를 직접 호출하면 거부된다.

---

## 16. UI/UX 상세 디자인 사양 — 화면 구현의 기준선

> **구분:** 이 절의 IA·상태 의미·데이터 소유/승인 정책은 앞 장 사용자 확정 내용에 의존한다. 픽셀 수치·패널 배치·우선순위·문구·반응형 처리는 **구현 품질을 위한 권장 UI 설계안(Candidate)**이며 실사용 피드백과 배포된 SDK 버전으로 검증 후 확정한다. 그래픽 레퍼런스가 없더라도 임의의 UI를 만들지 않도록 **구조·크기·문구·상태·상호작용을 명시**한다.

### 16.1 디자인 근거·우선순위와 화면 성격

본 설계의 UI 시각 근거는 2026-10-30 확인한 `hjung3113/analytics-platform`의 다음 파일이다.

1. [`DESIGN.md`](https://github.com/hjung3113/analytics-platform/blob/main/DESIGN.md): Professional / Technical / Calm / Dense / Precise, 테이블·타이포/확장 토큰.
2. [`packages/sdk/ui/src/styles/tokens.css`](https://github.com/hjung3113/analytics-platform/blob/main/packages/sdk/ui/src/styles/tokens.css): 밝은 표면, 텍스트·선택·간격·패널 치수의 실제 원본.
3. [`docs/contract/platform-ui-contract.md`](https://github.com/hjung3113/analytics-platform/blob/main/docs/contract/platform-ui-contract.md), [`docs/contract/components.md`](https://github.com/hjung3113/analytics-platform/blob/main/docs/contract/components.md): 플랫폼 UI 규칙·공통 컴포넌트/상태·Table 계약.
4. [`docs/wireframes/app-shell.md`](https://github.com/hjung3113/analytics-platform/blob/main/docs/wireframes/app-shell.md): 플랫폼 호스트의 52px 레일 / 240px 사이드바 / 50px 페이지 머리·상세 슬롯 배치.
5. [`docs/design/features/component-inventory.md`](https://github.com/hjung3113/analytics-platform/blob/main/docs/design/features/component-inventory.md): 설계명과 **실제 구현/export의 차이**. 컴포넌트명만 보고 없는 API를 가정하면 안 된다.

**우선순위:** 실제 소비 SDK 릴리스의 공개 export·토큰 > 플랫폼 Decided 계약 > 이 문서의 후보 화면 배치. 이 문서 자체를 근거로 `@ap/ui` 내부 경로를 직접 import하거나 미구현 컴포넌트가 존재한다고 주장하지 않는다. 독립 웹 화면의 도메인 고유 부분만 `packages/ui` 또는 `features`에 추가한다.

**화면 성격:** 운영·기술 지식 관리 도구. 정보의 찾기·비교·근거 확인·정확한 변경이 핵심이다. 화려한 마케팅 대시보드, 큰 일러스트, 무의미한 KPI 카드, 다중 그라데이션, 과격한 선택 애니메이션보다 **목록·작업·상세·근거의 명확성**을 우선한다.

### 16.2 전체 프레임 / 해상도 / 계층

**독립 웹(Standalone):** 왼쪽 제품 내비게이션 **240px** + 오른쪽 Main. 플랫폼의 `52px` 전역 업무 시스템 레일은 독립 앱에 불필요하므로 **복제하지 않는다**. Main 상단에 **50px 높이의 페이지 머리 1개**만 둔다. 플랫폼 Host로 탑재할 때는 Host가 전역 레일·사이드바·Page Header를 제공하므로 **독립 웹의 Shell은 제거/Host Adapter로 대체**한다. 두 셸을 중첩하지 않는다.

| 영역 | 데스크톱 후보 치수 | 동작 |
|---|---|---|
| 제품 내비게이션 | 240px 펼침, 56px 접힘 | 현재 섹션·선택 경로·권한 반영. TopView/검색/관리 메뉴 구분 |
| 페이지 머리 | 높이 50px | breadcrumb + 페이지 제목 + 우측 한 개의 주요 동작. 별도 전역 상단바 반복 금지 |
| 본문 외곽 여백 | 좌우 24px / 상하 16~24px | 밀도 조정은 SDK spacing scale(4/8/12/16/24/32)만 이용 |
| 목록 도구줄 | 48~56px 후보 | 검색, 필터, 보기, 건수. 주요 등록 CTA는 헤더 우측 |
| 테이블 헤더 / 행 | 헤더 최소 32px, 본문 최소 32px; 카탈로그 기본 행 40px 권장 | 플랫폼 32px minimum 계약을 지키면서 읽기 쉬운 기본 40px |
| 필드 높이 | SDK `Input`/`Select` 기본 규칙(예: 40px; SDK 버전 확인) | 화면별 임의 height override 금지 |
| 우측 상세 패널 | 기본 440px, 최소 360px, 최대 520px | 목록을 가린 대형 modal 금지. 폭이 부족하면 순차 상세/overlay |
| 목록 본문 최소 가용폭 | 약 600px 권장 | 상세가 열려도 목록의 주요 열·탭 동작 가능; 부족하면 상세 overlay |
| 상태 배지 | SDK 규칙/약 20px 기준 | 색 + 텍스트. 색상만으로 의미 전달 금지 |

- **1440×900:** 사이드바 240, Main 1200. 콘텐츠 좌우 24px 여백을 뺀 1152px에 도구줄·테이블. 우측 상세 440을 열면 목록과 상세 각각 스크롤하며 화면은 유지.
- **1280×800:** 사이드바 240, Main 1040. 밀도 때문에 의미 없는 카드를 추가하지 않는다. 부족한 열은 중요도순 노출/수평 스크롤을 명시하며, `상세`는 폭 체크 후 440/overlay 중 택일.
- **1024×768:** 사이드바 기본 접힘(56px), 중요 열 우선. 우측 상세는 전체 콘텐츠를 지나치게 축소하지 않도록 overlay 또는 별도 상세 경로로 표시.
- **768~1023:** 구조는 1열 목록 + 상세 overlay(읽기 중심), 검색·필터는 두 줄/접기로 수용. 모바일 지원은 초기 목표 범위를 실제 사용자·기기 요구로 확정.
- **<768:** 최소한 읽기·검색·링크 접근성은 유지하고 테이블은 카드 남발 대신 **객체 행의 핵심 필드 2~3개**로 축소. Import 5단계의 정교한 편집은 PC 권장을 표시할 수 있으나, 오류로 빈 화면을 출력하지 않는다.

**내비게이션 그룹(보이는 문구 권장):**

```text
Log Knowledge Hub
────────────────────────
일반
  홈
  모델 탐색
  전체 기술 항목
  통합 검색
업무
  검토함                      [검토 대기 N]   # 권한 있는 사용자만
관리                             # catalog:view 또는 관리 권한
  카탈로그 관리
      설비사 / 공정 / 모델 / SW
      일괄 등록 / 외부 연동
────────────────────────
계정/설정                      # 실제 제공 기능만
```

- 관리 항목이 일반 사용자에게 필요하지 않다면 관리 그룹을 숨긴다. 권한이 없는 화면으로 `관리자` 메뉴만 보여 주고 계속 `403`으로 보내지 않는다.
- 왼쪽 전체 트리에 모델 수천 개를 늘어놓지 않는다. 모델은 `모델 탐색` 페이지의 필터/검색/가상화 목록에서 찾는다.
- 내비게이션 선택 상태는 좌측 얇은 강조선 + 옅은 표면 차이 + 텍스트 굵기로 표시. **강한 전체 배경색 반전·화면 전체 어둡게 처리 금지**.

### 16.3 시각 토큰·타이포·밀도 매핑

| 의미 | 반드시 소비할 SDK semantic token / 역할 | 적용 예 |
|---|---|---|
| 기본 배경 | `--surface-canvas` | 앱 주 콘텐츠 바탕 |
| 목록·카드 | `--surface-list`, `--surface-card`, `--surface-detail` | 테이블/상세 패널. 과도한 다중 중첩 카드 금지 |
| 보조 배경 | `--surface-popover`, `--surface-card-elevated`, `--surface-sunken` | 열 머리/미리보기/선택적 보조 영역 |
| 기본/보조/약한 텍스트 | `--text-primary`, `--text-secondary`, `--text-muted` | 제목/설명/메타 정보 |
| 경계·포커스 | `--border-subtle`, `--border-strong`, `--focus-ring` | 폼·행·카드 윤곽, 키보드 포커스 |
| 선택/호버 | `--surface-row-selected`, `--surface-row-hover`, `--border-selected` | 목록의 한 선택행/탭 강조 |
| 주 동작 | `--accent-primary` 또는 SDK Button primary | 등록·저장, 활성 탭, 선택 표식 |
| 성공/경고/위험 | `--accent-success`, `--accent-warn`, `--accent-danger`와 SDK 대응 **텍스트 label** | Import 상태, 검토 대기, 검증 실패. 작은 텍스트를 원색으로만 그리지 않음 |

- Raw palette(`--color-*`, 고정 `#hex`)를 화면 컴포넌트에 직접 쓰지 않는다. semantic token을 `rgb(var(--token) / alpha)` 형식으로 소비하되 **실제 빌드의 CSS export 규칙을 확인**한다.
- 제목: 플랫폼 `t-page-title` 기준 **24px / 32px / semibold**. 섹션 제목: **18px / 28px / semibold**. 목록 열 제목: **12px / 600**. 본문: **13~14px 후보**, 1.4~1.5 line-height. 숫자·ID·이벤트명은 tabular/mono로 정렬, 긴 ID는 복사 동작과 Tooltip 제공.
- `카탈로그 관리`, `SW 프로파일`처럼 업무 흐름의 헤더는 **문구가 모호한 아이콘만 남기지 않는다**. 메인 CTA는 텍스트 `+ 모델 등록`, 보조 동작은 작고 중립적인 버튼.
- 간격의 기준: 입력 라벨-필드 4~8px, 연관 필드 간 16px, 섹션 간 24px, 영역 간 24~32px. 카드마다 임의 `20px/22px/26px`를 쓰지 않는다.
- 테이블 셀: 수치 우측 정렬, 코드·텍스트 좌측 정렬, 상태는 좌측에 표식+텍스트. `전체 선택`은 대량 작업이 있을 때만, 메뉴 `⋯`에는 비활성화 등 드문 작업만.
- 시각적 강조 강도: **동작 대상/선택 행만** 선택 윤곽(1~2px) + 옅은 배경 차이로 강조. 비선택 영역을 50~80% 어둡게 하거나 흐림 처리하지 않는다. 다른 데이터의 텍스트 대비를 강제로 낮추지 않는다.
- 화면 모션: SDK `--motion-duration-fast/base/slow`(150/200/300ms)와 `prefers-reduced-motion` 준수. **대형 zoom, pulse, glow, 불필요한 shimmer loop 금지**. 데이터 선택은 스크롤 위치를 옮기지 않고 선택 배지만 변경하는 것이 기본.

### 16.4 공통 UI 패턴 (모든 화면에 적용)

**리스트 + 상세:** 행 선택은 현재 필터/스크롤을 유지하면서 우측 상세 패널을 연다. 새 탭/URL 직접 접근은 독립 상세 페이지 또는 같은 ID를 가진 상세 상태를 복원한다. 패널을 닫으면 원래 선택 행으로 포커스를 반환한다. 브라우저 뒤로가기로 목록 필터/탐색을 잃지 않는다.

**검색·필터:** 검색어는 debounce(권장 약 250~300ms). 텍스트 입력의 IME 조합 중 Enter는 제출하지 않는다. `필터 초기화`는 검색 전체 재초기화로 오인되지 않게 적용된 필터만 제거한다. 활성 필터 칩은 `공정: ETCH`, `상태: 활성`처럼 라벨을 포함한다.

**버튼 계층:** 화면 상단 Primary는 **최대 1개**(`+ 모델 등록`). `Import`, `Export`, `새로고침`, `일괄 비활성화`는 Secondary/메뉴로 분리. 삭제/비활성화는 `⋯`와 영향 확인에서만 실행. 제출 버튼이 로딩/disabled일 때 이유를 설명한다.

**상태 라벨 6종 이상 구분:**

| 상태 | 사용자에게 보이는 표기 | 행동 |
|---|---|---|
| 조회 전/미요청 | `아직 조회하지 않았습니다` | 조회 동작 안내 |
| 데이터 0건 | `조건에 맞는 모델이 없습니다` | `필터 초기화` / `모델 등록`(권한별) |
| 데이터 자체 없음 | `등록된 SW 버전이 없습니다` | `+ SW 버전 등록` |
| 미연결/미평가 | `Validator 연동 안 됨` / `평가 이력 없음` | 연동/근거 확인, **통과로 표시 금지** |
| 로딩 | `목록을 불러오는 중`(Skeleton 행) | 기존 입력 유지, 중복 실행 방지 |
| 일시 오류 | `목록을 불러오지 못했습니다` + `다시 시도` | 현재 필터·검색어 유지, Correlation ID 제공 |
| 접근 거부 | `이 자료를 볼 권한이 없습니다` | 존재·제목·건수 누출 금지 |
| 충돌 | `다른 사용자가 먼저 변경했습니다` | 서버/내 변경 비교 후 재시도 |

**폼:** 라벨 항상 표시, 필수 `*`는 색 외에 텍스트 지원, placeholders는 예시일 뿐 라벨 대체 금지. 입력 오류는 필드 바로 밑, 서버 권한 오류는 해당 작업 영역과 상단 요약(필요한 경우)에 표시. 변경을 잃지 않도록 이동·닫기 시 확인.

**키보드/접근성:** 테이블 행 활성화 Enter, 행 작업 버튼 Space/Enter, Drawer Esc(변경 중 확인), Tabs 화살표 이동, 다중 Combobox 역할/키보드 조작, `aria-live`로 저장 성공/실패. 현재 선택 상태를 `aria-selected`/`aria-current`로 제공. 대비 WCAG AA 본문 4.5:1, 큰 글자 3:1 목표; 색상은 의미의 유일한 수단이 아님.

### 16.5 화면 1 — 홈 `/` (검색과 업무 진입)

**주 작업:** 대상 모델 검색, 최근 수정 Item 확인, 자신이 검토할 제안 찾기. 6개 이상 큰 통계 카드로 화면 상단을 채우지 않는다.

- 상단 **전체 모델 통합 검색창 1개**. placeholder: `모델·SW·이벤트·기술 문제 검색 (예: STEP_PROCESS)`.
- 아래 주 콘텐츠 2열(가로폭 충분할 때): **좌 2/3 최근 기술 Item(표)**, **우 1/3 내 검토 대기/최근 방문**. 최근 Item 열은 `[제목, 소유 모델/SW, 기술 판단, 수정 시각]`.
- 숫자 요약은 가벼운 한 줄: `모델 N · SW N · 미해결 Item N · 내 검토 대기 N`(권한 범위 내). 값이 없으면 `—` + 의미 안내; 미평가를 0으로 오인하지 않음.
- 첫 방문/빈 카탈로그: `등록된 모델이 없습니다`와 역할별 `카탈로그 관리로 이동` 또는 `관리자에게 등록 요청`; 구현되지 않은 자동 생성 버튼 금지.

### 16.6 화면 2 — 모델 탐색 `/models`

**주 작업:** 설비사/공정/모델/SW를 좁혀 찾고 상세로 이동. 모델 수천 개에도 전체 트리를 한 번에 펼치지 않는다.

- 헤더: breadcrumb `홈 / 모델 탐색`, 제목 `모델 탐색`, 부제 `설비사·공정별 모델과 SW 버전을 조회합니다`(필요 시), Primary CTA는 **편집 권한자에게만** `+ 모델 등록`.
- 필터줄: `모델/설비사 검색`(가장 넓음), `설비사`(단일/전체), `공정`(다중/전체), `활성 상태`(기본 활성), `필터 초기화`(활성 때만). SW가 없는 모델을 `SW 0`으로 명확히 표시.
- 표 열(좌→우): `모델 코드 / 모델명 / 설비사 / 공정(복수) / SW 버전 수 / 상태 / 최근 변경 / 동작`. 코드 monospace. 공정은 최대 2개 배지+`+N` 펼침(숨겨진 정보는 접근 가능). 기본 정렬 모델명/코드(기준 명시).
- 행 클릭 → 모델 공통 프로파일. 행의 `⋯`는 관리 권한자에게만 `수정`, `비활성화`.
- 한 모델이 복수 공정이어도 표에 한 행. 공정 필터 둘을 선택해도 **중복 행 없음**.

### 16.7 화면 3 — 카탈로그 관리 `/admin/catalog/*`

**주 작업:** 등록/수정/Import. 모든 관리 탭의 구조는 **한 번 만든 동일 패턴**을 공유한다.

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ 사이드바 240px  │ [홈 › 관리 › 카탈로그 관리]                             [+ 모델 등록]     헤더 50 │
│                ├────────────────────────────────────────────────────────────────────────────────┤
│ 일반           │ 카탈로그 관리                                                               │
│  홈            │ [설비사] [공정] [모델●] [SW] [일괄 등록] [외부 연동]                         │
│  모델 탐색     │                                                                                │
│  기술 항목     │ [모델/코드 검색____________] [설비사 전체 ▾] [공정 전체 ▾] [활성 ▾]  [초기화] │
│  통합 검색     │                                                                                │
│                │ [전체 N건] [정렬: 모델명 ▾]                           [Import] [내보내기]    │
│ 관리           │ ┌────────────────────────────────────────────────────────────────────────────┐ │
│ > 카탈로그     │ │모델 코드  모델명        설비사        공정          SW  상태  최근 수정    ⋯│ │
│                │ │X100      Demo X100     Vendor A      ETCH · CLEAN  2  활성  2026-10-29   ⋯│ │
│                │ │X200      Demo X200     Vendor A      CLEAN         0  활성  2026-10-28   ⋯│ │
│                │ │...                                                                 ...│ │
│                │ └────────────────────────────────────────────────────────────────────────────┘ │
│                │ 총 N건                                      [이전] [1 / N] [다음]          │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

> 와이어프레임은 **실제 표시 위치/정보 우선순위의 계약 초안**이다. 각 문자열은 실제 조회 값/권한으로 대체한다. `Demo X100`은 합성 예시다.

**4개 탭의 표 구성/Primary:**

| 탭 | 테이블 주 열(고정 우선순위 순) | 헤더 Primary | 행 클릭 |
|---|---|---|---|
| 설비사 | `코드, 설비사명, 모델 수, 상태, 수정일, ⋯` | `+ 설비사 등록` | 설비사 정보/소속 모델 패널 |
| 공정 | `코드, 공정명, 연결 모델 수, 상태, 수정일, ⋯` | `+ 공정 등록` | 공정 정보/연결 모델 패널 |
| 모델 | `모델 코드, 모델명, 설비사, 공정, SW 수, 상태, 수정일, ⋯` | `+ 모델 등록` | 모델 상세 패널/페이지 |
| SW | `SW 버전, 모델, 설비사, 명세 상태, Item 수, 상태, 수정일, ⋯` | `+ SW 버전 등록` | SW 상세/명세 페이지 |

- **탭을 바꿔도** 목록 필터와 페이지 상태를 탭별로 보존할지 정책을 결정할 때까지, 최소 `q`·선택 모델·활성 상태는 URL/탭 state로 분리해서 복원 가능하게 한다.
- 테이블 헤더가 길어지면 글자를 강제로 줄이기보다 보조 열을 `열 선택`에서 숨기고, 선택 가능성을 유지한다. 열을 무작정 자동 줄바꿈하여 40px 행 높이를 깨지 않는다.
- 빈 상태 CTA는 해당 탭의 등록으로 연결. 권한 없으면 설명만 제공. 관리자 전용 CTA가 일반 탐색에서 보이는 것이 이상한 동작이다.

### 16.8 화면 4 — 모델 등록/수정 우측 패널

```text
┌──────────────────────────── 기존 모델 목록 (상태 보존) ───────────────────────┬────────────── 440~520px ──────────────┐
│  검색/필터/표                                                               │ 모델 등록                         [×] │
│                                                                             ├───────────────────────────────────────┤
│  X100  Demo X100   Vendor A   ETCH, CLEAN   활성                           │ 설비사 *                              │
│  X200  Demo X200   Vendor A   CLEAN         활성                           │ [설비사 검색/선택               ▾]     │
│                                                                             │ 모델 코드 *                          │
│                                                                             │ [예: X100                      ]     │
│                                                                             │ 모델명 *                              │
│                                                                             │ [예: Demo X100                 ]     │
│                                                                             │ 공정 (복수)                           │
│                                                                             │ [ETCH ×] [CLEAN ×] [ + 공정 선택 ]   │
│                                                                             │ 설명                                  │
│                                                                             │ [기술 설명 …                    ]     │
│                                                                             │ 추가 정보 ▸  별칭/참조/활성 상태     │
│                                                                             │                                       │
│                                                                             ├───────────────────────────────────────┤
│                                                                             │                 [취소] [모델 등록]    │
└─────────────────────────────────────────────────────────────────────────────┴───────────────────────────────────────┘
```

- 패널 Footer 버튼은 스크롤과 무관하게 하단에 고정하되 **폼 본문과 겹치지 않는다**. 필수 필드 높이가 화면에 맞지 않으면 **본문 영역만 스크롤**.
- `설비사` 변경이 기존 모델의 소유 범위를 바꾸면 수정 모드에서 경고/승인 절차로 분리. 생성 모드에서는 자유롭게 선택.
- `공정(복수)`는 검색 가능한 `Combobox`/multi-select. 키보드와 스크린리더에서도 선택·제거가 가능해야 한다. 부모-자식 종속 선택기로 오인하지 않도록 `공정은 여러 개 연결할 수 있습니다` 보조 설명.
- 성공한 신규 모델은 테이블에서 선택 상태로 남고 상세 패널에 `SW 버전 0개`와 `SW 등록`으로 이어지는 액션을 보여 준다.

### 16.9 화면 5 — Import 미리보기·충돌 검토

```text
[관리 › 카탈로그 › 일괄 등록]                                        [템플릿 받기]

① 파일 선택   ② 열 매핑   ③ 검증 결과   ④ 충돌 해결   ⑤ 적용 결과
─────────────────────────────────────────────────────────────────────────────
[demo_models.xlsx] [시트: Models] [원천: 수동 업로드] [총 1,240행]  [검증 시각]

[신규 900] [기존 일치 180] [갱신 후보 100] [충돌 48] [오류 12]
[상태: 전체 ▾] [모델 코드 검색_______________] [오류/충돌만 보기]
┌────┬───────┬────────┬──────────┬──────────────┬────────────────────────┐
│행  │결과    │모델코드│설비사 코드│오류 열         │조치                    │
├────┼───────┼────────┼──────────┼──────────────┼────────────────────────┤
│ 41 │충돌    │X100    │VENDOR_A  │model_code     │[기존 값과 비교]        │
│ 42 │오류    │X101    │(비어있음)│vendor_code    │[행 수정/제외]          │
│ 43 │신규    │X102    │VENDOR_A  │—             │[정상]                 │
└────┴───────┴────────┴──────────┴──────────────┴────────────────────────┘

[선택 행 41 : 원본 Excel 값]        │ [내부 카탈로그 현재 값]
 모델코드 X100 / 이름 Demo X100     │  모델코드 X100 / 이름 Demo X100 old
                                  │ [건너뛰기] [기존 매핑] [신규(가능시)]
─────────────────────────────────────────────────────────────────────────────
[검증 결과 다운로드]                                   [뒤로] [적용 계획 확인]
```

- `충돌 48`, `오류 12` 등 수치는 **실측 Job 결과 예시**로만 사용. 프리뷰 코드에 고정하지 않는다.
- 적용 직전 확인 다이얼로그에는 `승인된 신규/갱신/건너뜀/제외`가 정확히 표시돼야 한다. 미해결 충돌은 `자동 덮어쓰지 않음`을 문장으로 표시.
- 충돌 비교는 **원본 파일 vs DB 현재값**을 좌우 대조하고 차이 필드를 강조하지만 전체 면을 진하게 칠하지 않는다.
- `파일 선택`과 `열 매핑`에서 나갔다 돌아와도 아직 저장 가능한 임시 Job 범위에서 입력 복구. 변경된 파일을 조용히 다른 파일로 취급하지 않는다.

### 16.10 화면 6 — 모델 공통 프로파일 `/models/:modelId`

**헤더:** `모델 탐색 › Vendor A › Demo X100` + 우측 `SW 버전 추가`(관리 권한자만). 모델명 아래 `코드 · 설비사 · 공정 배지 · 활성 상태`를 작은 메타줄로 표시.

**영역 순서:**

1. `모델 요약`: 핵심 속성/설명/외부 출처. 긴 설명은 최대 6줄 기본, 더 보기 제공.
2. `SW 버전`: **표 형태** `[버전, 명세 상태, 기술 Item 수, 최종 변경]`, 각 행 클릭 → SW 프로파일. 등록된 SW 없으면 **빈 상태와 추가 동작**.
3. `모델 공통 명세`: `승인된 공통정보` / `자동 추출 후보`를 **다른 탭/상태**로 분리. `출처 SW 2개`, `승인자`, `검토 시점`, `재검토 필요`를 명시. 승인되지 않은 후보가 공통 확정으로 보이지 않아야 한다.
4. `모델 공통 Item`: **소유가 Model인 Item**만 목록화. SW별 Item은 별도 `관련 SW 지식` 보조 탐색으로 제공하고 자동 상속처럼 보이지 않는다.
5. `Top View`: 실제 연결이 없으면 `연결된 Top View가 없습니다` 링크/연결 안내; 의미 없는 빈 도형·가짜 설비 도면을 표시하지 않는다.

### 16.11 화면 7 — SW 프로파일/명세 `/models/:modelId/software/:softwareId`

- 헤더에는 `모델명 / SW 버전`을 한 줄에 표시. **Build** 위치·입력칸을 초기 화면에 만들지 않는다.
- 1차 Tabs: `개요`, `모듈·이벤트`, `Top View`, `기술 Item`, `기술·검증 현황`. 같은 SW 문맥에서 탭이 바뀌며, 다른 SW를 열면 대상 ID와 상태가 명확히 바뀐다.
- **모듈·이벤트**: 좌측 모듈 목록(검색) / 중앙 Event 표 `[Event ID, 이름/의미, 발생 조건 요약, 필드 요약]` / 우측 선택 Event 상세(해당 SW Spec 버전, 발생 조건, 관계, 문서 근거, 연결 Item). 뷰 폭 부족 시 우측 상세는 Drawer.
- **Top View**: Viewer를 모듈 선택 인터페이스로 제공. 클릭 시 모듈 선택 표시(얇은 outline/soft highlight)와 우측 `이 모듈의 이벤트 N건 · Item N건`. 편집 버튼은 `Studio에서 편집` 외부 깊은 링크, 권한 없으면 숨김. 시각화 연결 전 `미연결`을 그대로 표시.
- **기술·검증 현황**: `담당자의 기술적 판단/알려진 이슈`와 `Validator의 실행·검증 결과`를 **서로 다른 섹션**에 표시. 자동 점수를 사람 의견처럼 합치지 않는다. 결과 미연결이면 `평가 데이터 없음`.

### 16.12 화면 8 — 전체 기술 Item/검색/상세

**전체 기술 항목 `/items`:** 탭/필터 `모델/SW 소유`, `유형`, `검증 상태`, `처리 상태`, `표준 카테고리`, `수동 그룹`, `저장 뷰`, `태그`. Item 한 개는 여러 그룹에서 발견할 수 있어도 **그룹 클릭으로 소유가 변하지 않는다**. 행은 `[Item ID, 제목, 소유 Model/SW, 유형, 검증/처리 상태, 갱신일]`.

**통합 검색 `/search`:** 입력어와 해석된 `Event/관계`를 상단에 노출. 결과는 **서로 다른 SW의 유사 Item을 개별 행**으로 보여 주고, 관련 링크를 행 내부의 작은 `유사 사례 N건` 확장으로 제공. 한 행의 보이는 요소: 제목, owner(Model/SW), 본문 한 줄 스니펫, `이벤트 일치/관계 일치/별칭 확장` 이유, 검증 상태, 최근 시각. 역방향 관계는 동일 결함으로 단정하지 않고 `방향이 다름`을 표시.

**Item 상세 `/items/:itemId`:**

```text
[전체 기술 항목 > ITEM-KH-101]                                [관련 Item으로 신규 작성] [수정]
STEP_PROCESS 선행 발생 확인 필요
[소유: Demo X100 / SW 2.0] [확인 필요] [관찰됨] [검토 중]      # 서로 다른 상태 축
────────────────────────────────────────────────────────────────────────────
[본문 · 2/3]                                                  [근거 · 1/3]
■ 관찰된 사실                                                원본 로그/Spec/검증 링크
  실제 발생 이벤트, 재현 조건                                  [출처 상태] [허용 발췌]
■ 기대/명세 기준                                             [행 범위 / 시각 / 해시]
  기대 순서와 Spec 버전                                       [권한이 없으면 요약 불가]
■ 분석 의견·가설                                             -----------------------
  추론이므로 확정 사실과 구분                                 유사·파생 Item
■ 개선 방향                                                  ITEM-KH-098  [열기]
  다음 검증/설비사 확인 사항                                  -----------------------
────────────────────────────────────────────────────────────
판단 변경 이력   [시간 ↓]
[관찰] → [비정상 추정] → [설비사 설명 수신] → [정상 조건 확인]
   (각 판단에 시각/작성자/사유/Evidence 링크; 이전 판단 보존)
```

- 다른 SW의 Item을 이 Item으로 **공유/이관**하는 버튼을 만들지 않는다. `관련 Item으로 신규 작성`은 `derived_from`으로 **새 Item Draft**를 만든다. 초기 Evidence·검증 상태는 미확인.
- 오른쪽 Evidence 영역이 비어도 분석 내용을 가리기 위한 장식 카드를 두지 않는다. `등록된 근거 없음`과 추가/참조 동작(권한별)을 보여 준다.
- 이견/분석 의견은 **사실** 영역에 자동 합류되지 않게 구획하고, 판단 이력은 변경 사유와 출처를 보여 준다.

### 16.13 화면 9 — 통합 검토함 `/review/drafts`

- 목록: `[출처(사람/AI/Validator), 제목, 소유 Model/SW, 제출자, 검증 경고, 제출 시각, 검토 상태]`를 기본으로 하고, **검토 권한 내 자료만** 표시.
- 상세: **좌 Evidence/원본 주장 45% : 우 제안 편집 55%**의 비교 레이아웃(권장), 좁은 화면에서 탭 `근거 / 수정안 / Diff`로 전환.
- 상단 `검토 대기`, `출처: AI 제안` 같은 태그를 보여 주되, `승인`은 **게시 승인**이라는 설명을 붙이고 기술적 `verified`를 임의 설정하지 않는다.
- 경고를 하단에 묻지 않는다. `출처 검증 불가`, `유사 Item 3건`, `Revision 충돌`을 편집/확정 영역 바로 앞에 표시.
- 버튼: `승인(발행)` Primary 1개(권한 있는 인간에게만), `수정 요청`, `보류`, `반려`는 Secondary/메뉴. 검토 사유는 관련 작업에서 필수로 입력.
- 승인 직전 **정확히 발행할 Diff/Revision/digest**를 확인. 승인 후 현재 목록에서 상태 갱신, 원본 초안 및 AI 생성 결과 감사로 보존.

### 16.14 Top View 선택 UX — 눈의 피로와 사실성

- 기본 화면은 밝은/중립 배경. Hover는 **얇은 경계/일부 표면 변화**, Selected는 **1~2px outline + 정보 패널 헤더 강조**. 비선택 모듈을 20% 불투명으로 흐리거나 화면 전체에 어두운 overlay를 씌우지 않는다.
- 클릭한 모듈만 강조하되 **다른 모듈의 Label/상태는 계속 읽혀야** 한다. 사용자가 `Esc` 또는 빈 공간 클릭으로 선택을 지울 수 있다.
- 모듈 선택에 연결된 Event/Item 목록은 **위치만 안정적으로 업데이트**. 매 클릭에 상세 패널을 없앴다 다시 그리거나 강한 zoom-in/flash를 실행하지 않는다.
- `Layout 미연결`, `근거 없는 Replay`, `정상 운영 동작 재현`은 별개 상태. 모호한 시각 표현으로 실측 사실을 암시하지 않는다.
- 사용자 테마 변경에도 명도 대비가 유지되도록 색상을 하드코딩하지 않는다.

### 16.15 개발 에이전트용 디자인 수용 기준 (실제 캡처 없이는 UI 완료 금지)

다음은 **UI 구현 단계의 Definition of Done**이며, 구현 완료 여부를 주장하는 문장이 아니다.

1. **실제 SDK 확인:** `@ap/ui`/`@ap/components`의 설치 버전·export·peerDependency·CSS 진입점을 확인하고 미구현 이름을 추측해서 import하지 않는다.
2. **재사용/중복 금지:** 플랫폼의 Button/Input/Select/Sheet/Tabs/Badge/Toast/Skeleton/색 토큰을 소비하고 제품 도메인에만 고유 컴포넌트를 만든다. 임의 테마 정의·복제된 사이드바 디자인 금지.
3. **화면 우선순위:** `모델 탐색 → 카탈로그 관리 4탭 → 생성/수정 패널 → Import 5단계 → 모델 상세 → SW 상세 → Item/검색/검토` 순서로 동일 패턴 반복 사용. **한 화면당 주 작업/Primary 1개**.
4. **상태 모두 구현:** 데이터 있음/빈 값/미연결/검증 전/로딩/오류/권한 거부/저장 충돌/부분 실패를 Fixture와 스크린샷으로 검증. 성공 상태 한 장만으로 완료 금지.
5. **시각 검수:** 1440×900, 1280×800, 1024×768에서 홈/모델 목록/카탈로그 목록/모델 등록 Drawer/Import 충돌/Item 상세/검토 화면을 실제 브라우저 스크린샷으로 남겨 비교한다.
6. **읽기 밀도:** 한 화면에서 테이블 최소 10행(1440×900에서 가능한 조건 기준), 필터/헤더/테이블이 불필요하게 3단 카드로 쌓이지 않음. 수평 overflow가 있으면 의도된 열 우선순위·스크롤 동작을 확인.
7. **선택 강도:** 선택된 행·모듈이 식별 가능하면서 **주변 항목의 명도 대비/가독성이 급감하지 않는지** 캡처로 비교. 강한 scrim·대형 glow·기본 zoom 전이 금지.
8. **권한·원천 검증:** 일반 사용자에게 Admin CTA가 안 보이고, Viewer가 직접 API를 때려도 서버에서 차단. AI/Validator 결과가 발행된 Knowledge Item으로 보이지 않음.
9. **정보 정합성:** 모델 M:N 공정, SW 버전 독립 명세, Owner 단일 Item, 근거/판단 분리, Viewer vs Studio가 실제 화면 문구·관계에서 유지되는지 E2E 검증.
10. **상호작용:** 키보드 탐색, Esc 닫기, 포커스 반환, 미저장 이탈 확인, 한국어 조합 중 검색, 더블 클릭/중복 제출 방지, URL 직접 접근을 테스트.
11. **시각 회귀:** 주요 화면의 DOM 기반 테스트 + 안정된 합성 fixture로 Visual Regression Snapshot을 보관. SDK 업그레이드 시 이전/이후 차이를 확인하고 **계획하지 않은 UI 차이는 실패 처리**.
12. **산출물:** 각 화면별 `기본/선택/빈/오류/권한` 캡처와 구현 상태표, 실제 사용 컴포넌트·토큰 목록, 미구현/후속 기능 리스트. **도면/와이어프레임 없이 대충 만들고 구현 완료로 보고하지 않는다**.

> **참고 시각 샘플:** 함께 제공하는 `Log_Knowledge_Hub_UI_Reference_v0.4.html`은 **정적 레이아웃 참고**이며 실제 SDK가 렌더한 결과나 동작 구현이 아니다. 실제 제품 코드는 이 문서의 토큰·권한·상태/컴포넌트 계약을 따른다.

---

## 17. UI 검수 시나리오와 테스트 데이터 (합성 예시)

### 17.1 디자인 검수용 최소 데이터셋

| 객체 | 합성 예시 데이터 | 반드시 검증할 상태 |
|---|---|---|
| Vendor | `VENDOR_A`, `VENDOR_B` | 서로 다른 설비사 목록/중복 코드 |
| Process | `ETCH`, `CLEAN`, `DEPOSITION` | 독립 분류, 1개 모델의 복수 공정 |
| Model | `X100`(ETCH+CLEAN), `X200`(CLEAN), `X300`(미분류) | 모델 중복 방지, 미분류, SW 0개 |
| SW | `X100 / 1.0`, `X100 / 2.0`, `X200 / 1.0` | 독립 명세, 동일 버전 문자열이 **다른 모델에는 공존 가능** |
| Item | Model 공통 1개, SW별 Item 2개(유사 연결) | 독립 소유, 유사 관계, 발행 vs 판단 상태 구분 |
| Validator | 실행 이력 없음 1개, Finding 후보 1개 | 미연결/미평가와 검토 후보의 별도 표시 |
| Import | 정상 10, 기존 일치 2, 충돌 2, 오류 1(샘플 축약) | 5단계, 충돌 확인, 부분 실패 재시도 |
| ACL | Viewer / CatalogEditor / Publisher / Reviewer | 메뉴/CTA/서버 권한 각기 다름 |

합성 데이터만 사용하고 실제 사내 설비사·모델 코드·이벤트 원문은 공개/테스트 파일에 넣지 않는다.

### 17.2 개발 산출물 및 검수 매트릭스

| 검수 화면 | 기본 화면 | 필수 예외/상태 | 실제 시각 캡처 |
|---|---|---|---|
| 홈 | 최근 Item + 검색 + 내 검토 대기 | 지식 0건, 검토 권한 없음 | 1440·1280 |
| 모델 탐색 | 모델 30건, 공정 필터 M:N | 검색 결과 0건, 비활성 모델, 긴 이름 | 1440·1280·1024 |
| 카탈로그 관리 | 설비사/공정/모델/SW 탭, CRUD 동작 | 편집 권한 없음, 행 선택, 409 충돌 | 1440·1280·1024 |
| 모델 등록 Drawer | 설비사 선택·코드·모델명·공정 복수 | 서버 중복, 필수 누락, 미저장 닫기 | 1440·1280 |
| Import | 5단계 중 3/4/5 단계 | 중복·참조 누락·충돌 미해결·부분 실패 | 1440·1280 |
| 모델 상세 | SW 2개 + 공통 후보/승인 분리 | SW 0개, 재검토 필요 | 1440·1280 |
| SW 상세 | 모듈/이벤트 명세 + View | 명세 없음, Viewer 미연결 | 1440·1280 |
| Item/검색 | 소유/관찰/해석/근거/판단 변경 | 유사 SW Item 2건, 권한 없는 근거 | 1440·1280 |
| 검토함 | AI/사람/Validator 출처 분리와 Diff | 승인 불가, 근거 검증 실패, 버전 충돌 | 1440·1280 |

**검수 방식:** 스크린샷과 화면 DOM을 **둘 다** 확인한다. 이미지가 필요하다고 해서 무관한 스톡 이미지나 실제 설비 도면을 임의로 삽입하지 않는다. 시각 캡처를 검토할 수 없는 환경이면 `시각 검수 미실시`로 기록하고 완료 판정을 보류한다.

### 17.3 사용자 확인이 필요한 추후 UI 후보

- 카탈로그 관리에서 설비사 코드 변경 권한/영향 승인 조건.
- 정규화 키와 외부 기준정보의 정확한 유일성/우선순위 정책.
- 1024px 상세 Drawer의 overlay vs 독립 상세 라우트 기준.
- Import 대용량 Job 한도/파일 보관 정책/부분 성공 transaction 정책.
- 모바일에서 Import 편집까지 제공할 필요성.
- SW별 Spec 작성 화면의 전문 편집 수준과 현재 수동 입력 범위.

---

## 18. 버전 이력

| 버전 | 날짜 | 주요 변경 | 승인/상태 |
|---|---|---|---|
| v0.2 | 2026-10-29 | 독립 웹·검색·AI 초안·초기 Model/SW 구조 통합 | 설계 후보 |
| v0.3 | 2026-10-29 | 결정 1~17 반영, SW별 독립 명세/Model 파생정보, 단일 소유 Item, Validator 경계, 권한 차등, Evidence 병행, Viewer 분리, 판단 이력 | 사용자 선택 사항 반영; 구현/배포 미완료 |
| **v0.4** | **2026-10-30** | **카탈로그 관리 CRUD/비활성화/5단계 Import/외부 매핑 상세(§15), SDK 근거 디자인 시스템·화면별 픽셀 규칙·9종 화면 와이어프레임/상태·시각 검수 기준(§16–17)** | 사용자 추가 요청 반영; 상세 필드/픽셀/API는 후보, 시각 구현/배포 미완료 |