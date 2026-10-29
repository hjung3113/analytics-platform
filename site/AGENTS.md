# AGENTS.md — site

사내 도입 소개 페이지다. 제품 코드가 아니며 pnpm workspace 밖 정적 HTML/CSS/classic JS만 사용한다. workspace 패키지 import·외부 CDN·fetch·분석 스크립트를 넣지 않는다.

- 모든 사실·숫자는 SOURCES.md 행과 대응해야 한다. 새 주장은 원장 행부터 추가한다. 합성 값은 예시로 표시한다.
- 제목·카드·도식·요약은 명사형·핵심어를 먼저 쓴다(#1057). 동작·정확성·제약 설명은 `~합니다` 짧은 사실 문장으로 쓴다. 제목은 기능 이름(GLOSSARY 용어), 기술 이름 대신 할 수 있는 일, 안 되는 것은 '아직 안 됨 → 예정 #n'. 광고·대비 수사 금지(#607).
- 색·폰트·반경은 제품 토큰을 소비한다. 값을 복제하지 않는다. site.css에는 색 literal을 넣지 않는다.
- 조립: `node site/scripts/assemble.mjs --out "$TMPDIR/ap-site" --site-base / --assumption`
- 미리보기: `python3 -m http.server -d "$TMPDIR/ap-site" 8080` → `http://127.0.0.1:8080/`
- 데모 링크 D1–D10은 공개 전 배포된 데모에서 브라우저로 하나씩 확인한다. 데모가 없으면 링크를 렌더하지 않는다.
- D1–D10 지시문 문장은 `index.html` 끝 `<template id="demo-step-copy">` 한 곳에만 있고, 조립이 각 `demo-link`의 `<p data-demo-step="D#">` 빈 자리에 같은 문장을 심는다. 사본을 손으로 고치지 않는다.
- 정비 이슈 해결 전에 공개하면 --assumption을 켠다. 실행 통과 수와 테스트 선언 수를 구분한다.

- 캡처 스크립트 `scripts/shots.mjs`·`scripts/shots-real.mjs`만 e2e 패키지의 Playwright 런타임을 빌린다(사이트 런타임 의존성 아님).
- 플랫폼이 지원하는 기능은 기능으로 말하고, 아직 선언하지 않은 메뉴만 "예정 #n"으로 쓴다. "현재 X 메뉴만"을 대표 사실로 쓰지 않는다(소유자 2026-10-23).
- 화면에 나오는 말은 `GLOSSARY.md` 이름을 쓴다(`공간`→업무 시스템, `조회 범위`→Scope, `실어댑터`→서버 어댑터, `레일`→시스템 레일 등). `glossary.html`은 `GLOSSARY.md`의 용어 이름과 뜻을 따르되 사이트 문체(`~합니다`, ADR·절 번호 없음, 용어당 한두 문장)로 쓴다(조정자 결정 2026-10-23). 코드 이름(`Space`)은 개발자 부록에서만 남긴다.
- 조립 인수: `--out`(필수, 비어 있는 새 폴더) · `--site-base`(`/`로 시작하고 끝나는 배포 경로, 기본 `/analytics-platform/`) · `--demo <dist>`(mock 데모 빌드를 `demo/`로 복사) · `--shots <캡처 폴더>`(`shots.mjs` 출력, 없으면 캡처 자리를 지움) · `--ref`·`--commit`(원본 링크·푸터 표기) · `--assumption`. 정적 이미지 `assets/**`는 통째로 복사한다.
- Pages CI는 `shots.mjs`로 mock 데모만 찍는다(서버 없음). PR CI의 `Intro site captures` 잡(`ci.yml`, 필수 검사 아님)이 캡처가 기대는 경로(메뉴·패키지·`apps/platform-web`·`site`·`tooling`·`patches`·기능 소스(`apps/{platform-api,feature-screens}`), 루트 manifest·lockfile·`GLOSSARY.md`, 원본은 `ci.yml` `changes`)를 바꾼 PR과 main push마다 같은 빌드 → 캡처 → 조립 → `check-assembled.mjs --browser`를 돌려, 캡처가 깨진 것을 배포 전에 잡는다(#608). 코어 서버가 필요한 화면(플랫폼 메뉴의 알림·설문·내 VOC, VOC 등록 드로어의 작성 화면)은 `scripts/shots-real.mjs`를 손으로 돌려 `assets/real/`에 JPEG으로 커밋한다: `AP_BACKEND_ORIGIN=<코어 서버> pnpm --filter @ap/platform-web exec vite --mode real --host 127.0.0.1 --port <포트> --strictPort` 뒤 `node site/scripts/shots-real.mjs --url http://127.0.0.1:<포트> --out site/assets/real`. 시드 페르소나(`mock-user-2`)와 한국어 예시 데이터가 든 일회용 DB에서 배율 2로 찍어 주제 상자만 자르고, 총량 1.5 MB 상한과 시험용 표식(`[preview]`·`[seed]`) 검사를 스크립트가 한다. 캡션에 `실서버 모드 · 예시 데이터`를 적고 원장에 행을 둔다.
- 조립 검사: `node site/scripts/check-assembled.mjs --site <조립 폴더> --captures <shots.mjs 출력 폴더> --browser`. 본문이 요구하는 캡처가 캡처 폴더·조립본에 모두 있는지, 중복 id·앵커·금지 용어(코드 글자 포함, 허용한 코드 이름은 출력)·1440/390 가로 스크롤을 본다. `assemble.mjs`는 `--shots`를 받았는데 본문이 요구한 캡처가 없으면 멈춘다.
