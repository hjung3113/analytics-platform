# 문서별 단일 책임 감사 — Codex Astra

작성일: 2026-09-21. 기준 checkout: `36f14fd8e41782f32dfee5e9c7193659fa0247d4`. 시작 시 Git working tree는 clean이었다. 지정된 INDEX, docs/00~07, DESIGN, PLATFORM_REQUIREMENTS, HANDOFF, AGENTS/CLAUDE, wireframe SKILL 전체를 읽었다. 추가로 실제 참조를 `rg -n --hidden`으로 조사했다. 이 보고서만 새로 작성했으며 아래 이동·분리·병합은 모두 제안이다. 외부 웹/파서 저장소/제품 런타임은 검증하지 않았다.

**판정:** 문제는 문서 수보다 변경 이유가 다른 규칙의 동거와 중복 원본이다. DESIGN은 시각 규격에 더해 업무 시나리오, 메뉴 구조, 데이터 의미, 과거 리뷰 및 결정 상태를 담고 있다. 06/04/05에도 같은 문제가 역방향으로 존재한다. 기존 파일명을 유지하면서 **06=전역 행동·확장 계약, DESIGN=시각 규격, 04=기술 후보·비교 근거, 05=결정 상태**로 정리하고, DESIGN에서 특정 대시보드 레시피와 과거 리뷰만 분리하는 것이 가장 작은 실효적 변경이다.

**고정 조건:** 270px 사이드바, 54px 헤더, 32px 최소 테이블 밀도 및 25px compact 시각 목표의 의미는 그대로 유지한다. 06의 Decided 계약을 축소·재결정하지 않는다. 문서 소유권 변경은 후보 항목을 Decided로 승격하거나 기능 구현을 승인하지 않는다. 본문의 `파일:라인`은 감사 시점 기준이며 이후 이동 후에는 영구 식별자가 아니다.

## 1. 현재 책임 지도

### 1.1 문서별 실제 내용과 책임 진단

| 문서 | 실제 담긴 내용 | 단일 책임 진단 / 근거 |
| --- | --- | --- |
| `docs/INDEX.md` | 역할별 진입점, 목록, 원본 이력, 소유권, 외부 참고자료 | 탐색 책임은 적절하다. 그러나 19–26행 목록에 root DESIGN·요구사항·HANDOFF가 빠지고 38행 소유권에도 DESIGN이 없어 새 시각 원본이 공식 지도 밖에 있다. |
| `docs/00_overview.md` | 목적·범위, 두 차례 리뷰 발견/논쟁/정정, YAGNI 제외 | 목적·비범위는 적합. 11–27행 리뷰 진행사와 파서 문서 정정 이력은 역사 기록 책임이다. 23행은 사라진 04의 “딥링크 절”을 현재 교정 위치처럼 안내한다. |
| `docs/01_architecture_and_data_contract.md` | 데이터 흐름, view/mart, 버전·grain·계산세대·집계, 마스터 소유권, 스코핑/조회량 | 대부분 응집적. 11행 React+TS+Tailwind가 구조도에 확정처럼 박혀 04의 Candidate와 중복된다. 59행 Phase 0 지시와 63행 초기 site/plant 권장은 결정 상태를 별도로 재진술한다. |
| `docs/02_domain_menus.md` | 플랫폼 코어 기능, 6개 도메인 capability와 데이터 의미, 개발 Phase | 3–15행 Kernel 목록은 06 §4/§5/§17 등과 경쟁한다. 9–10·21·25–26행 Phase 우선순위가 catalog에 섞인다. 30행의 도메인 6개와 navigation 7그룹 분리는 잘된 경계다. |
| `docs/03_backend_stack.md` | 기술 후보, SQL/API/worker 역할, DB 토폴로지, 재현성·원천시간·상태근거 | 20–37행의 데이터/공개 의미 계약은 스택 선택과 변경 이유가 다르다. 26–31행 “Phase 0에서 결정”에는 이미 06 §6.3에서 확정된 경계/미확인 처리도 섞인다. |
| `docs/04_frontend_ui_ux.md` | 기술 후보·상용제품 리서치, 계약 링크, 메뉴 화면 패턴, 상태 UX, 차트/주석 모델 | 7–9·44–48행의 선언은 좋으나 54·62·66·96–107행은 업무·영속 모델을 정의하고 70–79행은 06의 상태 규칙을 재작성한다. 실제 치수/토큰 표는 없으므로 “세 문서 모두 동일 픽셀 표”라는 지적은 부정확하다. |
| `docs/05_roadmap_and_open_questions.md` | 결정 상태, 검증 시나리오, Open 질문, 운영 정책 본문, 과거 Phase 표 | 49–61행은 상태 추적을 넘어 폴링·DB·지연완료의 유일한 상세 계약을 보유한다. 06:256이 R 정의를 여기서 가져오는 실제 역의존이 있다. |
| `docs/06_platform_ui_contract.md` | Kernel·메뉴·URL·시간·권한·상태·도움 컴포넌트 계약, IA, 거버넌스, 시각 스케일·셸 치수 | 전역 계약의 단일 원본은 유지해야 한다. 다만 §7/§15의 수치, §23의 radius/type/spacing, §25의 breakpoint는 시각 원본과 겹친다. §13의 특정 라이브러리 단정도 04 책임이다. |
| `docs/07_app_shell_wireframe.md` | 셸 사용자 작업, 소비 IA, 배치, 개념적 데이터 요구, 상태 시나리오, 결정표 | 5·111·126행은 소비자임을 명확히 한다. 105·135–136행의 URL/시간 Open 복제본이 06의 현재 Decided 상태와 불일치한다. 픽셀 토큰 문서로 합칠 이유는 없다. |
| `DESIGN.md` | YAML 토큰, 시각 원칙·컴포넌트, reference dashboard, 업무/데이터 binding, 인터랙션, 리뷰 판정, Open/Resolved 이력 | 핵심 감사 대상. 아래 행 단위 이동표 참고. 토큰·키보드·포커스·hover 등 자체는 본래 책임이며 모두 제거할 대상이 아니다. |
| `PLATFORM_REQUIREMENTS.md` | 3모델 도출 체크리스트, 신규 제안, Must/Should, 해결한 충돌, 통합 Open, 작성 방법 | 요구/제안의 추적은 유용하지만 결정 원본이 되어서는 안 된다. 25–26행 완료와 166행 “즉시 결정 필요”가 모순이고, 162–180행은 05와 별도의 질문 대장이다. |
| `HANDOFF.md` | 9/21 결정·완료·다음 세션 순서와 당시 Git 상태 | 세션 연속성 책임에 적합. 21·39행은 REQUIREMENTS/05를 함께 유지하라고 하여 질문 상태 이중 기록을 고착한다. 영구 규범의 출처로 사용하면 안 된다. |
| `AGENTS.md` / `CLAUDE.md` | 목적·소유권 요약, 문서/스킬 진입점, tooling 경계 | 9·15·20·24행은 적절한 라우팅이다. DESIGN의 시각 소유권을 명시하는 확장이 필요하다. CLAUDE는 실제 `AGENTS.md` 상대 심링크이며 독립 수정 대상이 아니다. |
| `.agents/skills/analysis-platform-wireframe/SKILL.md` | 단계/스킬 역할/산출물/게이트, 제품 규칙 요약 | 절차 책임은 유지. 45행은 DESIGN을 visual source of truth로 정하지만 76행은 root DESIGN 부재를 단정한다. 41행의 결정 기록은 각 화면에 독립 대장을 만들라는 뜻으로 쓰이지 않게 05로 연결해야 한다. |

### 1.2 DESIGN에서 UI 디자인 시스템 이외의 내용 — 행 단위 이동 판정

표의 “이동”은 문단 전체를 무차별 복사하라는 뜻이 아니다. 표시 규격과 의미 규칙을 문장 단위로 나누고, 이미 06에 존재하는 규칙은 재복제하지 않고 원본 링크로 치환한다.

| 현재 위치 | UI 시스템 외 내용 / 왜 문제인가 | 목표 소유자와 남길 내용 |
| --- | --- | --- |
| `DESIGN.md:561–567` | 플랫폼 목적 및 구현 요청을 받아 이 산출물을 만들었다는 작업 이력 | 목적은 06 §1 링크 1문장, 생성 이력은 review 기록. DESIGN에는 적용 범위만 남김. |
| `DESIGN.md:616–619` | 운영자의 주요 업무, 수집→변환→파싱→원천→검증이라는 업무 프로세스 정의 | 신규 reference dashboard 문서의 USER TASK/Candidate 데이터 요구. 실제 업무 채택 전 catalog/Kernel 요구로 승격하지 않음. 620–623행 색·밀도는 유지 가능. |
| `DESIGN.md:625–633` | P0/P1/P2 항목별 완료·불완전·오판 정정 | 날짜 있는 review 기록. 현재 규격과 과거 부족사항을 분리. |
| `DESIGN.md:635–641` | 도메인 컴포넌트 승격 조건과 생산 navigation 원본 지정 | 06 §14/§24/§9 참조로 축약. “시각 레시피는 메뉴 추가 승인 아님”이라는 범위 경고는 DESIGN에 유지. |
| `DESIGN.md:660–667` | 성공/미확인 등 데이터 의미 예시, 특히 667행이 06와 04를 공동 의미 소유자로 지목 | 06 §18–19 단일 의미 원본을 인용. 색/배지 매핑 자체는 DESIGN의 시각 책임이며 유지. 상태 발생 조건을 다시 정의하지 않음. |
| `DESIGN.md:710–722` | 5단 pipeline/queue/lifecycle/품질 위젯 구성 및 운영 업무상 주의 우선순위 | 특정 reference dashboard의 화면 레시피로 분리. 719–722행의 업무 우선순위 판단은 전역 DS 규칙이 아님. |
| `DESIGN.md:763` | Equipment/Data Management/Processing Pipeline 등 6개 screenshot 그룹을 06 §9와 같다고 주장 | 해당 그룹명은 reference dashboard의 비규범 예제로 이동. 제품 메뉴는 06:355–366의 7그룹만 소비. DESIGN 640–641·943행의 후속 정정으로 옛 규칙을 덮는 구조를 없앰. |
| `DESIGN.md:765`, `814–821` | 검색·scope·notification·profile의 고정 인벤토리와 실제 account 기능/검색 허용범위 | 후보 배치는 07, 기능 범위는 06 §10 및 05. 정렬·dropdown geometry·키보드는 DESIGN 유지. 07:86의 알림 벨 비필수 경계를 그대로 지킴. |
| `DESIGN.md:776` | 알림 요약이 full Alerts screen으로 연결된다는 화면 존재 가정 | reference 화면의 미확정 목적지 요구로 이동; 실제 메뉴 채택 시 02/해당 화면 spec. alert-row padding/색/정렬은 유지. |
| `DESIGN.md:807–813` | global period 소유, URL wall-clock 물질화·기본시계·날짜 경계 및 preset 미결 | radio/Apply/Cancel/focus는 DESIGN 유지. global/URL 의미는 06 §6.3/§11 링크, preset 질문은 05. |
| `DESIGN.md:822–832` | 설비/stage/status 필터 인벤토리, page-owned 분류, visible-page 선택/광역 선택, Context 변경 시 선택 해제, 권한검사·export 범위 | 도메인 필터/액션은 reference spec·02, 공통 선택 모델/Export 동작은 06 §15/§17. 기존 06에 없는 세부 선택 규칙은 출처와 현 상태를 유지한 Candidate로 이관하며 Decided로 단정하지 않음. checkbox/toolbar/bulk bar의 시각·접근성 규격은 DESIGN 유지. |
| `DESIGN.md:835–848` | completion과 success share 구분, coverage/traceability/consistency 및 daily defects의 업무 바인딩 | 계량 의미·단위는 reference spec의 데이터 요구, 채택된 정의는 02/01. 색·링 크기·legend·축 표현은 시각 규격. Context 변경 금지는 06 §11 인용. |
| `DESIGN.md:849–861` | queue 분모/회색 잔여의 분류, processing window/next-run 원천, lifecycle 업무 상태와 검증 결과 구분 | reference spec/02의 도메인 의미·Open으로 이동. 문서에 없는 세 번째 queue 범주를 만들지 않음. 마커 크기/접근성 표현은 디자인 레시피로 유지. |
| `DESIGN.md:879–887` | 재조회/Context 전환/권한·부분 실패·근거 있는 상태 판정 | 06 §11/§19가 이미 소유. DESIGN에는 해당 상태를 받은 경우의 skeleton/오류 패널 렌더링만 남김. |
| `DESIGN.md:897–902` | live 근거·완전성 의미 및 특정 root Dashboard의 breadcrumb 부재 | 근거 계약은 06 §18–19, dashboard 여부는 화면 레시피. pulse 속도/reduced-motion/모양 및 breadcrumb 표현은 DESIGN 유지. |
| `DESIGN.md:929–946` | Open, Candidate, Resolved, 리뷰 교정, 이미 끝난 정합화 및 미결 업무 의미가 하나의 절에 동거 | 현재 질문/상태는 05, 근거/과거 리뷰는 review 기록. 토큰 바인딩 기술 비교는 04. DESIGN에는 현재 규격과 상태 ID 링크만 남김. |
| `DESIGN.md:941–943` | 반경/폰트 정정의 상세 이력, “06/07은 치수를 고정하지 않는다”는 옛 설명 | 당시 기록으로 보존하고 2026-09-21 결정의 현재 출처는 05:14로 연결. 942행을 현행 규범으로 옮기면 최신 06:301–314와 충돌함. |
| `DESIGN.md:944–946` | 기간 의미, queue/lifecycle semantics, 프로필/벌크 작업 권한·수량 제한 | 05의 Open ID 및 해당 06/02/화면 소유자. 시각 토큰 문서에서 제품 질문을 독자적으로 해결하지 않음. |

YAML도 완전히 중립적인 것은 아니다. `DESIGN.md:203–225`의 reference-dashboard grid 및 `focalRegion: pipeline-status`, 415–416행 preset labels, 514–527행 시리즈의 업무 이름/`unit: defects`는 구체 화면/데이터 binding이다. 공통 색·컴포넌트 geometry는 DESIGN에 남기고, 레이아웃 조합과 업무 이름→토큰의 결합은 reference recipe가 소비하게 한다. pipeline/scheduler/lifecycle의 시각 규격이 존재한다는 사실 자체는 위반이 아니다. **단일 메뉴 전용 Candidate임을 밝히고 제품 의미를 분리하는 것**이 핵심이다.

### 1.3 04 / 06 / DESIGN의 중복과 경계 불명확성

| 중복 주제 | 확인한 위치 | 책임 경계 제안 |
| --- | --- | --- |
| 셸 치수 | 06:301–314 ↔ DESIGN:256–278, 703–704 | DESIGN 토큰 값이 canonical. 06은 소비 의무/행동 계약만 유지하고 값은 링크. 270/54 확정 유지. |
| 셸 나머지 geometry | 06:305–311의 collapsed 64, page header 56–64, padding 24/gap 24 ↔ DESIGN:209–225의 20/12/16 | 같은 값 충돌로 단정하지 않는다. 전역 baseline인지 dashboard variant인지 범위가 불명확하다. 기존 수치를 모두 출처/상태와 함께 DESIGN의 baseline/recipe로 분리하고 값 선택은 이 감사에서 하지 않는다. |
| 테이블 밀도/숫자 표기 | 06:630–640 ↔ DESIGN:486–490, 689–698, 729–731 | 최소/가변 높이 의미와 32px를 유지하며 시각 원본을 DESIGN으로 일원화. 06 §15는 선택·컬럼 선호·플랫폼/도메인 경계 유지. |
| radius/spacing/type | 06:910–941 ↔ DESIGN:77–200, 669–705, 744–758, 941 | 실제 수치가 이중 기재됨. DESIGN에 합치고 06 §23은 semantic layer 소비 의무와 링크만 유지. Candidate 범위를 이동만으로 확정하지 않음. |
| semantic naming/elevation | 06:943–963 ↔ DESIGN:14–75, 733–742, 941 | `--background`와 `colors.canvas`는 941행에서 개념상 대응으로 설명되며 강제 동일 키가 아니다. 06의 floating shadow 허용과 DESIGN의 전면 no-shadow는 다른 허용 범위이므로 blanket equivalence로 합치지 말고 05에서 별도 추적; 이 감사는 시각 정책을 선택하지 않음. |
| 반응형 | 06:999–1017 ↔ DESIGN:224–225, 724–731 | Desktop-first/지원 업무 범위는 06, breakpoint 수치와 grid/밀도 구현은 DESIGN, 특정 화면의 패널 위치는 recipe/07. |
| 상태·데이터 신뢰 | 04:68–79 ↔ 06:739–820 ↔ DESIGN:660–667, 879–902 | 상태 의미·발생조건·권한·응답 스키마는 06, 원천/계산은 01, 렌더링은 DESIGN. 04에는 기술적 적용/리서치 링크만. |
| 컴포넌트/라이브러리 | 04:15–21 ↔ 06:510–574 ↔ DESIGN:760–902 | 06은 논리 책임/공통화 경계, DESIGN은 모양·입력 상호작용, 04는 프레임워크 바인딩 후보. 06:534의 shadcn+Base UI 단정은 04:17의 비교 후보로 연결. |
| 화면 패턴 | 04:50–66 ↔ 06:433–506 ↔ DESIGN:708–731 | archetype의 의미/구성 책임은 06. 04는 근거·후보 비교, 실제 레이아웃은 화면 spec/recipe. 04:58의 “KPI 카드 수 제한”에는 5–6이라는 값이 없다. DESIGN:705의 수치 출처 표현을 04가 승인한 값처럼 읽지 않게 정리. |

### 1.4 다른 문서에서 확인한 역방향 책임 유출

- **03 → 01/06:** 원천 wall-clock·변환과 상태근거 소유자(03:24–37)는 데이터 계약 01로, 딥링크 재현성(03:20–22)은 06 §6.1로 연결한다. 06:244가 현재 시간 의미의 원천을 03으로 안내하므로 함께 바꿔야 한다. SQL/API/worker 역할은 01의 아키텍처 원칙으로 합치고 03에는 선택 근거를 남긴다.
- **05 → 01/03:** 실시간성·DB 접근·지연완료 메커니즘(05:49–61)을 값 그대로 01의 운영 데이터 계약으로 이동한다. 03은 기술 배치/후보와 채택 결과를 소비한다. 05에는 Decided 상태·날짜·근거·새 원본 링크만 둔다. R과 defaultRangeTo의 결합 규칙은 계속 06 §6.3이 소유한다.
- **04 → 02/01/06:** 설비 비활성화·유효구간 및 VOC 모델(04:54·66)은 02, 지표 definition/발행 의미(62)는 02, 집계/버전 데이터 계약은 01, 전역 지표 version pair는 06. 주석 도메인 객체(96–107)는 02의 분석 주석 절, 저장 좌표/식별·권한 데이터 책임은 01에 둔다. 도메인 주석을 새로운 최상위 메뉴로 등록하지 않는다.
- **00 → review:** 리뷰별 발견/논쟁(00:11–27)을 날짜 있는 이력으로 옮기고, 현재 유효한 결론은 01/02/03/06 링크로만 안내한다. 00의 목적/YAGNI는 유지하고 06의 Platform-first 원칙을 참조한다.
- **02 → 06/05:** 코어 기능 상세(02:3–15)는 기존 06 규칙에 합치고 도메인의 소비 의존만 남긴다. Phase 숫자는 05의 Deferred 표로 링크한다. 02:30의 catalog≠IA 구분은 유지한다.
- **07의 상태 복제:** 105·135–136행의 “Open”은 06:214–272/05:12와 어긋난다. 07의 로컬 배치 질문은 남기되 전역 결정 상태는 05 ID 링크로 바꾼다. 과거 표를 무조건 Decided로 바꾸지 않고 실제 미결인 TZ 값/계층은 Open으로 보존한다.
- **SKILL의 환경 사실:** 76행 DESIGN 부재는 실제 946행 파일과 충돌한다. 스킬은 매번 저장소 상태를 확인하도록 지시하고 현재 파일의 존재/부재를 영구 사실로 박지 않는다. 45행의 시각 원본 선언은 유지한다.

## 2. 목표 문서 구조 제안

### 2.1 파일별 한 가지 변경 이유

| 문서 | 목표 책임 / 제안 섹션 | 넣지 않을 내용 |
| --- | --- | --- |
| `AGENTS.md` | 작업 규칙·문서 라우팅. 06 전역 계약 / DESIGN 시각 규격 / 05 결정 상태를 명시 | 전체 계약/토큰 복제 |
| `docs/INDEX.md` | 문서 지도·authority matrix·역할별 읽기 순서·레퍼런스/역사 분류 | 새 제품 결정 |
| `docs/00_overview.md` | 목적, 사용자 문제, 범위/비범위, 플랫폼 성공 정의 링크 | 리뷰 대화/기술 비교/데이터 상세 |
| `docs/01_architecture_and_data_contract.md` | 데이터 아키텍처; 원천·식별/grain/시간; 마스터 소유; 집계/세대; 상태근거; 갱신/DB 접근/지연완료 운영 계약 | URL 직렬화 원본, 픽셀/컴포넌트 표현 |
| `docs/02_domain_menus.md` | 도메인 capability; 업무 객체·지표/주석·VOC 의미; 플랫폼 계약 소비 의존 | Kernel 재정의, navigation 목록, Phase 일정 |
| `docs/03_backend_stack.md` | 백엔드/DB/인증/배치 도구 후보·선택 근거·적용 경계 | wall-clock/재현성 계약 재작성 |
| `docs/04_frontend_ui_ux.md` | 제목을 “프론트엔드 구현 후보·리서치”로 좁힘. 기술 비교, UI/UX 근거, 라이브러리 바인딩 후보, 향후 검증 항목 | 독립적인 상태 taxonomy/도메인 저장 모델/픽셀 원본 |
| `docs/05_roadmap_and_open_questions.md` | 결정 ID, 상태, 날짜, 적용 범위, canonical 위치, 이유/이력 링크, 미결 질문과 Deferred 가설 | 상세 알고리즘/운영 계약 본문 |
| `docs/06_platform_ui_contract.md` | 기존 Kernel/URL/Scope/IA/상태/확장/거버넌스 계약 유지. §7·15·23·25는 시각 규격 링크와 책임 경계 | 토큰 숫자/화면별 디자인/라이브러리 채택 |
| `docs/07_app_shell_wireframe.md` | 셸 사용자 작업·배치·소비 시나리오·로컬 배치 후보 | URL/시간 상태 대장, 디자인 토큰 값 |
| `DESIGN.md` | Scope/authority; YAML tokens; Colors/Typography/Layout/Elevation/Shapes; 시각 Component Specs; UI Interaction States; Accessibility Rendering; visual sources | 제품 우선순위/메뉴 목록/데이터 상태 발생조건/변경 로그 |
| `PLATFORM_REQUIREMENTS.md` | 요구/제안 backlog와 완료 증거. 각 항목은 contract/decision ID를 참조, 우선순위는 제안임을 보존 | Open/Decided의 두 번째 원본 |
| `HANDOFF.md` | 최근 작업·live 검증 방법·다음 작업 링크 | 영구 계약·결정 대장 |
| wireframe SKILL | 작업 절차·게이트·산출물과 읽기 순서 | 현재 파일 존재 여부·제품 규칙 확정 |

**병합/분리 판단:** 04·06·DESIGN을 합치지 않는다. 서로 독자가 겹쳐도 변경 이유가 다르다. 00~07의 경로는 그대로 둬 참조 비용을 줄인다. 01이 길어지더라도 이번에는 03/05의 관련 계약을 수용하는 정도로 두고, URL/state를 새 API 문서로 떼어 06의 authority를 약화하지 않는다.

### 2.2 꼭 필요한 신규 분리 문서 — 아직 만들지 않음

1. **`docs/design/reference_dashboard_recipe.md` (Candidate visual reference)**
   - `Provenance & non-authority`: 제공 이미지와 현재 제품 IA/기능의 차이.
   - `USER TASK / Candidate assumptions`: DESIGN:616–619, 719–722의 특정 업무 시나리오.
   - `Composition`: DESIGN:203–225의 reference 전용 설정과 708–731의 화면 구성. canonical shell/table 토큰은 DESIGN 링크만 소비.
   - `Domain bindings / Required evidence`: 822–861의 필터·지표·queue·lifecycle 의미와 미확정 데이터 요구. 수치/색 geometry는 DESIGN의 컴포넌트 토큰 링크.
   - `Open dependencies`: 05 결정 ID 목록. 이 문서를 운영 개요의 승인된 화면 또는 새 메뉴 등록으로 취급하지 않음.
   - 범용 레시피와 단일 대시보드 시안을 분리하는 것이 목적이며, 07 셸 와이어프레임과 합치지 않음.
2. **`docs/reviews/2026-09-21-design-reference-provenance.md` (이관일 기준 역사 기록)**
   - DESIGN:609–614·625–633·936–943의 리뷰 판정/수정 경위와 당시 진술을 보존.
   - 실제 최초 작성일을 알 수 없으므로 2026-09-21은 이관일이라고 명시. 942행의 옛 설명을 현재 계약으로 복제하지 않음.
   - 00의 리뷰 이력은 별도 기존 provenance 절 또는 날짜가 확인된 review 기록으로 이동; 서로 다른 세션을 같은 결정인 듯 합치지 않음.

**상태를 다루는 방식:** 05에 안정 ID(예: `DEC-shell-geometry`, `OPEN-date-presets`)를 부여하는 것은 제안이다. DESIGN은 필요하면 각 visual recipe 옆에 상태 ID를 연결하되 질문/판정의 긴 본문은 두지 않는다. 외부 참고 원칙을 기술한 Sources는 시각 선택의 근거이므로 DESIGN에 남겨도 SRP 위반이 아니다. 토큰 원본을 별도 JSON/CSS 파일로 옮기거나 codegen을 도입하는 일은 이번 문서 감사의 범위 밖이다.

## 3. 깨질 수 있는 참조 목록

### 3.1 실제 검색 결과에서 확인한 의존

검색은 root/docs/숨김 `.agents`를 포함했다. 외부 vendor 디자인 corpus는 제품 원본과 구분했고, 아래는 제품 경로를 가리키는 실제 소비자다. `DESIGN.md#...` 형식의 fragment 링크와 root DESIGN 밖의 정확한 `{colors.primary}` 리터럴 인용은 제품 문서/로컬 reports 검색에서 발견하지 못했다. 대다수는 Markdown 링크가 아닌 백틱 경로 + 절 이름이므로 링크 검사만으로는 잡히지 않는다.

| 실제 참조 위치 | 대상 / 이동 후 조치 |
| --- | --- |
| `docs/06_platform_ui_contract.md:301,314,630,638` | DESIGN `sidebar-shell`/`top-bar`/`table-density`. 토큰 키/루트 경로를 보존하면 계속 유효. §7/§15 숫자 블록을 제거할 때 안정된 visual anchor 링크로 바꿈. |
| `docs/06_platform_ui_contract.md:910–963` | **요청에서 가정한 “§23이 DESIGN을 참조하는 지점”은 현재 없다.** 실제로 radius/type/spacing을 자체 정의한다. 새로 `../DESIGN.md`의 각 시각 절로 연결해야 한다. 역방향은 DESIGN:604·671·678–680·941에 존재한다. |
| `docs/05_roadmap_and_open_questions.md:14` | DESIGN 토큰명, 06 §7/§15, REQUIREMENTS §0. 결정 ID와 새 canonical anchor로 연결. 완료 날짜/확정값은 보존. |
| `docs/05_roadmap_and_open_questions.md:16` | 04/03 기술 후보. 파일명 보존 시 경로 유지, 새 섹션 anchor만 지정. |
| `PLATFORM_REQUIREMENTS.md:25–26,32–33,41` | DESIGN 토큰/“Open Decisions”, 06 §7/§15/§23, 04. Open Decisions를 옮길 때 33·41은 05의 실제 질문 ID로 변경. 32는 06의 layer 계약+DESIGN 토큰을 구분. |
| `PLATFORM_REQUIREMENTS.md:53,86–101,107–114,129–135` | 06 §9/§22/§6/§4/§5/§8/§12~19/§28~29. 번호를 유지하면 안정. 전역 절을 재번호화하지 않는 이유다. |
| `PLATFORM_REQUIREMENTS.md:162–180` | 통합 Open 15개. 05로 병합 시 항목별 대응 ID 필수; 166은 이미 완료한 §0을 가리키는 resolved link로 정리. |
| `HANDOFF.md:8–11,21,30,39` | DESIGN 값/06/05/요구사항 Open 리뷰. 새 결정 ID/현재 질문 목록으로 라우팅. 과거 작업 사실은 역사로 보존하고 미결 개수를 새 진실로 복제하지 않음. |
| wireframe `SKILL.md:23,25,41,45–46,76` | DESIGN의 역할/존재/단계. 45의 root 경로 유지; 76의 부재 단정 제거; 결정 상태는 05 링크 추가. |
| wireframe `SKILL.md:74–75,77` | 01 데이터 계약, 06 Context/상태/IA, 07 소비자. 경로 유지. 75의 상태 의미를 DESIGN으로 옮기지 않음. **04 직접 경로 인용은 이 SKILL 본문에 없다.** |
| `.agents/skills/analysis-platform-wireframe/references/wireframe-rules.md:21,86,91–93` | 06 §9 및 root DESIGN sourcing. DESIGN을 시각 원본으로 한정하는 보강, 새 레시피를 제품 규범으로 삼지 않도록 연결. |
| `.agents/README.md:31` | 외부 DESIGN을 제품 계약으로 채택하지 않는 규칙. 이름만 같은 외부 corpus를 이관 대상으로 오인하지 않음. |
| `DESIGN.md:205,633,813` | 문서 내 “Open Decisions” 방향. 해당 절 이관 후 05 ID 또는 역사 문서 링크로 바꿔야 함. |
| `DESIGN.md:604,671,678–680,941` | 06 §23의 radius/type 원본 의존. §23 축약 후 DESIGN이 자기 값을 06 수치로 다시 정당화하는 순환 설명을 제거하고 로컬 토큰을 가리킴. |
| `DESIGN.md:667,687,705,783,932,934` | 04 상태/오류/카드 제한/최신성/차트 후보/라이브러리. 상태 의미는 06, 기술 후보는 04, 시각 수치는 DESIGN으로 분리. |
| `DESIGN.md:725,811,821,838,882,885,926` | bare §25/§6.3/§10/§24/§11/§19 또는 암묵 계약 참조. reference recipe로 옮길 때 모두 06 경로를 명시; 신규 문서의 자체 절로 오독되지 않게 함. |
| `docs/06_platform_ui_contract.md:244,256` | 03의 원천시간, 05의 R/H와 지연완료 정의. 01로 이동 후 새 시간/지연완료 anchor로 바꿈. |
| `docs/03_backend_stack.md:22,37`, `docs/00_overview.md:23` | “04의 딥링크 절”/상태 표현. 04의 옛 절명은 이미 부정확하므로 06 §6.1/§19 + 01 근거 소유로 교체. |
| `docs/04_frontend_ui_ux.md:46,48,70,107` | 06 세부 절/07/03/05. 원천근거 03→01 이동 및 오래된 Open 설명을 함께 갱신. |
| `docs/07_app_shell_wireframe.md:23,105,126,135–136` | `docs/03 L37` 및 06의 시간/URL 절. 줄번호 직접 참조 23행은 특히 깨짐: 01의 상태근거 anchor로 변경. 전역 § 참조의 출처 선언(126)은 보존. |
| `docs/INDEX.md:12–14,19–26,32,38` | 역할/문서 역할 목록. DESIGN·requirements·새 recipe/review를 추가하고 04/05/06의 축소된 책임을 반영. |
| `AGENTS.md:9,13–16,20,24,28–31` | 전역 계약·05·스킬 경로. 기존 authority 유지하면서 DESIGN 책임만 명시. CLAUDE 심링크는 유지. |

### 3.2 상대경로·역사 보고서·토큰 이름의 처리

실제 Markdown 상대 링크를 파싱하고 경로 존재를 확인했다. 지정 원본문서에서 발견한 5개 로컬 링크는 모두 존재했다:

| 위치 | 현재 상대 링크 | 제안에 따른 조치 |
| --- | --- | --- |
| `PLATFORM_REQUIREMENTS.md:7–9` | `.agents/reports/requirements-codex-astra.md`, `requirements-grok.md`, `requirements-omp-glm.md` | REQUIREMENTS를 root에 유지하므로 그대로 유효. 다른 폴더로 옮길 경우에는 재계산 필요. |
| `docs/INDEX.md:38` | `../.agents/README.md` | INDEX 위치 유지하므로 보존. |
| `docs/INDEX.md:42` | `references/standard-log-lifecycle/README.md` | 외부 참고 원본 위치 유지하므로 보존. |

추가 검색에서 `.agents/reports/requirements-codex-astra.md:26`은 `[디자인 시스템](../../DESIGN.md)`로 root DESIGN을 연결한다. root 경로 보존 시 깨지지 않는다. 같은 보고서 29행, `requirements-grok.md:52–53`, `requirements-omp-glm.md:29,33,153–154`에는 이전 240/56/40px 미정렬 상태가 남아 있다. 이는 9/20 역사 조사이므로 **새 값으로 과거 보고서를 재작성하지 않는다**. 현재 INDEX/REQUIREMENTS/05에서 “과거 분석, 9/21 결정으로 해소”라고 연결하고 최신 판정은 05를 읽도록 한다.

이름 기반 참조도 이동 검증 대상이다. `requirements-grok.md:37–60,238–240`과 `requirements-omp-glm.md:15–35,164–166`에는 Colors/Components/Open Decisions/Chart library token mapping/Date preset 의미를 이름으로 인용한다. 역사 보고서 자체의 당시 인용은 보존하되 05/INDEX에서 이관 대응표를 제공한다. `.agents/reports/requirements-codex-astra.md`도 DESIGN alias로 다양한 항목을 인용하므로 파일 링크만 살아 있다고 현재 상태까지 맞는 것은 아니다.

`{colors.primary}`·`components.sidebar-shell`·`components.top-bar`·`components.table-density`와 기존 `{component.*}` 별칭은 첫 이관에서 이름을 바꾸지 않는다. DESIGN:613–614가 단수/복수를 같은 namespace로 설명한다. 문서 재구조화와 토큰 rename을 함께 하면 참조/생성기 영향 검증 범위가 커진다. 현재 제품 런타임이 없다는 INDEX:3의 범위 안에서 문서 소비를 확인했으며, 장래 코드 생성기 동작까지 검증한 것은 아니다.

새 상대 링크는 파일 기준으로 계산한다: `docs/*`에서 root DESIGN은 `../DESIGN.md`, 제안된 `docs/design/reference_dashboard_recipe.md`에서 root DESIGN은 `../../DESIGN.md`, 같은 recipe에서 06은 `../06_platform_ui_contract.md`, root DESIGN에서 recipe는 `docs/design/reference_dashboard_recipe.md`다. 현재 DESIGN:593의 사용자 홈 절대 screenshot 경로는 다른 머신에서 이식 가능하다고 가정하지 말고 출처 기록으로만 보존한다. 이미지를 새로 복사하거나 업로드하는 것은 이번 제안의 실행 범위가 아니다.

## 4. 단계별 마이그레이션 순서

1. **출처·상태 동결과 이관 대응표 준비.** 현재 commit/문서 상태를 기록하고 항목별 “옛 위치→새 위치→상태→근거” 표를 만든다. 05:14의 9/21 결정과 06 §6/§19의 Decided 불변식을 먼저 표시한다. 06의 16행 Candidate 요약과 301행 Decided baseline처럼 상태가 섞인 영역은 수치 변경 없이 적용 범위를 분명히 기록한다.
2. **소유권 지도부터 보강.** INDEX/AGENTS에 06·DESIGN·04·05 경계를 명시하고 root DESIGN/REQUIREMENTS/HANDOFF/역사 reports의 역할을 추가한다. SKILL:76의 stale 환경 단정은 live 확인 규칙으로 바꾼다. 이 단계에서 계약 내용·값은 이동하지 않는다.
3. **빈 껍데기 대신 완결된 목적지 작성.** 제안한 reference recipe와 날짜 있는 review 기록을 실제 이관 내용으로 먼저 채운다. 각 절에 Candidate/역사/현재 canonical 참조를 명시한다. DESIGN의 옛 절은 같은 변경에서 새 문서 링크로 전환해 이중 규범 상태를 남기지 않는다. UI primitives/시각 토큰은 DESIGN에 남긴다.
4. **DESIGN의 비시각 문장을 원본에 연결.** URL/Scope/상태 등 이미 06에 있는 것은 링크로 치환한다. 아직 06에 없는 table-selection 세부는 원래 지위/출처를 보존해 §15에 Candidate로 수용하고 독자적으로 확정하지 않는다. 업무 의미는 02/recipe, 질문은 05, 리뷰 판정은 역사 문서로 각각 이관한다.
5. **시각 중복 원본 정리.** 06 §23의 수치, §7/§15/§25의 geometry를 DESIGN의 기존 토큰/시각 절과 대조해 병합한다. 270/54/32 및 compact/가변 높이 의미를 그대로 유지한다. 06의 절 번호·제목은 유지하고 “이 절은 DESIGN의 시각 규격을 소비한다”는 링크와 행동 계약을 남겨 기존 § 인용을 보호한다. shadow/나머지 geometry의 범위 차이는 Open 질문으로 추적하고 값을 고르지 않는다.
6. **00~05 역방향 책임 정리.** 03/05의 데이터 메커니즘은 01, 04의 도메인 모델은 02로 옮긴다. 06 §6/§19 공개 계약은 제자리에 둔다. 04에는 기술 비교와 검증 근거를 남긴다. 05/REQUIREMENTS/07의 Open 목록은 상태 ID로 연결하고 9/21에 닫힌 항목을 다시 묻지 않게 한다. 원본 알고리즘·미결 숫자·후보 필드명을 요약 중 누락하지 않는다.
7. **참조 전체 sweep과 호환성 검증.** 각 이동 때 직접 소비자를 함께 갱신하고 마지막에는 전체 `rg` sweep으로 놓친 참조를 정리한다. 마지막까지 깨진 링크를 방치하는 방식은 피한다. root 파일명/토큰 키/06 절 번호를 유지하고, 이동된 절에는 필요한 기간 동안 forwarding link를 둔다. “§23”, “Open Decisions”, “딥링크 절”, `docs/03 L37`, `{component.*}` 같은 비링크 참조도 검사한다. 역사 reports는 현재 규범에서 분리하고 당시 기록을 보존한다.
8. **읽기 순서와 내용 보존 감사 후 종료.** 신규 독자가 INDEX→06→DESIGN 또는 04/07을 따라갈 때 원본을 하나만 찾는지 확인한다. 05의 각 상태는 정확한 canonical 절을 가리켜야 한다. 06 Decided 문장의 주체·조건·예외·금지 및 270/54/32 숫자를 전후 대조한다. 로컬 링크/anchor 검사, 토큰 참조 해소, `git diff --check`를 수행하고 미검증(렌더/실데이터/라이브러리 POC)은 분명히 남긴다. 코드 구현·제품 테스트는 이 문서 마이그레이션만으로 완료가 되지 않는다.

이 감사의 완료 기준은 위 네 영역을 포함한 보고서 생성이다. 제안된 목적지 문서 작성, 원본 이동, 링크 변경, 상태 대장 통합은 수행하지 않았다.
