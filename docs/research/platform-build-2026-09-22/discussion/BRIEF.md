# 플랫폼 구축 리서치 토론

상태: 검토·권고. 기존 Decided 계약 및 구현 승인을 변경하지 않는다.

## 공통 입력과 목표

cwd `/Users/hyojung/orca/projects/analytics-platform`. AGENTS.md와 docs/INDEX.md를 먼저 읽는다. `docs/research/platform-build-2026-09-22/`의 Luna Max 원본 조사 01/02/03 세 개를 모두 검토하고 관련 `docs/00~07`, `DESIGN.md`, integration 문서, FeedbackOps 실제 코드를 필요한 만큼 대조한다. 제품 계약의 원본은 `docs/06_platform_ui_contract.md`, 결정 상태는 `05`다.

목표는 어떤 기능/OSS/기존 구현을 어떻게 반영할지 가장 좋은 현실적 조합을 도출하는 것이다. 인기순 도구 목록이나 원본 요약으로 끝내지 말고 부정확한 사실, 빠진 선택지, 과도한 공통화, 통합 비용, 보안/성능 실패 조건을 반박하라. 확정 계약도 개선이 필요하면 제안 가능하나 변경 비용과 재결정 필요성을 분명히 하라.

## 논점

1. Platform-owned URL codec/Menu Registry/schema artifact는 어느 수준까지 필요한가? 중복 단일값·반복 집합·미등록 값 보존은 라우터 파싱 전에 보장되는가?
2. 서버 계산 세대와 브라우저 요청 경쟁을 같은 generation으로 오해하지 않는가? chart/table/CSV 일치에 필요한 최소 계약과 staging/pointer 전체 프레임워크의 과잉 여부는?
3. FeedbackOps 프론트/인증/권한/Audit를 직접 추출, adapter 연결, 독립 유지 중 어떻게 나눌까? Fastify 구현 존재를 고려해 FastAPI/Nest 후보를 어떻게 재평가할까?
4. PostgreSQL+작업 실행기만으로 가능한 한계, 취소와 DB timeout/풀 정리, 권한 변경 후 export 다운로드, TTL/세대 폐기/재시도/rollback은?
5. TanStack/Radix/ECharts 추천은 현재 요구와 근거로 충분한가? BI/admin/정책/IdP/OLAP 완제품으로 대체할 수 있는 부분과 못 하는 부분은?
6. 기존 문서에서 보강할 위치·구체 문안, 지금 꼭 결정할 것과 실제 요구까지 미룰 것을 정하라. Open 수치를 임의 확정하거나 라이브러리 존재를 성능 검증으로 쓰지 말 것.

## 절차와 출력

R1: 각자 독립 입장문 작성. 핵심 권고 5개 이내, 동의/반대 표, 근거 있는 반론 3개 이상, 기존 보고서 수정 사항, 실행 가능한 최소 조합, 다른 두 리뷰어에게 묻는 질문 3개, 문서 반영표를 포함한다. 사실/추론/미검증을 구분한다.

R2: 코디네이터가 R1 세 편과 쟁점 묶음을 제공한 뒤 시작한다. 상대의 실제 주장 ID/문장을 인용하여 수용/부분수용/반박하고, 자신의 입장 변경과 최종 권고, 끝내 남는 불일치를 기록한다. 형식적인 만장일치나 읽지 않은 상대와의 합의를 주장하지 말 것.

## 소유권과 검증

각 dispatch에서 지정한 보고서 하나만 편집한다. 공식 설계/소스/서브모듈/다른 보고서 수정, install/server/test/DB 실행, commit/push 금지. 관련 코드 읽기와 공식 웹 자료 확인은 허용한다. 웹에는 비공개 코드/고유 데이터를 보내지 않는다. 외부 기술 사실이 핵심 반론이면 공식 근거를 직접 확인하거나 미확인으로 표시한다. 출처는 주장 옆 링크/로컬 경로·심볼로 남긴다. 하위 에이전트 생성 금지.

완료 기준: 지정 한국어 Markdown 보고서가 존재하고 요청한 항목과 검증 한계를 포함함. Orca preamble의 current Task/Dispatch를 사용해 worker_done을 전송한 뒤 대기한다. R1 이후 R2는 새 dispatch가 부여한다.
