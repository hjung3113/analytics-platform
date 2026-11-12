# 시작 키트 — 저장소 밖에서 메뉴를 만들어 돌려 보는 프로젝트

이 폴더는 릴리스 자산 `ap-start-kit-<버전>.tgz`의 내용이다. 빈 폴더에 풀면 플랫폼 소스를 복사하거나 고치지 않고 `install`, `dev`, `build`, `check`가 돈다. 플랫폼 패키지 아홉(SDK 다섯과 `@ap/app-host`·`@ap/mock-server`·`@ap/http-adapter`·`@ap/server-conformance`)은 `vendor/`의 tarball로 설치된다. 이 폴더가 곧 반입 묶음이라서 여기의 `pnpm-lock.yaml`이 묶음의 lockfile이다.

## 담긴 것

| 파일 | 설명 |
| --- | --- |
| `src/main.tsx` → `src/start.tsx` | `@ap/app-host`의 `startAppHost`를 부르는 진입. 선언·조립·축·질의 이력을 주입한다 |
| `menus.ts` | 이 키트의 선언 전체: 업무 시스템(`Space`)·그룹·메뉴·권한. 메뉴 패키지는 `MENU_PACKAGES`에 등록한다 |
| `menus/sample/` | 견본 메뉴 패키지. 복사해서 메뉴를 시작한다(아래 «둘째 메뉴») |
| `mock/assembly.ts` | 서버 없이 도는 어댑터 조립(`@ap/mock-server`). 메뉴 패키지의 mock 목록을 `MOCK_ENDPOINTS`에 등록한다 |
| `real/assembly.tsx` | `@ap/http-adapter`로 bootstrap한 뒤 Host 입력·로그인 이동·연결 실패·요청 제한 화면을 고르는 조립 |
| `menus/<메뉴>/conformance.ts` | 그 메뉴 엔드포인트의 서버 경계 적합성 사례. 폴더를 복사하면 따라온다(아래 «적합성 검사») |
| `src/conformance.test.tsx` | 모든 메뉴 폴더의 적합성 사례를 mock 어댑터로 돌리는 시험 |
| `src/start.test.tsx` | 렌더 시험. `menus/sample`을 복사한 메뉴는 시험을 고치지 않아도 자기 URL에서 렌더되는지 검사된다 |
| `vendor/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `patches/` | 고정 버전 설치 재료. 고치지 않는다 |
| `sdk-bundle-check.mjs`, `third-party.json`, `SHA256SUMS` | 설치 검사와 그 입력 |

`viewer` 역할은 공개 메뉴만 보고, `engineer`(사내 역할)는 `kit:inhouse-view`까지 받아 «사내 업무» 메뉴가 더 뜬다. 권한 선언은 부여가 아니다.

## 설치

```sh
node sdk-bundle-check.mjs verify                        # 체크섬, 아홉 tarball의 정확 버전, lockfile, 설치 스크립트·git·URL 의존 없음
node sdk-bundle-check.mjs mirror --registry <미러 URL>   # 사내 npm 미러에 없는 서드파티 이름·버전을 설치 전에 보고(보고만 함)
pnpm install --frozen-lockfile
node sdk-bundle-check.mjs installed                     # @ap/* 패키지가 하나씩만 설치됐는지
```

필요한 것: Node 26.7 이상, pnpm 11.1.1. 공개 CI는 linux-x64에서만 시험한다.

### 인터넷이 없는 기계에 설치

`vendor/`의 아홉 tarball은 키트 안에 있고, 나머지 패키지는 `third-party.json`에 정확 버전으로 적혀 있다. 서드파티 패키지를 받는 길은 둘이다.

- **사내 npm 미러(기본).** `mirror` 검사로 빠진 패키지가 없는지 먼저 본 뒤 미러를 레지스트리로 두고 `pnpm install --frozen-lockfile`.
- **연결된 기계에서 만든 store.** 설치할 기계와 같은 OS·아키텍처의 연결된 기계에서 `pnpm fetch --store-dir <store>`로 store를 만들어 옮긴 뒤, 설치할 기계에서 `pnpm install --offline --frozen-lockfile --store-dir <store>`. 공개 CI가 이 길을 리눅스 컨테이너 둘(연결된 쪽, `--network none` 쪽)로 매 PR 재현한다.

고정한 서드파티 조건은 `pnpm-workspace.yaml`의 `overrides`(정확 버전 목록)와 `patchedDependencies` + `patches/`다. 설치 스크립트는 `allowBuilds`에 적힌 것만 돈다. 이 셋은 고치지 않는다.

## 실행

```sh
pnpm dev     # vite dev 서버: 첫 화면(키트 개요)
pnpm build   # 운영 빌드(dist/)
pnpm check   # tsc + vitest 렌더 시험
pnpm build:real # 실어댑터 빌드(dist/): vite build --mode real
```

Vite의 `--mode real` 하나로 `#kit-assembly`가 `real/assembly.tsx`를 가리킨다. 기본 `dev`와 `build`는 `mock/assembly.ts`를 쓴다. 실어댑터는 같은 origin의 `/api/v1/platform/bootstrap`을 읽는다. 로그인은 현재 경로와 query를 인코딩해 `/auth/login?return_to=…`로 이동하고, 연결 실패·요청 제한은 상관 번호와 다시 시도 버튼을 표시한다. 실서버와 인증 경로는 배포 환경이 제공한다. `check`는 fake fetch로 네 bootstrap 결과를 검사한다. 공개 `sdk:consumer-check`는 두 mode를 빌드하고 번들 모듈 목록에서 mock 빌드의 http-adapter와 real 빌드의 mock 코드를 거부한다.

## 둘째 메뉴

견본을 복사해 메뉴를 하나 더한다. 아래 순서는 공개 CI가 스크립트로 똑같이 따라 하고 `check`·`build`가 통과하는지 본다.

1. `cp -R menus/sample menus/second`
2. `menus/second/menu.ts`의 세 상수를 바꾼다: `MENU_ID`(예: `'kit-second'`), `MENU_PATH`(예: `'/second'`), `MENU_LABEL`.
3. `menus.ts`에 `import { manifests as second } from './menus/second';`를 더하고 `MENU_PACKAGES`에 `second`를 넣는다.
4. `mock/assembly.ts`에 `import { mockEndpoints as second } from '../menus/second/mock';`를 더하고 `MOCK_ENDPOINTS`에 `second`를 넣는다.
5. `pnpm check && pnpm build`

화면은 `menus/second/SamplePage.tsx`, 읽는 데이터의 선언은 `endpoints.ts`, mock 응답은 `mock.ts`에서 바꾼다. 화면은 `mock.ts`를 import하지 않는다. 실어댑터 조립이 mock 코드를 싣지 않게 하기 위해서다.

## 적합성 검사

메뉴 폴더마다 `conformance.ts`가 그 메뉴가 읽는 엔드포인트의 사례를 낸다. 사례 하나는 엔드포인트 선언과, 권한 있는 세션의 요청이 성공하는 `params`다. 엔드포인트를 더하면 사례도 하나 더한다. `pnpm check`가 `src/conformance.test.tsx`로 모든 메뉴 폴더의 사례를 `@ap/server-conformance`에 넣어 mock 어댑터로 돌린다. 사례가 없는 메뉴 패키지가 있으면 실패한다.

- 판정하는 것: 메뉴 조회 경계(성공 요청, 알 수 없는 키·적용하지 않는 Context 키 거부, 권한 없으면 `forbidden` 등)와 `session`. 나머지 포트(목적지, 주석, 활용률, 콘솔 조회 등)는 플랫폼 몫이라 « — not implemented»로 건너뛴 검사로 남는다. 건너뜀은 통과가 아니다.
- 이 결과는 «mock 통과»다. 사내에서는 같은 사례 목록을 실어댑터와 사내 테스트 계정으로 만든 하네스로 돌린다. 준비할 것은 공개 저장소의 `docs/integration/real-server-checklist.md` §4에 있다.
- 사내 실행 결과·로그·값은 사내에 둔다. 공개 이슈에는 계약 항목 id·상태·일반화한 설명·합성 재현만 싣는다.

## 확장 경로

| 하고 싶은 것 | 어디에 | 비고 |
| --- | --- | --- |
| 필터를 더한다 | 메뉴의 page key(`pageKeys`), 또는 `startAppHost`에 주입하는 축(ADR-0149) | `GlobalContext`는 바꾸지 않는다 |
| 데이터를 읽는다 | 엔드포인트 선언(`endpoints.ts`) + mock 핸들러(`mock.ts`) + 서버 쪽 | 서버 쪽은 사내 데이터 서버가 소유한다(ADR-0146) |
| 권한을 정한다 | `menus.ts`의 메뉴 권한 선언(`KIT_PERMISSIONS`) + 서버가 부여 | 선언은 부여가 아니다 |

## «mock 통과»

이 키트로 만든 메뉴는 mock 어댑터로 도는 동안 «mock 통과»로만 센다. 실서버 통과가 아니다. 실서버 쪽(권한 부여, Scope resolver, 전달기)이 구현되기 전에는 실서버 파일럿을 완료로 세지 않는다.

## 지킬 것

- 사내 조립 저장소에서는 규정을 확인하기 전까지 외부 클라우드 코딩 에이전트와 원격 LLM을 쓰지 않는다. 공개 CI로 검증할 수 없는 가장 큰 반출 경로이기 때문이다.
- 산출물(`dist/`)에는 `.map` 파일과 외부 origin이 없어야 한다. 공개 CI가 이 키트의 빌드를 검사한다.
- 메뉴 lint 프리셋과 메뉴 생성기는 이 버전에 들어 있지 않다(ADR-0142 Deferred). 메뉴는 견본을 복사해 만든다.
- 공개 저장소에 올리는 예시와 재현은 합성 이름만 쓴다(ADR-0151). 사내 `.npmrc`·lockfile·로그·화면은 공개 이슈에 붙이지 않는다.

## 이 폴더를 검사하는 것 (공개 저장소)

이 폴더의 원본은 공개 저장소의 `tooling/sdk/fixtures/out-of-repo-assembly/kit/`이다. `pnpm sdk:consumer-check`는 원본을 아홉 tarball로 조립해 보고, `tooling/sdk/sdk-kit.mjs`가 릴리스 자산을 만들며, `tooling/sdk/sdk-kit-check.mjs`가 그 자산을 빈 폴더에 풀어 위의 설치·실행·둘째 메뉴를 그대로 돌고, `tooling/sdk/sdk-kit-offline.mjs`가 네트워크를 끈 리눅스 컨테이너에서 설치·검사·빌드를 돈다.
