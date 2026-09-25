# Unit A work order — App Shell + Menu Registry

상태: bounded prototype 구현. 모든 sample 항목은 **합성 fixture, 실제 메뉴 아님**.
검증 갈래: Kernel의 Shell/Registry/Context/URL 및 메뉴간 Context 연결. 실제 메뉴·업무 화면과 archetype 구현은 하지 않는다.

## 원본 및 revision

기준 commit: `10f270dc58e1b8b03aa4743f55a70848ebc4fbe4` (2026-09-25 확인).
- `AGENTS.md`: 다섯 플랫폼 갈래 및 Premature Platformization 금지.
- `docs/06_platform_ui_contract.md` §4 Kernel 책임, §5 Registry, §6 capability(적용/참조/미지원)와 §6.4 보존, §7 baseline, §8 slots, §28 governance, §29 Platform Done.
- `docs/04_frontend_ui_ux.md` 기술 스택 Candidate: React/TypeScript 기반. 선택은 이 실험에만 유효하다.
- `DESIGN.md` components.sidebar-shell.width=270px, components.top-bar.height=54px; collapsed=64px는 06 §7.
- `prototypes/kernel-context-url-scope/context_url.py`: codec 동등성 기준. 기존 파일 변경 없음.

## USER TASK / 목표 동작

플랫폼 개발자가 데스크톱에서 합성 Context를 선택하고 빈 fixture 라우트를 왕복하여 URL 보존, 미적용 표시, 슬롯 소유권을 검증한다. 데이터 규모는 fixture 3개, 서버 데이터 조회는 0개다. production 권한 검증이나 실제 데이터 분석을 주장하지 않는다.

## IA / SCREEN INVENTORY

Shell → fixture group → sample-overview / sample-analysis / sample-reference.
모두 합성 fixture, 실제 메뉴 아님. 세 항목은 업무 화면이 아니라 서로 다른 capability 조합을 검증하는 빈 라우트다. canonical 업무 navigation IA를 교체하지 않는다.

## WIREFRAME

```
[Sidebar 270/64] [Header 54: Scope | Search ⌘K | Help | User]
[fixture links] [Breadcrumb / title / description / actions]
                [Global Context / contextExtension]
                [content: empty]
                [dataTrustSummary]
```

## COMPONENT MAP / 구조

Shell이 sidebar/header/breadcrumb/global context를 독점한다. PlatformPage는 title, description, primaryAction, secondaryActions, contextExtension, content, dataTrustSummary 일곱 required named slots만 받는다(null 허용). 직접 JSX 속성(children, header 등)은 타입 검사에서 거절되고, spread나 `data-*` 같은 우회는 런타임 exact-key 검사가 막는다. React는 보안 sandbox가 아니므로 악의적인 portal/직접 DOM mutation까지 막는다는 주장은 하지 않는다. page 등록에는 전역 UI renderer가 없다.

## DATA REQUIREMENTS / 입력·출력·실패 조건

- 입력: local URL, 명시 Scope/room/Condition/Selection 변경, Registry 대상.
- 출력: 기존 Python과 95개 parity vector 범위 내 동등성이 검증된 canonical v1 codec URL; shell route adapter로 fixture 경로에 매핑. 미등록 키는 현재 URL에 보존하지만 메뉴 전환에는 전달하지 않는다.
- 원본 codec는 기간/Lot/Recipe/지표/anchor 등을 opaque 미적용으로 보존한다. 이 라운드에서 추가 해석하지 않는다.
- **시간 지원 메뉴 추가 gate:** `from`/`to`를 지원하는 메뉴를 추가하기 전에 §6.3/§6.4의 datetime 형식 검증(`Z` 접미사 거절, 한쪽만 있으면 오류)을 이 codec의 opaque 보존 경로에 실제로 적용해야 한다. 현재 모든 fixture는 time 미지원이며 조회가 없다.
- 95개 parity vector 밖 known divergence 6개 유형은 [README의 비교 표](../../prototypes/kernel-app-shell/README.md#known-divergence-m1)에 기록한다. 전체 입력 공간의 codec 동등성은 주장하지 않는다.
- malformed URL, singleton 중복, alias 충돌, 잘못된 Condition/공집합은 명시 error. 미래 v는 다른 오류보다 먼저 거절하고 URL을 바꾸지 않는다.
- Scope 없음은 선택 필요 상태; 임의 기본 Scope를 채우지 않는다. URL Scope는 권한 증명이 아니다. 실제 grant/server revalidation은 보류되어 어떤 데이터 요청도 실행하지 않는다.
- loading: 비동기 데이터 원천 자체 없음; 빈 content는 실제 조회 결과 empty가 아니다. 공통 dataTrustSummary는 fixture/서버 미검증을 표시한다.

## INTERACTION RULES

- Context 변경과 탐색은 codec 검증 후 URL을 갱신; back/forward는 URL에서 복원.
- Condition 변경 시 Selection 유지(고정 집합); 사용자 명시 선택만 변경. 공집합/부재 구분.
- 지원 여부는 적용 가능/참조/미지원으로 표시; 미지원은 `Not used on this page`. 적용 가능도 서버 검증 완료를 뜻하지 않는다.
- Scope 선택기는 헤더에 단 하나. Command Palette는 Registry 목록과 열기/닫기만; 검색 없음.

## 포함 / 제외

포함: codec 포팅, 3개 합성 fixture Registry, Shell named slots, Context controls, palette stub, 자동 테스트·typecheck·build.
제외: 실제 메뉴/SSO/권한 엔진/데이터 조회/검색 인덱스/차트/테이블/드로어/새 Context 규칙. 원본 계약 및 Python 디렉터리 수정·commit·push 없음.

Registry의 `requiredPermissions`/`requiredScope`는 선언만 하며 Shell의 노출 판단에는 소비되지 않는다. §5/§9의 Permission-aware visibility 구현은 이번 Unit 범위 밖(Deferred)이다. 클라이언트 노출 판단은 서버 권한 엔진과 별개로 구현 가능하며, 계약 자체가 Open인 것이 아니라 이번 Unit의 구현 범위를 보류한 것이다.

## Platform Done 수용 사례 (§29)

| 기준 | 증거 및 한계 |
| --- | --- |
| 공통 계약 | Registry 필드, slot 타입 음성 테스트, canonical shell 치수 검사 |
| Context 연결 | 3개 fixture 이동 후 registered context 보존, unsupported/reference 구분, back 복원 |
| 권한/Scope 일관성 | URL scope 유지/선택 필요/미검증 표시; 실제 서버 권한 검증은 미구현·조회 없음 |
| 공통 상태 | codec 오류 alert와 fixture Data Trust 표시; loading/조회 empty는 해당 없음 |
| 재사용 책임 | Shell/Registry/codec만 추출; 범용 plugin framework 없음 |
| Domain 경계 | content는 null, 업무 계산·CRUD 없음 |

## DESIGN DECISIONS / UX REVIEW

Decided 치수를 소비한다. 라이브러리/필드 타입/fixture 경로 adapter는 Candidate 실험이다. 키보드 focus, palette Escape/초점 복귀, 명시 label, 좁은 창 overflow를 확인한다. 실제 데이터 기반 성능·브라우저 시각 검토는 별도 검증 범위다.

## 사용자 확인 필요

| # | 상태 | 보류 항목 | 이번 구현 |
| --- | --- | --- | --- |
| 1 | Open | 실제 SSO와 서버 권한/Scope 재검증 연결 | 인증·조회 없음 |
| 2 | Open | Scope 선택지 실제 데이터 원천과 계층 상속 | 명시 합성 값만 |
| 3 | Deferred | 전역 검색 인덱스 및 Command Palette 실검색 범위 | Registry 목록만 |
| 4 | Candidate | 조건 편집 시 기존 Selection 처리 제품 UX(06 §6.4) | 자동 변경 없이 유지 |
| 5 | Decided (2026-09-25, [docs/04_frontend_ui_ux.md](../../docs/04_frontend_ui_ux.md) §프론트엔드 기술 스택) — production stack 자체는 확정됨. 단, **이 Unit의 구현은 그 스택과 다르다**: React+TS+Vite는 일치하지만, 라우팅은 TanStack Router 대신 Browser History + 자체 codec adapter, 서버 상태/전역 상태는 Query/Zustand 미사용(빈 fixture라 불필요), UI 컴포넌트는 shadcn/ui 미이식(자체 CSS) | README가 이 divergence를 이미 명시: "TanStack Router는 검토 대상이지만 이번 실험에서는 채택하지 않았다"; 이식은 별도 후속 작업(HANDOFF 우선순위 2) |
| 6 | Deferred (구현 범위) | 기간·지표 등 profile 밖 Context의 이 prototype 구현 범위 보류; §6.3 datetime 형식, §6.4 한쪽만 있는 from/to 거절, §6.1 metricId+metricVersion 쌍 계약은 이미 Decided | 원본 codec처럼 opaque 미적용 보존; 시간 지원 전 위 gate 필수 |
| 7 | Open (별도 수정 필요) | Python 원본 codec의 Unicode 서로게이트 처리 버그: Condition의 `\ud800` 직렬화 시 ContractError가 아닌 UnicodeEncodeError 발생; 별도 수정 필요 | 버그 기록만; 기존 Python 파일은 수정하지 않음 |
| 8 | Deferred (구현 범위) | §5/§9 Permission-aware visibility: Registry requiredPermissions/requiredScope를 소비하는 Shell의 클라이언트 노출 판단 | 필드 선언만, Shell은 소비하지 않음; 서버 권한 엔진과 별개로 이번 Unit 범위 밖 |

총 8개. 원본의 Candidate/Decided 계약 상태를 유지하며, Open 후속 항목과 Deferred 구현 범위를 구분해 coordinator의 최종 사용자 확인 목록에 합친다. #7의 Open은 확인된 버그의 존재가 아니라 별도 수정의 범위·일정에 대한 후속 확인이다.

## 실행 결과

- `prototypes/kernel-app-shell/` 구현 완료: 모든 content slot은 null이며 업무 화면 없음.
- Python 원본에서 읽기 전용 생성한 95개 벡터와 대조; 자동 테스트 **109개 통과**.
- `npm run typecheck` 통과: children/header/누락 slots 음성 타입 사례 포함.
- `npm run build` 통과: Radix `use client` directive 무시 경고만 발생(CSR build).
- 이전 구현 라운드에서 Vite 개발 서버 `/sample-analysis` 및 변환된 `/src/App.tsx` HTTP 200 확인 후 서버 종료; 이번 문서 정정 라운드에서는 HTTP smoke를 재실행하지 않음.
- 이번 문서 정정 라운드에서 `npm ci --cache .npm-cache --no-audit --no-fund`, parity 생성, typecheck/test/build를 재실행. 명령·출력: `prototypes/kernel-app-shell/verification.log`.
- 실제 브라우저 시각 검토, SSO/실제 데이터/권한 연동은 수행하지 않음. 이 bounded Unit 완료와 production Platform Done은 구별한다.
- 원본 계약·기존 Python 디렉터리의 Git diff 없음. commit/push 없음.
