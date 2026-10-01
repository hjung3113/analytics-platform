# 자유 피벗 엔진(Perspective)은 브라우저 안에서만 쓰고, DB나 서버 엔진에 직접 붙이지 않는다

상태: **Decided (2026-10-02)** — 사용 방식에 대한 결정. 도입 자체는 보류(POC #163, 자유 피벗이 업무 필수로 확인될 때). 사용 방식의 세부는 [04 Perspective 사용 방식](../04_frontend_ui_ux.md#그리드차트데이터-도구-검토-2026-10-02)이 소유한다.

사용자가 집계 축을 바꿔 보는 자유 피벗의 무료 1순위 후보는 Perspective(Apache-2.0)다. Perspective는 C++ 엔진을 WASM으로 브라우저 Web Worker에서 돌릴 수도 있고, 같은 클라이언트 API로 원격 서버(WebSocket)에 붙거나 Virtual Server로 DuckDB·ClickHouse·PostgreSQL에 피벗 설정을 SQL로 바꿔 보낼 수도 있다. 이 플랫폼에서는 메뉴 데이터가 모두 `menuQuery` 하나로 오고, 서버가 요청이 아니라 **자기 선언 사본**으로 권한·Scope·한도를 판정한다([실서버 연결 체크리스트](../integration/real-server-checklist.md) §3). Virtual Server는 브라우저가 보낸 임의 피벗 설정을 그대로 쿼리로 만들고, 공식 문서에 권한·행 단위 보안 장치에 대한 언급이 없다.

## Considered Options

- **(채택) 브라우저 엔진만**: 메뉴가 선언한 엔드포인트의 `menuQuery` 결과(서버가 판정을 마친 결과 집합)를 Worker 엔진에 넣고 사용자가 다시 집계한다. 서버 경계는 그대로이고, 적재량은 선언 `limits`와 행 상한으로 묶인다. 결과 집합보다 큰 탐색은 할 수 없다.
- **Virtual Server로 DB 직결**: 큰 데이터를 그대로 탐색할 수 있지만 `menuQuery` 판정 순서를 우회하고, 권한·Scope를 Perspective 쪽에 다시 구현해야 한다. 파서 원천 스키마는 read-only이고 권한은 서버가 매 요청 판정한다는 계약(03, 06 §6.2)과 충돌한다.
- **FastAPI 안 Perspective 서버 + WebSocket**: 세션별로 권한 필터를 적용한 테이블만 만들어 보내면 판정은 지킬 수 있지만, `PlatformAdapter` 밖에 새 통신 경로가 생긴다.

## Consequences

- Virtual Server·원격 모드로 DB·서버 엔진에 직접 붙지 않는다. 브라우저에 다 담기지 않는 데이터가 필요해지면 세 번째 안을 **Kernel 포트 변경**(플랫폼 결정)으로 다시 올린다.
- 탐색 탭에는 더할 수 있는 원 값(건수·시간·분자·분모)만 넣고 "공식 지표 아님"과 결과 집합의 `DataTrustIndicator`를 함께 보인다. 지금 엔드포인트는 화면용 집계값이라 대개 탐색용 원 값 엔드포인트를 새로 선언한다.
- Perspective의 WebGL 차트는 탐색 탭 안에서만 쓴다. 06 §16 Chart Frame 계약 화면은 ECharts([ADR-0006](0006-grid-free-first-engine-hidden-from-menus.md))이고, WebGL 차트는 스크린 리더로 읽히지 않으므로 같은 데이터의 표 경로를 남긴다(06 §26).
- 피벗 설정은 화면 로컬 상태로 둔다. 셀 클릭은 `linkTo`로 상세 이동하고 전역 Context를 조용히 바꾸지 않는다(06 §22).
