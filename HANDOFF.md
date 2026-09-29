# Handoff — 2026-09-29 다음 세션: 착수 가능한 일 확인

## 먼저 볼 것

- **진행 상황의 원본은 [`docs/ROADMAP.md`](docs/ROADMAP.md)와 고정 이슈 [#63 로드맵](https://github.com/hjung3113/analytics-platform/issues/63)이다.** 이 HANDOFF는 다음 세션 시작점만 적는다. 충돌하면 로드맵을 따른다.
- 작업 규칙은 루트 [`AGENTS.md`](AGENTS.md) "작업 관리"·"화면/UI 설계":
  - 작업은 이슈에서 시작하고 PR에 `Closes #n`(합의 대기 등 열어 둘 때는 `Refs #n`)을 적는다.
  - 확정 시 공통화 판단·문서 갱신·로드맵 갱신을 확인한다. PR 템플릿과 CI `PR checklist`가 강제한다. 로드맵은 이슈를 닫는 PR 안에서 고친다.
  - 공통 UI·셸·토큰의 모양이 바뀌면 인터랙티브 프로토타입으로 사용자 컨펌. 기존 공통 컴포넌트만 조립한 메뉴 화면(견본)은 해당 없음(#60·#50·#49 선례).
- MVP는 데스크톱 웹만. 메뉴 화면은 사내에서 새로 만들 견본이라 다듬지 않는다.

## 현재 상태

- M1 완료. M2(디자인) 보류(FeedbackOps 디자인 확정 뒤, #52 코멘트).
- 2026-09-29 Opus 플랫폼 관점 검토(#100–#104, 추적 #63)에서 #101(라우트 Error Boundary)·#102(`resolveLink`)·#103(차트 주석 Scope 격리·features 준수)·#104(생성기 `--page-type`별 06 §12 슬롯 뼈대, 06 §12.6 패턴·슬롯 후보)를 처리했다. 남은 것은 **#100**(사람 결정)뿐.
- #37 적재 워커 상태 스키마 **초안**(`docs/integration/ingest-status-schema.md`, Candidate)은 파서 담당 합의 대기.
- CI: `Platform workspace`·`Platform contracts (E2E)`(41개)·`CSS selectors (build diff)`·Unit A–C·Python codec·`PR checklist`.

## 다음 세션 할 일

1. 착수 가능한 새 일은 없다 — 남은 이슈는 아래 결정·외부 답 대기이거나 M2 보류다. 사용자에게 다음 방향(결정 이슈 답, 또는 새 플랫폼 갈래 작업)을 확인한다.
2. #104의 레이아웃 슬롯 컴포넌트(Management `filter`/`table`/`drawer`, Analysis `kpi`/`chart`/`breakdown`)는 M2 재개 때 인터랙티브 프로토타입 컨펌 뒤에 올린다(06 §12.6).

## 사람·외부 결정 대기 — 답이 나오기 전에 거기에 기대는 구현을 하지 않는다

- **#100** 메뉴 데이터 조회 포트: 서버 경계 계약을 mock 밖 contracts로(`ready-for-human`).
- #37 파서 담당 합의(스키마 초안). 합의 뒤 #51 모니터링·트레이스 설계.
- #75 활용률 이벤트에 조회조건을 넣을지.
- #81 FeedbackOps 딥링크 확장.
- #84 = FeedbackOps#548 내 설문 응답 읽기 API. 지금 `mySurveyHistory`는 `respondent_history` `unknown`.
- #85 = FeedbackOps#549 신고자용 `view=my&selected=` 딥링크 확인.
- #86 실제 VOC 어댑터 — #59 토큰 공유(디자인 보류) 뒤.
- #90 지표 상세 이력을 감사 저장소로, #91 전역 감사 room 권한 결정.
- **#98** 권한 부여·회수(쓰기)의 원천. 답 전에는 부여·회수 포트, 변경 가능한 mock `USERS`, 두 번째 콘솔 권한을 만들지 않는다.

## 최근 플랫폼 계약

- **차트 주석(06 §16, #103):** 서버 소유, `(chartId, scopeId)` 키. Scope `null`은 "전체 사이트"가 아니다. 저장 실패는 텍스트를 보존하고, 늦게 끝난 저장이 새 초안을 지우지 않는다. Compare·Annotate·Export는 manifest `features`를 따른다.
- **`resolveLink`(06 §22, #102):** 목적지 권한 `allowed`와 사이트 경계(Scope가 바뀌면 site 종속 Context 초기화)를 링크가 안다.
- **Error Boundary(06 §4, #101):** 메뉴 화면 렌더 실패는 콘텐츠 슬롯 안에 갇히고 식별 필드만 `reportClientError`로 보고한다.
- **실제 시점 vs wall-clock (06 §6.3):** epoch·timestamptz는 `formatInstant`, 설비 wall-clock은 `formatDateTime`(naive).
