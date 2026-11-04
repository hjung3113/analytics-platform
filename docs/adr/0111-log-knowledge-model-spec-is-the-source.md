# 로그 지식 허브: 모델 명세가 원본이고 SW 버전 차이는 보조 변경점이다

상태: **Decided (2026-11-04)**.
- 결정자: 사용자 — 2026-11-04, [#1196](https://github.com/hjung3113/analytics-platform/issues/1196) 이슈 댓글(모델 명세가 주, SW 버전별 차이는 보조)과 설계 질문 Q1–Q10 답(Q4·Q9: 첨부 대신 스트리밍·TSV txt·붙여넣기, 해시는 제출 내용 기준). 세부(표 이름·키 정규화)는 코디네이터가 [설계 §15](../design/features/log-knowledge-hub/design-v0.6-candidate.md)에 정했다.

## 배경

이슈 본문과 설계 v0.6 §5.2·§6.3은 SW 버전마다 명세가 원본이고 모델 공통 프로파일은 사람이 승인한 파생본이라고 했다. 소유자는 반대로, 대부분의 SW 버전은 명세가 같고 특정 SW 버전부터 로그가 갑자기 이상해지거나 크게 바뀔 때만 차이를 적는다고 했다.

## 결정

1. **모델 명세 Revision이 원본이다**(`model_spec_revision`, 모듈·이벤트·관계). 발행된 Revision은 불변이다(발행·반려된 Revision의 UPDATE는 트리거가 막고, 자식 행은 draft일 때만 넣을 수 있다. 런타임 역할은 전환 열만 UPDATE한다).
2. **SW 버전 차이는 «X 버전부터 적용되는 변경점»만 추가 전용 행으로 남긴다**(`spec_sw_change`, 이후 노드). 변경점 없는 SW 버전은 기록 없이 모델 명세를 따른다.
3. **SW 버전에 순서가 있어야 «X부터»가 성립한다.** `software_version.release_order`(모델별 1..n, 새 SW는 max+1, DB 기본값·트리거로 모든 삽입 경로에 적용)를 카탈로그에 더한다(ADR-0107 보충).
4. **모델 공통 후보 → 승인 파생본 흐름은 버린다.** 모델 명세가 이미 원본이므로 후보·승인·출처 SW 집합이 필요 없다. 개념 매핑(`common_concept`·`spec_concept_mapping`)은 모델 명세의 모듈·이벤트를 대상으로 유지한다.
5. **명세 입력은 첨부가 아니다.** 스트리밍 API(코드·에이전트 스크립트), TSV 형식 .txt, 붙여넣기다. 출처 증명은 제출 내용의 `content_sha256`과 선택적 원본 링크다.

## 결과

- 마이그레이션 0091이 네 표(`model_spec_revision`, `spec_module`, `spec_event`, `spec_event_relation`)와 `release_order`를 만든다. 변경점·개념 표는 해당 노드에서 만든다.
- 설계 §5.2 표 10–18번과 §6.3은 이 ADR로 대체됐다. 발행 권한 `knowledge.spec.publish`는 쓰기 노드에서 정한다(#1198에서 자기 발행 허용을 다시 본다).
