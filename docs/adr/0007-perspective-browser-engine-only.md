# 자유 피벗 엔진(Perspective)은 브라우저 안에서만 쓰고, DB나 서버 엔진에 직접 붙이지 않는다

상태: **Decided (2026-10-02)** — **플랫폼 결정**. 이미 Decided인 서버 경계 계약(서버는 매 요청을 자기 선언 사본으로 판정한다 — [실서버 연결 체크리스트](../integration/real-server-checklist.md) §3, 06 §6.2)에서 유도한 것이고, #159 결정 기록에 함께 남겼다. 도입 자체는 보류(POC #163). 사용 방식의 세부(원 값 엔드포인트, Data Trust 표시, WebGL 차트와 접근성, 피벗 설정의 상태, 지연 로드)는 [04 Perspective 사용 방식](../04_frontend_ui_ux.md#그리드차트데이터-도구-검토-2026-10-02)이 소유한다.

자유 피벗의 무료 1순위 후보는 Perspective(Apache-2.0)다. Perspective는 C++ 엔진을 WASM으로 브라우저 Web Worker에서 돌릴 수도 있고, 같은 클라이언트 API로 원격 서버(WebSocket)에 붙거나 Virtual Server로 DuckDB·ClickHouse·PostgreSQL에 피벗 설정을 SQL로 바꿔 보낼 수도 있다. 이 플랫폼에서는 메뉴 데이터가 모두 `menuQuery` 하나로 오고, 서버가 요청이 아니라 자기 선언 사본으로 권한·Scope·한도를 판정한다. Virtual Server는 브라우저가 보낸 임의 피벗 설정을 그대로 쿼리로 만들고, 공식 문서에 권한·행 단위 보안 장치에 대한 언급이 없다.

## Considered Options

- **(채택) 브라우저 엔진만**: 메뉴가 선언한 엔드포인트의 `menuQuery` 결과(서버가 판정을 마친 결과 집합)를 Worker 엔진에 넣고 사용자가 다시 집계한다. 서버 경계는 그대로다. 결과 집합보다 큰 탐색은 할 수 없다.
- **Virtual Server로 DB 직결**: 큰 데이터를 그대로 탐색할 수 있지만 선언 기반 판정을 우회하고, 권한·Scope를 Perspective 쪽에 다시 구현해야 한다. DB 자격 증명을 가진 새 프로세스가 mart·`menuQuery` 경로 밖에 생긴다.
- **FastAPI 안 Perspective 서버 + WebSocket**: 세션별로 권한 필터를 적용한 테이블만 만들어 보내면 판정은 지킬 수 있지만, `PlatformAdapter` 밖에 새 통신 경로가 생긴다.

## Consequences

- Virtual Server·원격 모드로 DB·서버 엔진에 직접 붙지 않는다. 브라우저에 다 담기지 않는 데이터가 필요해지면 세 번째 안을 **Kernel 포트 변경**(플랫폼 결정)으로 다시 올린다.
- 브라우저 적재량의 상한은 지금 계약에 없다 — 선언 `limits`는 `maxHours`뿐이고, 좁은 Selection이면 그마저 적용되지 않는다(체크리스트 §3-5). 탐색용 엔드포인트에는 행 상한 선언이 필요하다 — 선언 상한의 계약은 #175, 탐색 엔드포인트의 값은 #163.
