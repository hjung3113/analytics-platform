# 시작 키트 — 저장소 밖에서 메뉴를 만들어 돌려 보는 프로젝트

이 폴더는 릴리스 자산 `ap-start-kit-<버전>.tgz`의 내용이다. 빈 폴더에 풀면 플랫폼 소스를 복사하거나 고치지 않고 `install`, `dev`, `build`, `check`가 돈다. 플랫폼 패키지 아홉(SDK 다섯과 `@ap/app-host`·`@ap/mock-server`·`@ap/http-adapter`·`@ap/server-conformance`)은 `vendor/`의 tarball로 설치된다. 이 폴더가 곧 반입 묶음이라서 여기의 `pnpm-lock.yaml`이 묶음의 lockfile이다.

## 담긴 것

| 파일 | 설명 |
| --- | --- |
| `src/main.tsx` → `src/start.tsx` | `@ap/app-host`의 `startAppHost`를 부르는 진입. 선언·조립·축·질의 이력을 주입한다 |
| `menus.ts` | 이 키트의 선언 전체: 업무 시스템(`Space`)·그룹·메뉴·권한. 메뉴 패키지는 `MENU_PACKAGES`에 등록한다 |
| `menus/sample/` | 견본 메뉴 패키지. 복사해서 메뉴를 시작한다(아래 «둘째 메뉴») |
| `mock/assembly.ts` | 서버 없이 도는 어댑터 조립(`@ap/mock-server`). 메뉴 패키지의 mock 목록을 `MOCK_ENDPOINTS`에 등록한다 |
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

## 실행

```sh
pnpm dev     # vite dev 서버: 첫 화면(키트 개요)
pnpm build   # 운영 빌드(dist/)
pnpm check   # tsc + vitest 렌더 시험
```

## 둘째 메뉴

견본을 복사해 메뉴를 하나 더한다. 아래 순서는 공개 CI가 스크립트로 똑같이 따라 하고 `check`·`build`가 통과하는지 본다.

1. `cp -R menus/sample menus/second`
2. `menus/second/menu.ts`의 세 상수를 바꾼다: `MENU_ID`(예: `'kit-second'`), `MENU_PATH`(예: `'/second'`), `MENU_LABEL`.
3. `menus.ts`에 `import { manifests as second } from './menus/second';`를 더하고 `MENU_PACKAGES`에 `second`를 넣는다.
4. `mock/assembly.ts`에 `import { mockEndpoints as second } from '../menus/second/mock';`를 더하고 `MOCK_ENDPOINTS`에 `second`를 넣는다.
5. `pnpm check && pnpm build`

화면은 `menus/second/SamplePage.tsx`, 읽는 데이터의 선언은 `endpoints.ts`, mock 응답은 `mock.ts`에서 바꾼다. 화면은 `mock.ts`를 import하지 않는다. 실어댑터 조립이 mock 코드를 싣지 않게 하기 위해서다.

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

이 폴더의 원본은 공개 저장소의 `tooling/sdk/fixtures/out-of-repo-assembly/kit/`이다. `pnpm sdk:consumer-check`는 원본을 아홉 tarball로 조립해 보고, `tooling/sdk/sdk-kit.mjs`가 릴리스 자산을 만들며, `tooling/sdk/sdk-kit-check.mjs`가 그 자산을 빈 폴더에 풀어 위의 설치·실행·둘째 메뉴를 그대로 돈다.
