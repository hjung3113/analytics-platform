# @ap/ui

UI primitive 층과 디자인 시스템 CSS입니다. 버튼, 입력, 표시 요소 같은 기본 부품과 색·글자 토큰을 담습니다. 플랫폼 개념(Context, Scope, 메뉴)은 알지 못합니다.

- **공개 진입점:** `.`(부품), `./styles.css`와 `./styles/*.css`(토큰과 테마), `./theme`·`./theme-tokens.json`(생성된 테마 값)
- **의존 방향:** `@ap/contracts` 위, `@ap/components` 아래입니다. Radix를 import하는 곳은 이 패키지뿐입니다.
- **주의:** 토큰 파일 일부는 생성물입니다. 직접 고치지 않고 AGENTS.md의 절차를 따릅니다.

처음이면 [첫 메뉴 화면 만들기](../../../docs/guides/first-menu-screen.md)부터 읽습니다. 파일별 설명과 작업 규칙은 [AGENTS.md](AGENTS.md), 시각 규칙은 [DESIGN.md](../../../DESIGN.md)입니다.
