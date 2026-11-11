# Host 조립 계약 — 저장소 밖 조립이 받는 도메인 없는 조립 함수 (#1702)

상태: **Candidate** — 설계. 결정은 [ADR-0141](../adr/0141-in-house-assembly-in-separate-repository.md)(방향), [ADR-0142](../adr/0142-out-of-repo-menu-package-and-host-module-split.md)(확장 방식), [ADR-0143](../adr/0143-release-units-and-compatibility-train.md)(릴리스 단위)가 소유하고, 이 문서는 그 결정을 따르는 Host 쪽 모양과 다음 노드의 수용 목록을 소유한다. 구현은 없다.

용어: 여기서 «Host»는 조립 함수와 그 릴리스 단위다. 셸·앱만 import하는 `@ap/kernel/host` 진입점([ADR-0076](../adr/0076-kernel-host-entry-narrow-menu-platform.md))과 호스트 모듈([ADR-0053](../adr/0053-host-module-contract-v1.md))과는 다른 것이다.

범위: [#1702](https://github.com/hjung3113/analytics-platform/issues/1702). 서버 쪽 절반은 [#1729](https://github.com/hjung3113/analytics-platform/issues/1729)(§9). 읽은 문서: [SDK 외부 확장 설계](sdk-external-extension.md)(#428 보류, §4.2·§8 기각), [ADR-0009](../adr/0009-production-assembly-injection.md), [ADR-0052](../adr/0052-rich-content-stays-in-the-sdk.md), [ADR-0053](../adr/0053-host-module-contract-v1.md), [ADR-0131](../adr/0131-sdk-consumer-skill-and-intent-table.md), [ADR-0132](../adr/0132-eqv-merges-into-platform.md), [platform-packages.md §3](../integration/platform-packages.md).

## 1. 목적

사내 조립 저장소가 이 저장소를 고치지 않고 플랫폼을 띄우는 입구를 정한다. 입구는 «도메인을 모르는 조립 함수» 하나다. 공개 앱 `apps/platform-web`이 첫 소비자이며 화면은 바뀌지 않는다.

## 2. 현행

- `apps/platform-web/src/menus.ts`는 메뉴 패키지를 정적으로 import하고 `GROUPS`·`SPACES`·`PERMISSIONS`를 직접 선언한 뒤 `createRegistry`를 한 번 부른다. 조립은 이 앱 파일 안에 있다.
- `apps/platform-web/src/main.tsx`는 `@ap/feature-bridge`의 slot(저장된 뷰, Scope 조작, 알림)과 특정 메뉴 패키지의 slot을 직접 import한다. 주입 지점은 어댑터 조립 하나다([ADR-0009](../adr/0009-production-assembly-injection.md), `AP_PLATFORM_ASSEMBLY`). registry는 주입 대상이 아니다.
- `createRegistry`는 공간·그룹·메뉴 id 중복, 경로 중복, 예약 루트, 선언되지 않은 권한, 모듈 접두사 위반을 시작 때 거부한다(`packages/sdk/kernel/src/registry/registry.ts`). `mountModule`은 계약 정수, 필수 기능, 설정 키, 접두사, 화면 대응을 검사한다(`packages/sdk/kernel/src/registry/module.ts`).
- 버전·의존 검사는 계약 정수 하나뿐이다. `ModuleManifest`에는 `module.contract`(`HOST_CONTRACTS = [1]`), `requires`/`optional`(`HostFeature`), `config`만 있다(`packages/sdk/contracts/src/host/host.ts`). 모듈 semver, SDK 버전 범위, 의존 목록, 대체·비활성은 없다.
- 지금 저장소 밖에서 조립되는 것은 없다. 유일한 «외부 모듈» 선례였던 EV는 [ADR-0132](../adr/0132-eqv-merges-into-platform.md)로 workspace 패키지가 됐다.

## 3. 계약

1. **Host는 도메인을 모르는 조립 함수다.** 입력은 조립자가 주입한다: registry에 넣을 선언(업무 시스템(`Space`)·그룹·메뉴·권한), 어댑터 조립, 셸 slot, 축. 출력은 띄울 수 있는 앱이다. 함수 이름과 정확한 모양은 구현 노드가 정한다(후보 이름 `app-host`, #1702 본문).
2. **slot은 조립자가 주입하고 SDK가 import하지 않는다.** 저장된 뷰, Scope 조작, 알림은 지금 `@ap/feature-bridge` slot이고 그 패키지는 `@ap/feature-screens`에 의존한다. Host가 이를 품으면 SDK가 기능 패키지를 import하게 되어 [platform-packages.md §3](../integration/platform-packages.md) 규칙 8을 어긴다. 그래서 slot은 선택 주입이고, Host는 `platform/*`와 `@ap/feature-bridge`를 import하지 않는다(구현 노드가 경계 lint로 검사한다).
3. **우선순위·replacement·overlay 규칙이 없다.** 사내 조립이 자기 `menus.ts`를 가지면 싣지 않을 공개 견본 메뉴는 import하지 않는다. 같은 id를 두 번 등록하면 지금의 `createRegistry` 거부가 그대로 막는다. 플랫폼 기능 패키지(`platform/*`)를 사내가 그대로 쓸지는 [ADR-0143](../adr/0143-release-units-and-compatibility-train.md) Deferred에 둔다.
4. **계약 정수 하나가 호환 검사다.** «capability/feature negotiation»은 새 협상을 만들지 않고 `HostFeature`를 넓히는 것으로만 쓴다. 호환은 «같은 열차 N, 롤백용 N-1»이다(ADR-0143).
5. **공개 앱 `apps/platform-web`이 첫 소비자다.** Host 추출 뒤에도 기존 E2E가 통과해야 하고 화면 차이가 없다. UI 시안이 필요 없다.

## 4. 무결성 검사이지 보안이 아니다

Registry 검사와 위 §3의 거부는 실수를 막는다. 같은 JS 프로세스의 확장은 `@ap/kernel/host`, 공유 조회 캐시, 전역 CSS에 닿을 수 있어 보안 경계가 아니다. 문서와 수용 기준은 «탈취 거절»이 아니라 «무결성 검사»로 쓴다. 보안 판정은 서버가 하고 그 시험은 [#1705](https://github.com/hjung3113/analytics-platform/issues/1705)에만 둔다. 권한 선언은 부여가 아니다.

## 5. 단일 사본 검사

조립이 `@ap/*` N을 고정하고 확장이 N-1 peer로 빌드되면 `@ap/kernel`이나 조회 엔진이 두 벌 실려 Provider를 못 찾거나 캐시가 둘이 될 수 있다. 확장은 peer만 쓴다. 조립 빌드는 사본 수를 검사하고, 이는 `pnpm sdk:consumer-check`가 하는 단일 사본 검사를 재사용한다.

## 6. CSS

패키지마다 `styles.css`의 `@source`를 앱 CSS가 순서대로 import한다(`apps/platform-web/src/style.css`). 확장이 자체 Tailwind preflight나 `:root` 토큰을 내면 모든 화면이 바뀐다. 확장의 규칙은 둘이다: 소스 클래스만 내고 토큰을 정의하지 않는다.

## 7. 없어진 메뉴의 저장물

메뉴가 빠진 뒤 그 메뉴의 저장된 뷰, 최근 방문, 보드 칸은 지우지 않고 «사용할 수 없음»으로 보인다. 보드는 더 새 버전을 읽기 전용으로 여는 처리가 있다(`packages/sdk/shell/src/board/boardStore.ts`). 저장된 뷰의 «없는 메뉴» 처리는 아직 확인하지 못했다. 시험 대상이다(§10).

## 8. 소유자 확인 뒤에 한다

`mountModule`의 `features` 기본값은 `['query', 'detailSlot', 'write']`이고 조립자가 생략하면 쓰기가 켜진다. 기본값을 빈 목록으로 바꿀지는 공개 SDK 기본값 변경이라 소유자 확인 뒤에 한다. 이 문서는 바꾸지 않는다.

## 9. 서버 쪽 절반은 방향만 적는다

코어 서버에 사내 확장을 싣는 방법은 [#1729](https://github.com/hjung3113/analytics-platform/issues/1729)가 소유하고 구현하지 않는다. 방향 메모(추천, 결정 아님): 사내 서버 코드를 코어 서버 프로세스에 넣지 않고 엔드포인트·동작 선언, 소유자 표, 권한 규칙을 배포 설정으로 읽는다. 권한 부여 경로는 서버 설정 표(P5-b)이며 [#1087](https://github.com/hjung3113/analytics-platform/issues/1087)·[#1667](https://github.com/hjung3113/analytics-platform/issues/1667)과 함께 정한다. 그 전에는 파일럿을 mock 통과로만 센다.

## 10. 저장소 밖 조립 시험 계획 (다음 노드의 수용 목록)

`pnpm sdk:consumer-check`(저장소 밖 임시 프로젝트에 tarball 설치 → tsc·Vite 빌드·Vitest)를 넓혀 아래를 CI에서 돌린다. 이 시험의 통과가 [ADR-0141](../adr/0141-in-house-assembly-in-separate-repository.md)의 발효 조건이다.

1. **Host 조립 함수 추출.** `apps/platform-web/src/main.tsx`·`app-root.tsx`의 조립을 §3의 Host로 옮긴다. 공개 앱이 첫 소비자이고 기존 E2E가 통과한다.
2. **릴리스 대상 추가.** Host, `@ap/mock-server`, `@ap/http-adapter`, `@ap/server-conformance`를 tarball로 낸다. 무결성은 `SHA256SUMS`.
3. **저장소 밖 조립.** tarball만으로 Host + 공개 합성 메뉴 1 + «사내 역할» 합성 메뉴 1(시험 픽스처 안에만 있는 패키지)을 조립하고 tsc, 빌드, 화면 띄우기를 한다.
4. **왕복 하나.** 사내 역할 메뉴가 다른 축 묶음 1, 자기 page key 필터 1, mock 엔드포인트 1(`Trust`·`MeasureMeta` 포함), 메뉴 뷰 저장·복원 1회를 쓴다. `GlobalContext`는 바꾸지 않는다.
5. **부정 시험.**
   - 중복 메뉴 id.
   - 선언되지 않은 권한.
   - 지원하지 않는 계약 정수.
   - 필수 `HostFeature` 누락.
   - 없어진 메뉴의 저장된 뷰(지우지 않고 사용 불가로 표시, §7).
   - 모르는 URL 키 보존.
   - `@ap/kernel` 사본이 둘이면 빌드 실패(§5).
   - 네트워크 없는 설치.
   - 산출물에 `.map`과 외부 origin이 없음.
6. **업그레이드 게이트.** 같은 픽스처를 직전 릴리스와 이번 릴리스 tarball로 각각 빌드한다. 조립 코드 변경 0줄이 기준이다.

통과 신호: 위 CI 작업이 초록, 오프라인 설치의 외부 요청 0건, 공개 파일에 대한 patch 0개, 각 검사를 끄면 해당 시험이 실패.

## 11. 하지 않는 것과 이관 대기 결정

하지 않는 것(구현 안 함, 모두 다시 여는 조건과 함께):

| 항목 | 이유 | 다시 여는 조건 |
| --- | --- | --- |
| `GlobalContext` 변경, 도메인 Context 구현 | 결정 5·6은 ADR만 필요하고 구현은 [#1703](https://github.com/hjung3113/analytics-platform/issues/1703)(진행 중인 #1666 뒤) | #1666 병합 |
| 시맨틱 계약 구현 | [#1704](https://github.com/hjung3113/analytics-platform/issues/1704), ADR-0082 보충 초안만 | #1666·#1672 뒤 |
| P1·P2 전부([#1707](https://github.com/hjung3113/analytics-platform/issues/1707)–[#1714](https://github.com/hjung3113/analytics-platform/issues/1714)) | 소비자가 없거나 보류된 원본 위에 있다. `on-hold`와 다시 여는 조건은 각 이슈 보강 절 | 각 이슈의 보강 절 |
| SBOM, provenance | [ADR-0143](../adr/0143-release-units-and-compatibility-train.md) Deferred | #151 답 |
| 서버 조립 구현 | §9 | #1729 결정 뒤 |
| 공개 메뉴 대체·비활성 | [ADR-0142](../adr/0142-out-of-repo-menu-package-and-host-module-split.md) | 조립자와 대상 소유자가 다른 조립 |

소유자가 «추천대로»로 답했고 아직 ADR이나 소유 문서로 옮기지 않은 결정(후속 이슈가 착수될 때 각각 옮긴다):

| # | 결정 | 추천 | 옮길 곳 |
| --- | --- | --- | --- |
| 4 | 사내 메뉴 권한 부여 경로(P5) | 서버 설정 표(P5-b), #1087·#1667과 함께. 정하기 전에는 파일럿을 mock 통과로만 센다 | #1087, #1729 |
| 5 | 도메인 Context 확장 방식 | Kernel `ContextKey`를 늘리지 않는다. [ADR-0059](../adr/0059-app-injected-equipment-axes-and-condition.md)의 주입 축을 네임스페이스 축으로 일반화, URL `v=1` 유지, 기존 고정 키는 읽기 호환 | #1703 |
| 6 | 메뉴 간 전달 규칙 | 기존 키는 현행 유지. 새 도메인 축만 양쪽이 같은 정의를 선언했을 때 전달 | #1703, [#1708](https://github.com/hjung3113/analytics-platform/issues/1708) |
| 7 | 분석 서버 위치 | 골격·합성 핸들러·적합성은 공개, 실제 핸들러는 사내. [ADR-0095](../adr/0095-dual-backend-fastify-core-fastapi-analytics.md)에 한 줄 보충 | [#1704](https://github.com/hjung3113/analytics-platform/issues/1704), #1729 |
| 8 | 공개 저장소의 기존 도메인 어휘([#232](https://github.com/hjung3113/analytics-platform/issues/232)) | 지금 있는 것을 허용 목록으로 동결하고 검사는 «목록 밖 신규 금지» | #1705, [#1706](https://github.com/hjung3113/analytics-platform/issues/1706) |
| 9 | 사내 조립 저장소의 외부 클라우드 코딩 에이전트 사용 | 사내 규정 확인 전에는 쓰지 않는 것을 기본값으로 | #1705 |
| 10 | «외부 AI·임베딩 호출 금지»를 플랫폼 규칙으로 | ADR 한 건으로 올리고 사내 프로필에서 외부 공급자 설정을 거부하는 시작 검사로 지킨다 | #1705, [#1711](https://github.com/hjung3113/analytics-platform/issues/1711), [#1714](https://github.com/hjung3113/analytics-platform/issues/1714) |
| 12 | P1·P2 처리 | `on-hold` + 다시 여는 조건 | #1707–#1714 |
| 13 | v0.36.0 범위 | §10과 [ADR-0143](../adr/0143-release-units-and-compatibility-train.md) | 이 문서 |

#428은 소유자가 2026-11-11 닫았다(not planned, `질문 #1702`): [설계 §4.2·§8](sdk-external-extension.md)이 모두 기각이라 ADR-0141 아래에서 낼 것이 없고, 저장소 밖 조립 시험 노드(§10)가 대체한다. 다시 여는 조건: 저장소 밖 패키지가 정적 조립으로 풀 수 없는 확장 지점을 실제로 요구할 때.
