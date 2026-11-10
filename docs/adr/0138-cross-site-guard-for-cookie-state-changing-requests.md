# ADR-0138 — 세션 쿠키로 상태를 바꾸는 요청은 `Sec-Fetch-Site`가 `same-origin`이 아니면 거절한다

- 상태: Decided (2026-11-11, lane platform, 되돌릴 수 있음). 이슈 [#1674](https://github.com/hjung3113/analytics-platform/issues/1674).
- 결정자: lead (소유자 조건 아래 비용 기준으로 정했다. 소유자가 뒤집을 수 있다). 소유자 조건(2026-11-10): "사내망이라 공격 가능성이 낮고 우선순위가 낮다. 성능 비용이 크면 하지 않는다. DB 읽기가 없는 방안이 낫다." lead 기준: 대상 경로의 추가 p95가 5 ms 미만일 때만 구현한다.
- 바꾸는 결정: [ADR-0071](0071-feedbackops-screen-bridge-and-api-fo-edge-prefix.md) 결정 4와 [ADR-0069](0069-platform-port-in-feedbackops-backend.md) 결정 4의 "SameSite + JSON 강제"(서버에는 JSON 강제가 없었다). `X-CSRF-Token`을 검사하는 경로(`requireCsrf`)는 바꾸지 않는다.

## 배경

본문을 읽지 않고 헤더도 요구하지 않는 쿠키 세션 POST(`managed-systems`·`analytics-areas` 보관, VOC 추천 `dismiss`·`confirm`, API 토큰 폐기 2종, 알림 `read`·`archive`, `/auth/logout`)는 `SameSite=Lax`만 막고 있었다. 같은 사이트(같은 등록 도메인)의 다른 페이지가 HTML 폼으로 `text/plain`이나 `multipart/form-data` POST를 보내면 핸들러까지 닿는다. 데이터 노출은 없고 보관·확정·폐기·읽음 처리만 가능하다.

## 결정

1. **서버 루트 `onRequest` 훅 하나**(`middleware/cross-site-guard.ts`)가 `POST`·`PUT`·`PATCH`·`DELETE` 중 세션 쿠키가 있는 요청의 `Sec-Fetch-Site`를 본다. 값이 있고 `same-origin`이 아니면 `403 permission.cross_site_request`(평면 `{ code, message, detail }` 봉투)로 거절한다. 본문 파서·rate limit·핸들러보다 앞이라 쓰기도 한도 소모도 없다.
2. **그대로 통과:** 안전한 메서드, 세션 쿠키가 없는 요청, `Bearer` API 토큰 호출(앰비언트 자격이 없고 토큰 게이트가 판단한다), 헤더가 없는 요청(CLI·서버 측 클라이언트·테스트 클라이언트·헤더를 안 보내는 옛 브라우저).
3. **`same-site`는 받지 않는다.** 같은 사이트의 형제 서브도메인 페이지가 바로 막으려는 공격자이고, 앱의 fetch는 vite 개발 프록시(`dev:real`)와 nginx 앞단을 지나도 `same-origin`이다(프록시는 브라우저가 붙인 `Sec-Fetch-*`를 그대로 넘긴다). 사내 배포에서 앱을 다른 서브도메인에서 부르게 되면 이 결정을 다시 본다.
4. **예외 경로는 없다.** 업로드·내보내기 경로도 앱 화면이 같은 출처에서 부른다.

## 대안과 이유

| 안 | 결과 |
| --- | --- |
| 1. `Sec-Fetch-Site` 검사 (채택) | DB 읽기 0, 헤더 하나. 세 경로 × 300회에서 추가 p95 −0.05~+0.08 ms(기준선 두 번 잰 차이 0.04~0.10 ms 안) |
| 1+2. `Origin`을 요청 `Host`와 비교 | 같은 비용. 프록시가 `Host`를 바꾸는 배포에서 정상 호출을 거절할 수 있어, 새 필수 설정 없이는 안전하지 않다. 구현 안 함 |
| 5. `requireCsrf` 재사용 | 요청마다 세션 행 읽기 1회(문장 +1~2). 추가 p95 +0.67~+0.80 ms로 기준 안이지만 1안으로 충분하고 화면이 토큰을 들고 다녀야 한다. 구현 안 함 |
| 3. `application/json`만 허용 | 업로드 경로를 예외로 열거해야 하고 본문 없는 POST가 깨진다 |
| 4. 필수 사용자 헤더 | 화면 호출을 모두 고쳐야 한다 |

측정은 `buildServer` + 실제 Postgres, `app.inject`, 같은 세션, 변형을 번갈아 돌려 N=300(예열 30회 제외)이다. 수치 표는 이슈 #1674의 PR 본문에 있다.
