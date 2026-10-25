# SDK 배포물은 `sdk-v*` GitHub Release에 붙인 다섯 패키지의 빌드된 tarball이다

상태: **Decided (2026-10-20, 결정자: 코디네이터 — 사용자 "ㅇㅋ 니추천댜로 진행하자"에 따른 SDK 다음 슬라이스 [포괄 목록](../integration/sdk-coverage-inventory.md) §5-8. 되돌릴 수 있음)**. [ADR-0044](0044-sdk-source-in-platform-repo-released-separately.md)의 배포 방식 부분을 정한다. 구현은 [#519](https://github.com/hjung3113/analytics-platform/issues/519)(빌드·pack·외부 소비자 게이트), [#520](https://github.com/hjung3113/analytics-platform/issues/520)(공개 API 스냅샷)이다.

사내에는 패키지 레지스트리가 없다([#151](https://github.com/hjung3113/analytics-platform/issues/151)). 그래서 FeedbackOps는 `@ap/ui`를 git 태그 `path:` 의존으로 받는다. 이 방식은 `@ap/ui`가 다른 `@ap/*`에 런타임 의존이 없어서 된다. 나머지 네 패키지는 다르다(2026-10-20 조사, 외부 소비자 시험).

- `kernel`·`components`·`shell`은 서로를 `workspace:*`로 의존한다. 외부에서 git `path:`로 받으면 풀리지 않는다.
- 각 형제를 따로 git URL로 주고 `overrides`를 걸면 경계는 넘는다. 하지만 pnpm 기본값(`blockExoticSubdeps`)이 하위 git 의존을 막는다.
- `contracts`는 `files: ["dist"]`인데 `dist`가 커밋되지 않는다. 그래서 git 설치로 받으면 비어 있다.
- ADR-0044 게이트 ②(build + pack)와 ③(깨끗한 외부 소비자)은 `contracts`에만 있다.

## 결정

- **배포물:** 묶음 태그 `sdk-vX.Y.Z`마다 GitHub Release를 만든다. Release에는 `ap-contracts-X.Y.Z.tgz`·`ap-kernel-…`·`ap-ui-…`·`ap-components-…`·`ap-shell-…` 다섯 파일과 체크섬을 붙인다.
- **버전:** 다섯 패키지가 같은 SemVer를 쓴다(ADR-0044의 고정 그룹). 그 버전은 릴리스 준비 단계가 태그 버전으로 정한다. 형제(`@ap/*`)는 `dependencies`가 아니라 그 버전과 정확히 같은 `peerDependencies`로 둔다(2026-10-26 보충, #806).
- **내용:** ESM JS와 `.d.ts`, CSS(`styles.css` 등)와 자산(`theme-tokens.json`)이 들어간다. `exports`는 `dist`만 가리키고, `react`·`react-dom`은 peer로 둔다.
  - TS 소스·tsconfig·테스트는 넣지 않는다. 그래서 소비자는 SDK 때문에 JSX·`@types/node` 설정을 맞출 필요가 없다.
  - Tailwind 클래스 스캔(`@source`)은 dist 안의 JS를 본다.
- **원본 manifest는 그대로다.** 저장소의 `package.json`은 지금처럼 `private`·소스 `exports`다. 이것은 workspace 개발과 FeedbackOps의 `@ap/ui` git 태그 소비가 쓴다. 배포용 manifest는 릴리스 준비 스크립트가 복사본에서 만든다.
- **소비자:** 쓰는 패키지와 그 형제 peer 전부를 Release URL로 직접 의존한다. `@ap/*` `overrides`는 두지 않는다(2026-10-26 보충, #806). 소비자 조건(`@tiptap/*` 고정, auto-animate 패치)은 [소비 안내](../integration/sdk-git-tag-consumption.md)에 둔다.
- **게이트:** CI가 매 PR마다 다섯 tarball을 만든다. 그다음 깨끗한 외부 소비자가 그것을 `127.0.0.1` HTTP URL로(`blockExoticSubdeps: true`) 받아 install·typecheck·Vite build·작은 vitest·CSS 클래스 생성까지 통과해야 한다(ADR-0044 ②③). 공개 API 스냅샷은 #520에서 같은 tarball의 `.d.ts`로 잰다.
- **업로드:** 릴리스 때 콘덕터가 태그와 함께 Release를 만들고 tarball을 올린다(사용자 위임 2026-10-20). 사내 미러가 필요하면 같은 다섯 파일과 체크섬을 옮긴다(#151).

## Considered Options

- **(A) git 태그 `path:` 의존 + 소비자 overrides, 소스 그대로.** 빌드가 없어 가장 가볍다. 하지만 하위 git 의존이 pnpm 기본 설정에서 막히고, `contracts`는 지금 모양으로 설치되지 않는다. 소비자가 SDK 소스를 컴파일할 설정(JSX·`@types/node`·strict)도 갖춰야 한다. 기각.
- **(B, 채택) Release tarball.** ADR-0044가 정한 빌드 산출물 모양이고, 나중에 레지스트리로 바꿀 때 같은 파일을 그대로 발행하면 된다. 대가는 빌드 설정과 릴리스 준비 스크립트다.
- **(C) 형제 의존을 git URL로 바꾼 생성 브랜치·태그.** 생성 트리와 재현성 검사를 따로 유지해야 하고, 하위 git 의존 문제도 그대로다. 기각.

## 결과

- FeedbackOps의 `@ap/ui` git 태그 소비는 그대로 동작한다. 원하면 tarball로 옮겨도 된다(FeedbackOps 판단).
- EV `platform-adapter`(#332 뒤)는 처음부터 tarball로 받는다.
- 레지스트리가 생기면 같은 다섯 파일을 `@ap` 범위로 발행하고, 소비자는 URL을 `^X.Y.Z`로 바꾼다.

보충(2026-10-26, #806, 소유자 위임 범위의 결함 수정): 처음 판은 형제를 정확 버전 `dependencies`로 두고 소비자가 `overrides`로 Release URL에 고정하게 했다. 그러면 URL로 풀린 `@ap/*`가 하위 의존이 되어 pnpm 기본값 `blockExoticSubdeps`가 설치를 막는다(`ERR_PNPM_EXOTIC_SUBDEP`, `overrides`가 없으면 npm 레지스트리에서 찾다 404). 소비자 검사가 `file:`로 설치해 이를 놓쳤고, EV가 같은 구조로 먼저 만났다(EV ADR-0014). 그래서 형제를 정확 버전 peer로 옮기고, 소비자가 필요한 tarball을 직접 의존하며, 검사가 tarball을 HTTP로 서빙해 URL로 설치한다. `blockExoticSubdeps`를 끄는 길은 공급망 기본값을 버리므로 택하지 않았다.

구현 메모(2026-10-20): `sdk-pack`은 저장소 밖 staging에서 생성 manifest를 만들고, 형제 의존의 `workspace:*` 범위를 태그 버전으로 직접 바꾼다(`pnpm pack` 자체가 바꾸는 것은 아니다). CI의 `sdk:api`는 `pnpm build`가 만든 `packages/*/dist` 선언을 읽으며 tarball 안 `.d.ts`를 직접 읽지 않는다. 스냅샷과 tarball은 같은 export 대상 파생 규칙과 빌드 모양을 공유한다.
