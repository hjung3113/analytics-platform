# 저장소 구조는 갈래별로 정리한다: FeedbackOps 펼치기, `packages/` 묶음, 공간 id 이름 변경, 문서 종류별 폴더

- Status: Decided (2026-10-27)
- Decider: 사용자(2026-10-27 KST, 팀장 추천 승인). 최종 트리 표는 코디네이터 결정이며 되돌릴 수 있다.
- Scope: [#713](https://github.com/hjung3113/analytics-platform/issues/713) 노드 713a, [#712](https://github.com/hjung3113/analytics-platform/issues/712) D1–D5(D6은 이 결정에 포함되지 않는다). 관련: [ADR-0043](0043-platform-sdk-is-the-app-contract-and-unified-framework.md), [ADR-0052](0052-rich-content-stays-in-the-sdk.md), [ADR-0066](0066-feedbackops-merges-into-platform.md).

## 맥락

플랫폼은 층 패키지(`@ap/contracts·ui·kernel·components·shell`), 어댑터성 패키지, 메뉴 Consumer, 서브모듈에서 일반 디렉터리가 된 `products/feedbackops/`(자체 `apps/`·`packages/`), 번호 문서 `docs/NN_*.md`로 자랐다. 갈래(SDK·어댑터·제품·메뉴·문서)가 폴더에서 바로 읽히지 않고, 공간 id `analytics`·`metrics`가 `menus/analytics/analytics`처럼 경로에서 이름을 반복하며, 06 계약 한 파일이 Kernel·컴포넌트·차트·레이아웃·메뉴 간 연결을 모두 쥐고 있다.

## 대안

이슈 #712의 선택지 이름만 적는다.

- **D1 FeedbackOps 위치.** A `products/feedbackops/` 유지 / **B 루트 `apps/`·`packages/`로 펼침(선택)** / C 별도 저장소 분리.
- **D2 메뉴 폴더 깊이.** A 한 단계로 평탄화 / B `menus/<그룹>`만 / **C `menus/<시스템>/<그룹>` 두 단계 유지 + D3으로 이름 반복 해소(선택)**.
- **D3 공간 id.** A 유지 / **B `analytics`→`mars`, `metrics`→`bravo`, 그룹 id 유지, 저장된 공간 재개 키 이행 포함(선택)** / C 그룹 id까지 변경.
- **D4 소유.** **A 그룹 단위 소유 + 시스템·그룹 폴더 `CODEOWNERS`(선택)** / B 시스템 단위 소유 / C 메뉴 단위 소유.
- **D5 메뉴 버전.** A 단일 버전 / B 메뉴 패키지별 발행 / **C 메뉴 패키지별 내부 버전 + CHANGELOG(발행 없음) + 기대는 SDK 버전 범위(선택)**.

## 결정

폴더 방향: 테스트는 기능 폴더 + 폴더 안 `__tests__/`. 층 패키지(`@ap/contracts·ui·kernel·components·shell`)와 의존 방향은 유지하고 패키지 안을 갈래별 폴더로 나눈다(kernel `registry/context/links/scope/audit/query…`, components `table/drawer/chart/archetypes/…`). `packages/`는 `sdk/`·`adapters/`로 한 단계 묶는다(패키지 이름 불변). docs는 종류별 폴더로 나누고 06 계약을 갈래별 문서로 분할하며(내용 불변) 번호를 폐지한다. `prototypes/`는 `archive/`로, `tooling/`은 비패키지를 정리한다.

### 최종 트리 표

| 지금 | 이후 |
| --- | --- |
| `packages/{contracts,ui,kernel,components,shell}` | `packages/sdk/<같은 이름>` (패키지 이름 `@ap/*` 불변) |
| `packages/{mock-server,http-adapter,server-conformance,fo-bridge}` | `packages/adapters/<같은 이름>` |
| `products/feedbackops/apps/{backend,frontend}` | `apps/fo-backend`, `apps/fo-frontend` |
| `products/feedbackops/packages/shared` | `packages/fo-shared` |
| `products/feedbackops/packages/ui` (`@fops/ui`) | `packages/fo-ui` (이름 `@fops/ui` 유지) |
| `products/feedbackops/{AGENTS,CLAUDE,DESIGN,GLOSSARY,PRODUCT,README}.md`, `docs/` | `docs/feedbackops/` (`docs/`의 색인 `README.md`는 `INDEX.md`로; 713p3에서 폴더 `AGENTS.md`도 `docs/feedbackops/AGENTS.md`로 정했다 — 713 계획의 결정, 앱·패키지별 `AGENTS.md`는 `apps/fo-*`·`packages/fo-*`에 그대로) |
| `menus/analytics/*`, `menus/metrics/*` | `menus/mars/*`, `menus/bravo/*` (공간 id도 `mars`·`bravo`; 그룹 id 불변) |
| `prototypes/*` | `archive/*` (CI 작업은 유지하고 경로만 바꾼다) |
| `docs/NN_*.md` (17개) | 종류별 폴더 5+1개(713j): `docs/overview/`(00 개요, 05 결정 상태), `docs/product/`(17 요구사항, 02 도메인), `docs/architecture/`(01 아키텍처·데이터 계약, 03 백엔드, 04 프론트), `docs/contract/`(06), `docs/wireframes/`(07–09·11–13), `docs/design/`(14 드릴다운, 15 다중 워크스페이스, 16 분석 보드). 파일명에서 번호를 뗀다. 번호 약칭("06 §4")은 본문에서 그대로 쓰고 `docs/INDEX.md`의 대응표가 약칭을 파일로 잇는다 |
| `docs/contract/platform-ui-contract.md`(06) | `docs/contract/` 아래 갈래별 문서(Kernel, 공통 컴포넌트, 차트, 레이아웃, 메뉴 간 연결 + 색인; 분할은 713k, 713j는 한 파일 그대로 옮긴다). 06의 `§N` 번호는 분할 문서 안에서 그대로 유지한다(번호 재부여 없음) |
| `tooling/` 비패키지(`scripts`, `sdk-api`) | 713l 브리프가 정한다(경로가 정해지면 이 표에 한 줄 추가) |

### 정책

- **`@fops/ui`.** `@ap/ui` 호환 re-export만 지우고 FO 소비자가 `@ap/ui`를 직접 import한다. FO 도메인 컴포넌트(예: `ManagedSystemPill`)는 `packages/fo-ui`에 남는다 — SDK가 FO 도메인을 알면 ADR-0043·0052에 어긋난다. `@ap/ui` 공개 API는 이 정리에서 바뀌지 않는다.
- **PR 분리.** 순수 이동 PR과 이름 변경(D3)·FO 펼치기(D1) PR은 가른다. 이동은 스크립트를 커밋에 남겨 다른 흐름 PR과 충돌하면 다시 적용한다.
- **순서.** 지금 sdk 흐름이 만지는 `packages/shell/src/board`·`packages/components/src/dock`과 `packages/` 묶음 이동은 맨 뒤에 한다.
- **프로토타입 CI.** 아카이브된 프로토타입의 CI 작업은 유지한다.
- **완료 기준.** 공개 API 변화 0(`sdk:api` 스냅샷·exports), 루트 lint·typecheck·test·build 0, `pnpm docs:links` 0, CI E2E 통과.

D4·D5는 위 폴더 이동 뒤 적용한다: 소유는 시스템·그룹 폴더의 `CODEOWNERS`, 버전은 메뉴 패키지별 내부 버전과 CHANGELOG(발행 없음)이며 각 메뉴 패키지는 기대는 SDK 버전 범위를 적는다.

## 결과와 한계

- 06 계약의 의미는 바뀌지 않는다. 위치와 문서 분할만 정하고 `§N` 번호는 유지하므로 기존 `§N` 인용은 분할 문서에서도 같은 번호로 찾는다.
- 경로 인용(문서·ADR·AGENTS·CI·`CODEOWNERS`)은 후속 노드가 이동과 같은 PR에서 고친다.
- 공간 id 변경은 저장된 공간 재개 키 이행을 포함하며, 이름 변경 PR에서 다룬다.
- 정확한 문서 배치(713j)와 `tooling/` 경로(713l)는 아직 정해지지 않았다. 정해지면 위 표에 한 줄로 되돌려 적는다.

## 되돌리기

이동은 스크립트로 남기므로 역방향 스크립트로 되돌릴 수 있다. 표의 배치는 코디네이터 결정이며 후속 노드 브리프가 근거를 대고 고칠 수 있다.
