# 시작 키트(out-of-repo assembly kit) — 저장소 밖에서 플랫폼을 띄우는 템플릿

이 폴더는 [#1790](https://github.com/hjung3113/analytics-platform/issues/1790) 시작 키트의 모양을 정의하는 시험 픽스처이다([Host 조립 계약](../../../../../docs/design/host-entry-contract.md) §10.3, 노드 1702d1). `pnpm sdk:consumer-check`가 이 폴더를 저장소 밖 임시 프로젝트로 복사해 아홉 tarball(SDK 다섯 + 릴리스 단위 2 넷)만으로 `install` → `check` → `build` → 렌더 시험을 돌린다. 플랫폼 소스(`apps/`, `menus/`, `platform/`, `packages/`)는 복사하거나 고치지 않는다.

## 담긴 것

| 파일 | 설명 |
| --- | --- |
| `src/main.tsx` → `src/start.tsx` | `@ap/app-host`의 `startAppHost`를 부르는 진입. 선언·조립·축·질의 이력을 주입한다 |
| `menus.ts` | 이 키트의 선언 전체: 공개 합성 메뉴 1(커널 권한 `platform:view`) + «사내 역할» 합성 메뉴 1(메뉴 권한 `kit:inhouse-view`) |
| `mock/assembly.ts` | `@ap/mock-server`의 `createMockAdapter`로 만든 어댑터 조립. 역할은 `setRole('viewer'|'engineer')`로 바꾼다 |
| `vite.config.ts`, `tsconfig*.json`, `index.html`, `src/style.css` | 앱 설정. 스타일은 SDK와 `@ap/app-host`의 `styles.css`를 순서대로 import한다 |

`viewer` 역할은 공개 메뉴만 보고, `engineer`(사내 역할)는 `kit:inhouse-view`까지 받아 사내 메뉴가 추가로 뜬다. 권한 선언은 부여가 아니다.

## 실행

```sh
pnpm install   # 아홉 tarball을 URL 의존성으로 설치 (sdk:consumer-check가 채운 package.json 기준)
pnpm dev       # vite dev 서버: 첫 화면(키트 개요) 확인
pnpm build     # vite production 빌드
pnpm check     # tsc --noEmit (앱 전체) + vitest 렌더 시험(공개/사내 두 역할)
```

## 확장하는 곳

- 메뉴를 더한다: `menus.ts`의 배열에 항목을 더한다(공개 저장소 예시는 합성 이름만 쓴다, ADR-0151).
- 필터·축: 메뉴의 page key, 또는 `startAppHost`에 주입하는 축(ADR-0149). `GlobalContext`는 바꾸지 않는다.
- 실서버: `mock/assembly.ts`를 실제 어댑터 조립으로 바꾼다(키트 시험 범위 밖, 노드 1702i).

## 지킬 것

- 이 키트의 산출물에는 `.map` 파일과 외부 origin이 없어야 한다(부정 시험 노드가 검사한다).
- 메뉴 lint 프리셋은 v0.36.0에 배포되지 않는다(ADR-0142 Deferred).
