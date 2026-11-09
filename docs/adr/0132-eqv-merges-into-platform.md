# 설비 시각화(EV)를 플랫폼에 합친다: 이력은 `products/eqv/`로 보존하고, 패키지는 `packages/eqv/*`로 옮긴다

상태: **Decided (2026-11-10)** — 방향과 배치. 단계별 구현은 #1607의 노드 이슈가 소유한다.
- 결정자: 사용자 — "EV 저장소를 아카이브하고 패키지와 Studio를 모두 이 저장소로 옮길 계획"(2026-11-10), "위 계획을 추천대로 진행합니다. ① Git 이력 보존(`git filter-repo`, 머지 커밋 예외 승인, `#N`은 `EV#N`으로 치환) ② 모델 식별자의 원본은 Hub 카탈로그 ③ `v0.33.0`과 별도 릴리즈 주제"(#1607 댓글, 2026-11-10).
- Supersedes: [ADR-0039](0039-equipment-visualization-platform-first-host-contract.md)와 [ADR-0053](0053-host-module-contract-v1.md)의 "EV는 외부 저장소의 모듈" 서술(호스트 모듈 계약 자체는 유지). EV 쪽은 EV ADR-0001·0012(호스트 경계)·0008(디자인 시스템)·0013·0014(tarball)를 대체한다.
- Scope: [#1607](https://github.com/hjung3113/analytics-platform/issues/1607). 계획 파일은 노드 이슈들의 본문에 있다.

## 맥락

EV는 별도 저장소(`hjung3113/equipment-visualization`)에서 `@eqv/*` 패키지 여섯 개를 tarball 릴리스로 내고, 이 저장소의 `apps/platform-web`이 그 URL 여섯 개를 고정해 쓴다. 그 결과 `pnpm-workspace.yaml`에 정확한 버전 peer 예외가 있고, EV는 `sdk-v0.19.0`에, 플랫폼 tarball은 SDK 0.15.0 peer에 묶여 SDK 버전이 갈라진다. Studio(Onboarding, Layout 편집)는 개발 서버 미들웨어(`/api`)로만 돌아 인증·감사·동시성 보호가 없다. 소유자는 모델별 Top View를 Studio에서 만들고 로그 지식 허브가 가져다 쓰기를 원한다.

## 결정

1. **EV를 이 저장소로 옮긴다.** 코드, Studio, 문서, 테스트(95파일)를 모두 가져오고 EV 저장소는 모두 옮겨진 뒤 소유자 확인을 받아 아카이브한다. 삭제하지 않는다. 옛 AP 태그의 `pnpm install`이 릴리스 tarball을 받아야 하므로 EV 릴리스 파일은 그대로 둔다.
2. **이력은 보존한다.** `git filter-repo`로 `products/eqv/` 아래로 옮기고 커밋 메시지의 `#N`을 `EV#N`으로 바꿔 머지 커밋 하나로 합친다. 이 한 번이 squash 관행의 예외이며 소유자가 승인했다. #592(`products/feedbackops`)와 같은 절차다.
3. **합칠 기준 커밋은 `develop`에 `main`을 합친 끝이다.** EV `main`에만 있는 커밋은 #236 수정의 cherry-pick 하나(`4a35d81`)이고 `develop`의 `21f2a78`과 patch-id가 같다(`65c250a67687`). `develop`에는 `main`에 없는 `#235`(`sdk-v0.19.0` 고정)가 있다. 두 가지는 리허설 복제본에서 `main`을 `develop`에 합쳐 맞추고(충돌 없음 확인), EV 저장소에는 쓰지 않는다. 기준 SHA는 이력 합치기 PR에 적는다(확인 시점: `develop fdb5fa6`, `main 43248b7`).
4. **배치.** 패키지 `packages/eqv/*`(이름 `@eqv/*` 유지), Studio는 개발 도구로 `apps/eqv-studio`, 설계 문서는 `docs/design/features/equipment-visualization/`, EV ADR은 `docs/adr/history/eqv/`에 동결한다. 서버 모듈(`apps/platform-api/src/modules/eqv`)과 `menus/tools/<group>` 화면은 이 결정의 범위 밖이고 별도 슬라이스에서 정한다.
5. **경계는 lint로 강제한다.** `core`·`renderer`는 `@ap/*` 금지(서버가 `@eqv/core`로 같은 검증을 쓰기 위함), `ui`·`views`·`replay`·`editor`는 `@ap/ui`만, `platform-adapter`는 `@ap/contracts`와 `@ap/ui`만. SDK·어댑터·다른 메뉴는 `@eqv/*`를 import하지 않는다. 플랫폼 Kernel과 공통 부품은 설비를 모른다.
6. **식별자와 URL은 바꾸지 않는다.** `eqv:topview`, `eqv:view`, `/tools/eqv-topview`는 저장된 링크가 있어 그대로 두고, `eqv.spec.ts`가 수정 없이 통과하는 것이 회귀 증거다.
7. **모델 식별자의 원본은 Hub 카탈로그다.** Studio의 자유 문자열 `maker`·`model`은 이 결정으로 원본이 아니다. 연결 방식은 서버·Hub 슬라이스에서 정한다.
8. **릴리스.** `v0.33.0`과 따로, 이 이관이 하나의 릴리스 주제다. 옮기는 동안 모든 PR은 `main`을 초록으로 둔다.
9. **이 결정에 들지 않는 것.** 설비 선택기, 서버 `eqv` 모듈과 Studio 파일 API 이전(DB, `defineAction`, 감사, capability), Studio Layouts 화면, Hub 연결, Onboarding 이전, 실서버 재생, Parser는 소유자 계획의 4–11단계이며 아직 시작하지 않았다. 다음 슬라이스를 소유자가 확인하면 각각 이슈로 연다.

## EV ADR의 처리

16개를 전부 동결해 `docs/adr/history/eqv/`로 옮기고 `EV ADR-NNNN`으로 부른다(플랫폼 번호와 겹침, FO ADR과 같은 방식).

| 구분 | EV ADR |
| --- | --- |
| 유효(도메인 규칙) | 0002 Occurrence 입력, 0003 evidence 등급, 0004 세 Layout 그래프, 0005 범위별 alias, 0006 footprint, 0009 Wall-clock, 0011 Revision 해석, 0016 Holding Site 위치 |
| 규칙만 유효, 저장 방식은 새 결정 | 0007 게시 순서, 0010 가져오기 검증, 0015 Template 승격 |
| 대체 | 0001, 0012 호스트 경계, 0008 디자인 시스템(이제 AP 기본 규칙), 0013, 0014 tarball |

코드 주석의 `ADR-00NN` 91곳은 `EV ADR-00NN`으로 바꾼다.

## Considered Options

- **(A) 단순 복사**: 가장 쉽다. 이후 이 저장소에서 일할 개발자가 `git blame`을 잃고 이슈 번호 인용이 끊긴다. 절약되는 일이 작다.
- **(B) tarball 유지**: 지금 비용이 가장 적다. SDK 버전 차이, 정확한 peer 예외, EV 재배포 의존, Studio 별도 배포 문제가 남는다.
- **(C, 채택) 이력 보존 합류**: blob 25.8 MB(EV 팩 3.0 MiB)로 AP 팩 220 MiB에 비해 작고 절차가 #592에서 검증됐다. 머지 커밋이 필요해 squash 관행의 예외 하나를 진다.

## 결과

- `apps/platform-web/package.json`의 tarball URL 6개, `pnpm-workspace.yaml`의 EV peer 예외, `vite.config.ts`의 `@eqv/*` 인라인 변환은 `workspace:*` 전환 노드에서 사라진다. `eqv:pack`, `eqv:consumer-check`, `eqv-release`, 소유자 태그 단계와 `lane:ev`의 tarball 갱신은 쓸모가 없어진다.
- 외부 SDK 소비자가 없어지므로 `sdk:pack`, `sdk-v*` 릴리스의 쓸모는 ADR-0056 결정으로 따로 다시 본다. 이 결정에 묶지 않는다.
- 아카이브 전 조건과 EV 열린 이슈 처리는 [아카이브 점검표](../design/features/equipment-visualization/absorption-checklist.md)가 소유한다.
- 위험: 이력 합치기는 `main`에 한 번 들어가면 되돌릴 수 없다. `#N` 언급 359줄의 치환 오류는 AP 이슈에 잘못 연결되므로 리허설에서 맨 `#N` 0건을 확인한 뒤 합친다. `eqv.*` 엔드포인트가 생긴 뒤의 Site 경계는 #1087 전까지 capability로만 막는다(서버 슬라이스에서 다룸).
