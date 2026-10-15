# 메뉴 폴더는 시스템(공간) 아래 그룹으로 나누고 전역 그룹은 `_global`에 둔다

상태: **Decided (2026-10-14)**.
- 결정자: 사용자 — [이슈 #331](https://github.com/hjung3113/analytics-platform/issues/331)에서 선택지 1(코디네이터 추천안)을 선택했다.

IA는 시스템(공간) → 그룹 → 메뉴인데 메뉴 폴더에는 그룹 단계만 드러나면 사내 팀이 자기 시스템의 메뉴를 어디에 얹고 소유하는지 알기 어렵다. 공간을 업무 시스템으로 나누는 [ADR-0026](0026-multi-workspace-app-boundaries-and-feedbackops-scoping.md)과 전역 유틸리티를 공간 밖에 두는 [ADR-0028](0028-workspace-shell-launcher-pinned-feedbackops-global-utilities.md)을 폴더 구조에도 반영한다. 패키지 경계의 원본은 [플랫폼 패키지](../integration/platform-packages.md)이며, 메뉴 작성 규칙은 [menus/AGENTS.md](../../menus/AGENTS.md)다.

## 결정

- 메뉴 패키지는 `menus/<space>/<group>/`에 둔다. 전역 그룹(`space: null`)의 공간 폴더는 `_global`이다. 잎 폴더 이름과 그룹 id가 같을 필요는 없다(`overview`는 `menus/_global/home/`).
- 시스템 목록 `SPACES`는 앱 조립 지점 `apps/platform-web/src/menus.ts`에 둔다.
- 그룹 소속의 원본은 폴더다. `repo-invariants`가 manifest의 소유 그룹과 `GROUPS` 행의 `space`를 읽어 폴더와 일치하는지 검사한다. 등록되지 않은 공간과 한 단계 메뉴 패키지는 거부한다.
- 생성기는 사람이 추가한 `GROUPS` 행의 `space`로 생성 위치를 정하고, `null`은 `_global`로 표현한다. 생성 metadata에 소속을 저장하여 제거 시 실제 위치와 대조한다.
- 패키지 이름, 화면, 라우트와 동작은 바꾸지 않는다. `menus/AGENTS.md`와 그 심링크는 `menus/` 바로 아래에 둔다.

## Considered Options

- **(1, 채택) `menus/<space>/<group>/`**: 트리에서 시스템별 소유·위치를 알 수 있고 기존 workspace와 패키지 경계를 유지한다. 전역 그룹은 `_global`로 드러난다.
- **(2) 소속 선언을 패키지에 둠**: 소속은 표현할 수 있지만 폴더 트리에서는 시스템 구분이 보이지 않는다.
- **(3) 시스템별 저장소**: 사내 운영 방식에 달린 선택이라 지금 고를 근거가 없다.

## 결과

- 새 공간은 앱의 `SPACES` 행과 해당 공간 폴더로 추가한다. 그룹 선언의 소속도 폴더와 일치해야 한다.
- 시스템별 CODEOWNERS와 lint 범위를 폴더에 걸 수 있다.
- 메뉴 패키지 이름으로 조립하는 앱과 플랫폼의 의존 방향은 유지한다.
