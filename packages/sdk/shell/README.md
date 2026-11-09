# @ap/shell

앱 셸입니다. 레일, 사이드바, 페이지 머리, Context 바, 상세 슬롯 같은 화면 바깥 틀을 그립니다. 메뉴 목록은 주입된 Registry에서, 선택지와 세션은 어댑터에서 읽습니다.

- **공개 진입점:** `.`(셸 컴포넌트), `./styles.css`
- **의존 방향:** SDK에서 가장 위 층입니다. 앱(`apps/platform-web`)이 이 패키지로 화면을 조립합니다. 메뉴 화면은 이 패키지를 직접 import하지 않습니다.

처음이면 [첫 메뉴 화면 만들기](../../../docs/guides/first-menu-screen.md)부터 읽습니다. 파일별 설명과 작업 규칙은 [AGENTS.md](AGENTS.md), 셸 설계는 [07 App Shell](../../../docs/design/app-shell.md)입니다.
