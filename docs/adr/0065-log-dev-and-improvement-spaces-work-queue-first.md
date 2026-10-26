# ADR-0065 — 표준 로그 개발·개선 실행 공간: 내 작업 우선 메뉴 구성

- Status: Decided (2026-10-21)
- Decider: 사용자(공간 메뉴 구성 소유자) — 실제 앱 시안 A/B/C 중 C 선택("니 추천대로 하자")
- Scope: #252, 지도 #249, 설계 [15 §2](../design/multi-workspace-ui.md#2-정보-구조ia)

## 맥락

두 공간은 전환기의 `준비 중` 칸에만 있었다. 셸은 공간의 그룹을 레일 섹션으로, 사이드바를 고른 섹션의 메뉴로 그린다([ADR-0042](0042-system-switcher-and-system-owned-rail.md)). 화면 없이 Registry에 선언한 메뉴는 `예정`으로 보인다(06 §17). 정할 것은 메뉴를 무엇 기준으로 나누는가였다. 설비 모델이 수십 개이고, 엔지니어가 같은 검증을 반복한다. 사례 조사(qTest·Xray, Azure Test Plans·TestRail·Minitab Engage, Atlassian 새 내비게이션·KaiNexus)와 실제 앱 캡처 비교는 [시안 아티팩트](https://claude.ai/artifact/FGQLBJKPWpc1EYCpK5R2pi)에 있다.

## 결정

C — 내 작업 우선. 첫 화면은 내게 배정된 일이고, 한 모델(과제)의 단계·회차·내보내기는 그 상세 안에 둔다. 여러 모델을 가로질러 봐야 하는 것만 메뉴로 올린다.

| 공간 (`SpaceDef.id`) | 그룹 (레일 섹션) | 메뉴 |
| --- | --- | --- |
| 표준 로그 개발 (`log-dev`) | 내 작업 `logMyWork` | 내 검증 대기(첫 화면) · 최근 모델 |
| | 모델 `logModels` | 모델 목록 — 상세 안에 단계 → 검증 Round → 재검증 · 협력사 검토 XLSX |
| | 전체 모아 보기 `logCross` | 결함 큐 · 협력사 검토 현황 |
| | 기준 `logRules` | 검증 규칙 |
| 개선 실행 (`improvement`) | 내 작업 `impMyWork` | 내 과제(첫 화면) |
| | 과제 `impTasks` | 과제 목록 — 상세 안에 적용 → 전후 실적 → 효과 검증 |
| | 보고 `impReports` | 효과 보고서 · 설비별 적용 이력 |

함께 정한 기본값(사용자 확인, 2026-10-21):

- 서버·적재·파서 파이프라인 운영은 운영 콘솔, 로그 **내용**의 검증·결함은 표준 로그 개발이 맡는다.
- 기존 메뉴 귀속은 [ADR-0028](0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md) 그대로다.
- 공간 진입 권한은 두지 않고(모든 로그인 사용자), 메뉴 권한은 `platform:view`다. 실제 권한 이름은 사내 SSO 역할(#150)이 정해지면 붙인다.

## Considered Options

- **A — 객체 중심(qTest식):** 모델·Round·결함·규칙마다 메뉴. 모델 수와 무관하지만 한 모델의 현재 단계가 한눈에 보이지 않는다.
- **B — 단계 중심(Azure Test Plans·DMAIC식):** Kickoff·Alpha·Beta·Complete가 메뉴. 흐름은 보이지만 같은 모델 목록이 단계별로 갈리고 모델이 단계를 넘으면 메뉴가 바뀐다.
- **C — 내 작업 우선(채택):** 메뉴가 가장 적고(6 · 4), 반복 검증의 다음 일로 가장 짧게 간다.

## 결과

- 두 공간을 Registry에 등록하고 메뉴는 모두 `예정`으로 둔다. 화면은 사내에서 만든다(루트 `AGENTS.md`). 그룹마다 계획 메뉴만 가진 패키지(`menus/log-dev/*`, `menus/improvement/*`)가 그룹을 소유한다.
- 전환기 `준비 중` 칸에서 두 공간을 뺀다(CLAS만 남는다).
- FeedbackOps Managed System 매핑(ADR-0045)은 두 공간에 아직 없어 바닥 블록을 그리지 않는다. 매핑이 생기면 `FEEDBACKOPS_MANAGED_SYSTEMS`에 더한다.
- 대가: 모델 상세가 단계·Round·내보내기 탭으로 무거워지고, `내 작업`은 담당자 배정 데이터가 있어야 의미가 있다. 둘 다 화면을 만들 때 다시 본다.
