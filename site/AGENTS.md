# AGENTS.md — site

사내 도입 소개 페이지다. 제품 코드가 아니며 pnpm workspace 밖 정적 HTML/CSS/classic JS만 사용한다. workspace 패키지 import·외부 CDN·fetch·분석 스크립트를 넣지 않는다.

- 모든 사실·숫자는 SOURCES.md 행과 대응해야 한다. 새 주장은 원장 행부터 추가한다. 합성 값은 예시로 표시한다.
- 문구는 `~합니다` 짧은 사실 문장, 제목은 기능 이름(GLOSSARY 용어), 기술 이름 대신 할 수 있는 일, 안 되는 것은 '아직 안 됨 → 예정 #n'. 광고·대비 수사 금지(#607).
- 색·폰트·반경은 제품 토큰을 소비한다. 값을 복제하지 않는다. site.css에는 색 literal을 넣지 않는다.
- 조립: `node site/scripts/assemble.mjs --out "$TMPDIR/ap-site" --site-base / --assumption`
- 미리보기: `python3 -m http.server -d "$TMPDIR/ap-site" 8080` → `http://127.0.0.1:8080/`
- 데모 링크 D1–D10은 공개 전 배포된 데모에서 브라우저로 하나씩 확인한다. 데모가 없으면 링크를 렌더하지 않는다.
- D1–D10 지시문 문장은 `index.html` 끝 `<template id="demo-step-copy">` 한 곳에만 있고, 조립이 각 `demo-link`의 `<p data-demo-step="D#">` 빈 자리에 같은 문장을 심는다. 사본을 손으로 고치지 않는다.
- 정비 이슈 해결 전에 공개하면 --assumption을 켠다. 실행 통과 수와 테스트 선언 수를 구분한다.

- 캡처 스크립트 `scripts/shots.mjs`만 e2e 패키지의 Playwright 런타임을 빌린다(사이트 런타임 의존성 아님).
