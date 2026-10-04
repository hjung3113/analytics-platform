# 백로그 — 이슈로 올리지 않은 것

우선순위가 낮거나 수요가 확인되지 않은 일이다. 착수하려면 먼저 GitHub 이슈로 올리고 이 줄을 지운다.

## 작은 후속 (확인된 것)

- 표 행 복사(#174, 닫힘) 실확인: 실제 엑셀·구글 시트 붙여넣기, Safari 클립보드, HTTP 경로 실브라우저.
- `@ap/ui`가 쓰지 않는 의존 선언 정리: `@radix-ui/*` 9개·`class-variance-authority`·`clsx`·`tailwind-merge`(소스는 `@fops/ui` 재수출뿐). 지워도 되는지 빌드로 확인.
- lucide 버전 정렬: 플랫폼 `^1.48` / FeedbackOps `0.469`.
- 앱 Tailwind 소스 범위: `apps/platform-web/src/style.css`를 `@import "tailwindcss" source(none)` + 명시 `@source`로 좁혀 Markdown 글자가 CSS를 만들지 않게 할지(#220에서 문서 삭제로 selector 5개가 빠졌다). 바꾸면 CSS selector 비교가 한 번 크게 움직인다.
- 셸 치수 리터럴: 페이지 머리 50px·Context 바 48px가 토큰(`--toolbar-height`) 대신 코드 리터럴이다(값은 같다).
- Context 바에는 Lot·PPID·Recipe·지표 쌍을 새로 지정하는 편집기가 없다 — URL로 받은 값을 지우기만 한다(`GlobalContextBar.tsx`). 도메인 선택지가 정해진 뒤 만든다.
- `AnalysisChartFrame` Compare에 이전 기간 x축 정렬 옵션이 없어 생산성 개요가 bucket index 정렬로 우회한다(`ProductivityOverview.tsx`의 우회 주석).
- 차트 더보기 팝오버(`AnalysisChartFrame`)가 `shadow-md`를 쓴다. DESIGN의 그림자 규칙과 맞는지 확인(공유 floating primitive 전체로 넓히지 않는다는 문장만 있다).

## 설계 원칙 메모

- 대시보드 저장 형식(위젯 배치·설정)은 레이아웃 라이브러리 형식과 분리해 플랫폼이 소유한다 — 대시보드 편집 기능을 만들 때 적용(구 04 "최종 권장안").

## 프로토타입에서 남은 UX 미결

- 필터가 바뀐 뒤 결과 밖으로 나간 선택 행 처리(`PlatformDataTable`).
- 차트 zoom-out / viewport 복귀 어휘.
- Selection Summary와 표 Toolbar의 위치.

## 대표 분석 시나리오 검증 기준 (Candidate)

대표 시나리오(예: 사이클타임 P95 → 느린 실행 목록 → 실행 타임라인)로 지표·필터·식별자·권한·리니지를 한 번에 검증할 때의 기준 후보. 지금 E2E가 일부를 본다.

- 동일 조건의 차트·상세 표·CSV 일치
- 지연 완료 후 일치(재집계 반영)
- 딥링크 왕복(같은 조회조건으로 재방문)
- 권한 변경 후 비노출(캐시가 권한을 무시하지 않음)
- 유효구간 경계 귀속(설비 속성이 바뀐 구간의 데이터가 올바른 속성값에 귀속)

질문: "이 숫자는 어느 데이터까지 반영했고, 어떤 정의로 계산했으며, 무엇을 제외했고, 어떤 설비 실행에서 나왔는가?"

## 검토하지 않은 제안 (2026-09-22 3-모델 요구사항 조사)

채택 결정이 아니다. 필요해지면 이슈로 올린다.

- z-index/오버레이 스택 계약(Dropdown·Popover·Drawer·Modal·Palette·Toast).
- 상태 갤러리 / Storybook(정상·빈값·권한 없음·긴 한글·부분 실패, 토큰·상태 분류 시각 확인).
- 시간역(timeDomain) 매핑 관리 화면 — 복수 설비 병합을 제공하면 필수.
- 지연 완료·정정/backfill 후보 목록 화면.
- 운영 이벤트 뷰어(적재 중단·mart 실패 — 원천이 확인한 사건만).
- 비동기 작업 모니터(내보내기·재집계 상태·취소).
- 마스터 필드 원천 소유권 설정 화면.
- 사용자 온보딩(첫 Scope 선택, Context 개념 안내).
- 메뉴 간 연결 행렬(출발/목적지별 적용·보존·미지원·권한)을 계약 문서에 첨부.
- 공통 키보드 단축키 레지스트리.
- 환경 배너(staging/prod)와 메타데이터 쓰기 경고.
- 레지스트리 필드로 메뉴 점진 노출(feature flag).
- 차트 타입 레시피·허용 목록(시계열·분포·히트맵·구간 타임라인).
- 도식은 도메인 컴포넌트로 유지(반복 확인 전 범용 다이어그램 엔진 금지).
- 접근성 릴리스 게이트(색만으로 상태 구분 금지).
- 브라우저 지원 매트릭스(→ #151).
- 플랫폼 메타 DB 백업/복구 전략(감사·지표 버전 이력).
- 운영 관측/runbook(API 실패·쿼리 지연을 Correlation ID로 연결).
- 쓰기 동시성/중복 실행 정책(마스터 수정, 지표 발행, VOC 전이, backfill 충돌).

## 다른 저장소에서 가져올 수 있는 것 (2026-09-22 조사)

채택 결정이 아니다. 관련 기능 수요가 생길 때 다시 본다.

| 저장소 | 참고할 것 | 확인할 점 |
| --- | --- | --- |
| FileGateway | 설비·기간 기준 원본 로그·설정 파일 조회 | 원문 조회 수요, 권한 전달, wall-clock 매핑. 원문 drill-through는 05에서 defer |
| ProjectGraph | 원본 필드 → 변환 → 출력 컬럼 계보 | 정적 분석과 실행 데이터 구분 |
| standard-log-lifecycle | 모델·검증 회차·결함·재검증 흐름 | 원본 `hjung3113/standard-log-lifecycle` @ `2d2dce25087a6a7b469e60fde448a76b29055041` |
| log-contract-lens | 원본 줄 → 추출 필드 → 진단 근거 | 구현 없음 |
| jira-voc-nexus | 이벤트 재처리 방지, 근거 제한 답변 | 로컬 POC |
| vocpage | 알림 수신자·읽음·반복 억제, 목록/상세 UX | FeedbackOps와 중복 제외 |
| system-survey | 임시저장·첨부·댓글 설문 흐름 | FeedbackOps Survey와 중복 |
