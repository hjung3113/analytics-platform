# @ap/kernel

플랫폼 Kernel 런타임입니다. 메뉴 Registry, 전역 Context, 주소(URL) 계약, 권한과 Scope, 조회 수명주기(`useMenuQuery`)를 맡습니다. 메뉴 목록과 서버 구현은 알지 못하고, 둘 다 앱이 넣어 줍니다.

- **공개 진입점:** `.`(Registry, `usePlatform`, 조회 훅), `./host`(셸·공통 컴포넌트·앱 전용 호스트 진입점. 메뉴와 모듈은 import할 수 없음), `./testing`(시험 도우미)
- **의존 방향:** `@ap/contracts` 위, `@ap/components` 아래입니다.
- **메뉴 화면에서 쓰는 곳:** 전역 Context 읽기, 화면별 URL 상태, 다른 메뉴로 이동(`linkTo`), 번역(`useI18n`)

처음이면 [첫 메뉴 화면 만들기](../../../docs/guides/first-menu-screen.md)부터 읽습니다. 파일별 설명과 작업 규칙은 [AGENTS.md](AGENTS.md), 계약 원본은 [06 Kernel 계약](../../../docs/contract/kernel.md)입니다.
