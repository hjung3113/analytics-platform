# @ap/components

메뉴가 조립해 쓰는 플랫폼 공통 컴포넌트입니다. 페이지 틀(`PlatformPage`와 Page Archetype 골격), 표(`PlatformDataTable`), 차트 틀과 공통 상호작용, 상태 화면(`QueryView`), 상세 서랍 등이 있습니다.

- **공개 진입점:** `.`(컴포넌트), `./testing`(시험 도우미), `./dock`(호스트 전용), `./styles.css`
- **의존 방향:** `@ap/kernel`·`@ap/ui` 위, `@ap/shell` 아래입니다. 메뉴는 공개 진입점만 import합니다.
- **차트:** TopN·Lane 차트의 사용법은 [docs/charts.md](docs/charts.md)에 있습니다.

처음이면 [첫 메뉴 화면 만들기](../../../docs/guides/first-menu-screen.md)부터 읽습니다. 파일별 설명과 작업 규칙은 [AGENTS.md](AGENTS.md), 계약 원본은 [공통 컴포넌트](../../../docs/contract/components.md)와 [차트 계약](../../../docs/contract/chart.md)입니다.
