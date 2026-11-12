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
| 스크립트 | `install`, `dev`, `build`, `check` |
| 설치 재료와 검사 | `vendor/`의 tarball 아홉, `pnpm-lock.yaml`, `third-party.json`, 설치 검사 `sdk-bundle-check.mjs`, `SHA256SUMS` |
| README | 이 글의 내용 |

넣지 않는 것: 새 CLI, 생성기, 메뉴 lint 프리셋([ADR-0142](../adr/0142-out-of-repo-menu-package-and-host-module-split.md) Deferred). 메뉴는 견본을 복사해 만든다.

## 시작 순서

1. 키트를 빈 폴더에 풀고 설치 검사(`node sdk-bundle-check.mjs verify`) 뒤에 `pnpm install --frozen-lockfile`을 돌린다. 사내 npm 미러를 쓰는 환경은 [반입 묶음](../integration/approved-release-bundle.md#설치-검사)의 미러 대조를 먼저 돌린다.
2. `dev`로 첫 화면이 뜨는 것을 확인한다.
3. 견본 메뉴 패키지 `menus/sample/`을 복사해 세 상수를 바꾸고 `menus.ts`와 `mock/assembly.ts`에 등록한다(키트 README «둘째 메뉴»). 둘째 메뉴가 등록된 채 `build`와 렌더가 통과하면 시작이 끝난 것이다. 공개 CI가 이 순서를 스크립트로 따라 한다.
4. 변경마다 `check`를 돌린다.

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
