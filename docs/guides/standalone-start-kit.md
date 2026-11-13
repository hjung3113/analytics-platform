# 독립 개발 시작 키트 — 저장소 밖에서 메뉴 하나를 만들어 돌려 보는 길

상태: **Candidate** — 키트가 있다. 릴리스 자산 `ap-start-kit-<버전>.tgz`이고 원본은 저장소 밖 조립 시험의 픽스처 [`tooling/sdk/fixtures/out-of-repo-assembly/kit/`](../../tooling/sdk/fixtures/out-of-repo-assembly/kit/README.md)다([Host 조립 계약](../design/host-entry-contract.md) §10, [#1790](https://github.com/hjung3113/analytics-platform/issues/1790)). 명령과 «둘째 메뉴» 순서의 원본은 키트의 README다. 이 글은 키트가 무엇인지와 지킬 것을 적는다. 사내 적용 가이드 §5를 이 키트로 바꾸는 일은 릴리스 문서 PR에서 한다([ADR-0141](../adr/0141-in-house-assembly-in-separate-repository.md) 발효 조건).

독자: 사내 조립 저장소에서 메뉴를 만드는 개발자([ADR-0141](../adr/0141-in-house-assembly-in-separate-repository.md)). 이 저장소의 `menus/`에 메뉴를 더하는 개발자는 [첫 메뉴 화면 만들기](first-menu-screen.md)를 본다. 규칙의 원본은 링크한 ADR과 계약이다. 이 글은 사용법만 쓴다.

## 키트가 무엇인가

빈 폴더에 풀면 플랫폼 소스를 복사하거나 고치지 않고 `install`, `dev`, `build`, `check`가 통과하는 프로젝트 템플릿이다. 릴리스 자산이고 `SHA256SUMS`에 들어간다. 반입 묶음([승인 릴리스 반입 묶음](../integration/approved-release-bundle.md))과 한 물건이어서 키트의 lockfile이 묶음의 lockfile이다.

| 담긴 것 | 설명 |
| --- | --- |
| Host 조립 파일 | `@ap/app-host`의 조립 함수를 부르는 진입 파일([Host 조립 계약](../design/host-entry-contract.md) §3) |
| 자기 `menus.ts` | 이 키트가 싣는 메뉴와 업무 시스템(`Space`)·그룹·권한 선언. 싣지 않을 공개 견본 메뉴는 import하지 않는다 |
| 견본 메뉴 1 | 복사해서 시작하는 메뉴 패키지 하나(`menus/sample/`: 메뉴 선언, 엔드포인트 선언, mock 핸들러, 화면) |
| mock 조립 | 서버 없이 도는 어댑터 조립(`@ap/mock-server`) |
| 스크립트 | `install`, `dev`, `build`, `build:real`, `check` |
| 실서버 빌드 산출물 | `build:real`이 `dist/`에 웹과 함께 메뉴 선언 스냅샷 `menu-declarations.snapshot.json`을 쓴다. `menus.ts`의 선언과 각 메뉴 `endpoints.ts`에서 만들고 손으로 고치지 않는다. 코어 서버가 선언 묶음을 이 파일과 대조한다(`MENU_DECLARATIONS_SNAPSHOT_FILE`, [ADR-0156](../adr/0156-core-server-checks-the-bundle-against-a-built-menu-snapshot.md)) |
| 설치 재료와 검사 | `vendor/`의 tarball 아홉, `pnpm-lock.yaml`, `third-party.json`, 설치 검사 `sdk-bundle-check.mjs`, `SHA256SUMS` |
| README | 이 글의 내용 |

넣지 않는 것: 새 CLI, 생성기, 메뉴 lint 프리셋([ADR-0142](../adr/0142-out-of-repo-menu-package-and-host-module-split.md) Deferred). 메뉴는 견본을 복사해 만든다.

## 시작 순서

1. 키트를 빈 폴더에 풀고 설치 검사(`node sdk-bundle-check.mjs verify`) 뒤에 `pnpm install --frozen-lockfile`을 돌린다. 사내 npm 미러를 쓰는 환경은 [반입 묶음](../integration/approved-release-bundle.md#설치-검사)의 미러 대조를 먼저 돌린다.
2. `dev`로 첫 화면이 뜨는 것을 확인한다.
3. 견본 메뉴 패키지 `menus/sample/`을 복사해 세 상수를 바꾸고 `menus.ts`와 `mock/assembly.ts`에 등록한다(키트 README «둘째 메뉴»). 둘째 메뉴가 등록된 채 `build`와 렌더가 통과하면 시작이 끝난 것이다. 공개 CI가 이 순서를 스크립트로 따라 한다.
4. 변경마다 `check`를 돌린다.

## 버전 교체와 되돌리기

플랫폼 버전을 N-1에서 N으로 올리는 것도, N에서 N-1로 되돌리는 것도 같은 순서 하나다. 키트를 고쳐 가며 버전을 올리지 않고, 목표 버전의 키트를 새로 풀어 조립 몫만 옮긴다. 호환 범위는 «같은 열차 N, 롤백용 N-1»이다([ADR-0143](../adr/0143-release-units-and-compatibility-train.md)).

키트 폴더의 파일은 두 몫이다. 경계는 `sdk-bundle-check.mjs`의 `ASSEMBLY_PATHS`다.

| 몫 | 파일 | 교체 때 |
| --- | --- | --- |
| 조립 | `menus/`(견본 포함 메뉴 폴더 전체), `menus.ts`, `mock/assembly.ts`, 키트 `SHA256SUMS`에 없는 파일(직접 더한 파일) | 지금 폴더에서 그대로 옮긴다 |
| 키트 | 키트 `SHA256SUMS`에 적힌 나머지 전부: `vendor/`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `patches/`, `package.json`, `third-party.json`, `src/`, `real/`, `index.html`, `vite.config.ts`, `tsconfig*.json`, `sdk-bundle-check.mjs`, README | 목표 키트의 것을 통째로 쓴다 |

키트 몫은 릴리스마다 바뀐다(설정, 진입 파일, 시험 파일이 더해지거나 바뀐다). lockfile은 레지스트리가 있어야 만들 수 있으므로 다시 만들지 않는다. 목표 키트에 실린 lockfile로 `--frozen-lockfile` 설치만 한다. 그래서 키트 몫 파일은 고치지 않는다. 고쳐야 하는 일은 조립 몫으로 옮기거나 [환류 절차](../integration/upstream-feedback-procedure.md)로 공개 저장소에 보낸다.

순서(지금 폴더 `app/`, 목표 키트 `ap-start-kit-<목표>.tgz`):

1. 목표 키트를 **새 빈 폴더**에 푼다. 지금 폴더 위에 풀지 않는다.
   `mkdir app-next && tar -xzf ap-start-kit-<목표>.tgz -C app-next --strip-components=1`
2. 새 폴더에서 설치 검사: `node sdk-bundle-check.mjs verify`(사내 미러를 쓰면 `mirror`도, 키트 README «설치»).
3. 조립 몫을 옮긴다. 두 키트 가운데 **새 버전 키트**의 스크립트로 돌린다.
   - 올릴 때(새 폴더가 새 버전): `cd app-next && node sdk-bundle-check.mjs adopt --from ../app`
   - 되돌릴 때(지금 폴더가 새 버전): `node app/sdk-bundle-check.mjs adopt --from app --bundle app-next`

   `adopt`는 지금 폴더의 조립 몫을 새 폴더에 복사하고, 새 폴더의 견본 `menus.ts`·`mock/assembly.ts`와 지금 폴더에 없는 메뉴 폴더를 지운다. 다만 지금 폴더가 가진 메뉴 폴더 안에서 새 키트만 싣는 파일은 남긴다. 새 키트가 견본 메뉴에 더한 파일(0.35.0-rc.2의 `menus/sample/conformance.ts`)은 통합 담당자가 쓴 적이 없으므로, 그 폴더를 옮긴다고 지우지 않는다. 직접 쓴 같은 경로의 파일이 있으면 그 파일이 이긴다.

   아래 중 하나라도 있으면 두 폴더 모두 아무것도 바꾸지 않고 이유를 모두 적은 뒤 exit 1로 멈춘다. 모든 판정은 첫 변경 전에 끝난다.
   - 지금 폴더에서 키트 몫 파일을 고치거나 지웠다(새 키트가 덮어써서 그 변경을 잃는다).
   - 직접 더한 파일과 같은 경로의 파일을 새 키트가 싣거나, 한쪽은 파일이고 다른 쪽은 폴더다.
   - 새 폴더가 갓 푼 키트가 아니다(`verify` 실패, 또는 키트 `SHA256SUMS`에 없는 파일이 있음).
   - 두 폴더가 같거나 한쪽이 다른 쪽 안에 있다(심볼릭 링크를 풀어 비교한다).
   - 어느 폴더에든 심볼릭 링크나 특수 파일이 있다(`node_modules/`, `dist/` 등 설치·빌드 결과는 보지 않는다).
   - 지금 폴더에 `SHA256SUMS`, `menus.ts`, `mock/assembly.ts`나 `menus/`가 없다.
4. 새 폴더에서 `pnpm install --frozen-lockfile` → `node sdk-bundle-check.mjs installed` → `pnpm check` → `pnpm build`. 메뉴의 적합성 사례는 실어댑터 하네스로도 다시 돌린다([환류 절차](../integration/upstream-feedback-procedure.md) §1).
5. 통과하면 새 폴더가 조립 폴더가 된다. 실패하면 새 폴더를 버리고 지금 폴더를 그대로 쓴다. 실패 원인이 새 키트가 메뉴에 요구하는 것(예: 견본을 복사해 만든 메뉴 폴더마다 `conformance.ts`)이면 메뉴를 고친 뒤 1부터 다시 한다. 견본 메뉴 폴더는 위 규칙으로 새 키트의 파일을 받으므로 고칠 필요가 없다.

되돌리기는 위 순서에 직전 릴리스 키트 `ap-start-kit-<N-1>.tgz`를 넣는 것이다. 옛 폴더를 다시 쓰지 않는다. 그 사이에 바뀐 메뉴도 함께 옮겨지게 하기 위해서다.

- `adopt` 뒤의 폴더에서 `verify`는 조립 몫(`menus.ts` 등)이 키트 `SHA256SUMS`와 달라서 실패한다. `verify`는 1–2단계의 갓 푼 키트에서만 돌린다.
- `adopt`가 없는 키트끼리 바꿀 때는 3단계를 손으로 한다. 새 폴더의 `menus.ts`·`mock/assembly.ts`와 지금 폴더에 없는 메뉴 폴더를 지우고, 지금 폴더의 조립 몫과 직접 더한 파일만 복사한다(같은 경로는 덮어쓴다). 키트 몫 파일은 복사하지 않는다.
- 공개 CI(`tooling/sdk/sdk-upgrade-gate.mjs`)가 이 순서를 그대로 돈다. 직전 릴리스 키트에서 시작해 새 키트로 올리고, 다시 직전 키트로 되돌린다. 각 키트는 그 릴리스의 파일 이름·`SHA256SUMS`·`vendor/` 버전과 맞아야 쓴다. 세 번 모두 `--frozen-lockfile`로 설치하고, 처음 조립 몫 바이트가 세 단계에서 같아야 통과한다. 그 사이 새로 생긴 조립 몫 파일은 키트가 남긴 파일(키트 `SHA256SUMS`와 같은 바이트)만 허용한다.

## 확장 경로

무엇을 하고 싶을 때 어디를 고치는가.

| 하고 싶은 것 | 어디에 | 비고 |
| --- | --- | --- |
| 필터를 더한다 | 메뉴의 page key, 또는 앱이 주입하는 축([ADR-0149](../adr/0149-domain-context-extends-through-namespaced-axes.md)) | `GlobalContext`는 바꾸지 않는다 |
| 데이터를 읽는다 | 엔드포인트 선언 + mock 핸들러 + 서버 쪽 | 서버 쪽은 사내 데이터 서버가 소유한다([ADR-0146](../adr/0146-core-server-loads-in-house-declarations-from-deployment-config.md)) |
| 권한을 정한다 | registry의 메뉴 권한 선언 + 서버가 부여 | 선언은 부여가 아니다 |

## 「mock 통과」 표시

키트로 만든 메뉴는 mock 어댑터로 도는 동안 «mock 통과»로만 센다. 실서버 통과가 아니다. 실서버 쪽(권한 부여, Scope resolver, 전달기)이 구현되기 전에는 실서버 파일럿을 완료로 세지 않는다([#1700](https://github.com/hjung3113/analytics-platform/issues/1700) 결정 4).

## 지킬 것

- 사내 조립 저장소에서는 규정을 확인하기 전까지 외부 클라우드 코딩 에이전트와 원격 LLM을 쓰지 않는다. 공개 CI로 검증할 수 없는 가장 큰 반출 경로이기 때문이다([#1700](https://github.com/hjung3113/analytics-platform/issues/1700) 결정 9).
- 이 키트의 산출물에는 `.map` 파일과 외부 origin이 없어야 한다. `check`가 이를 검사한다.
- 공개 저장소에 올리는 예시와 재현은 합성 이름만 쓴다([ADR-0151](../adr/0151-public-domain-vocabulary-is-frozen-by-an-allowlist.md)). 플랫폼에 되돌려 보내는 방법은 [환류 절차](../integration/upstream-feedback-procedure.md)를 본다.
