# 감사 대상 유형 필터는 불투명 토큰이다

상태: **Decided (2026-10-29)** — 결정 기록. 구현은 [#1091](https://github.com/hjung3113/analytics-platform/issues/1091).
- 결정자: 팀장(사용자 위임, 되돌릴 수 있음) — [#1091 결정 댓글](https://github.com/hjung3113/analytics-platform/issues/1091). 조정 지도 [#598](https://github.com/hjung3113/analytics-platform/issues/598)에서 번호 0101을 예약했다.

## 맥락

콘솔은 `equipment`·`metric`·`annotation`만, 실서버 파서는 FeedbackOps `subject_type` 18종만 `auditTrail`의 `type` 필터로 받았다. 그래서 콘솔의 `type=equipment&targetId=<없는 UUID>`는 실서버에서 `Invalid audit filter`로 끝났고, 실제 `voc` 필터는 콘솔이 거절했다. SDK `AuditTarget.type`은 이미 `string`이다.

## 결정

1. `auditTrail`의 `type` **필터**는 불투명하고 대소문자를 구분하는 ASCII 토큰이다: `[A-Za-z][A-Za-z0-9_.:-]{0,79}`. 자르기·정규화 없음. 콘솔·mock·실서버 세 파서가 같은 문법을 각자 갖고(`keep in lockstep` 주석), SDK는 문자열 그대로이며 도우미·합집합·엔드포인트를 더하지 않는다.
2. 형식이 맞는 알 수 없는 `type`은 정상 `empty`(data null)다. 형식이 틀리면 기존 `Invalid audit filter` `error`다. `targetId`는 여전히 `type`을 요구한다. 다른 키·쪽 나누기·시간·정렬·출처·작업·상한은 그대로다.
3. 필터를 받는 것은 공개가 아니다. 공개 경계는 기존 SQL 투영 하나다([ADR-0069](0069-platform-port-in-feedbackops-backend.md) 결정 6·7, 0074): 워크스페이스, 공개하는 18개 subject 유형, 민감 event·detail·capability 제외. `console:access`는 검증보다 먼저 판정한다. 투영에 없는 유형(`survey_response` 포함)은 한 번도 쓰지 않은 유형과 같은 `empty`로 답해 존재 여부를 알려 주지 않는다. `entityAudit`·`getEntity`의 유형 집합은 바뀌지 않는다.
4. 콘솔(Consumer)이 실제 18종과 기존 견본 3종의 표시 이름·선택지를 자기 모듈에 선언하고, URL·초안의 형식 유효 미지 유형은 원문 텍스트 선택지로 남긴다(전체로 바꾸지 않는다). mock의 `AUDIT_TYPES`는 시드 등록 검증([ADR-0048](0048-menu-audit-seeds-join-shared-mock-audit-store.md))용으로 남고 필터 검증과 분리된다.
5. 적합성 묶음에 포트 일반 검사 하나를 더한다(형식 맞는 미지 유형 → `empty`·null, 틀린 형식 → `error`).

## 검토한 대안

- SDK에 현재 21종 합집합: SDK가 도메인 어휘를 알게 되고 유형이 늘 때마다 계약을 바꾼다.
- 백엔드 목록 발견용 새 엔드포인트: 소비자 하나를 위한 공개 상태와 타이밍이 늘어난다.
- 분석 권한 부여로 우회: 결함을 가릴 뿐이다.

## 결과

- 소유 문서: [real-server-checklist §2](../integration/real-server-checklist.md) `auditTrail` 행. 개인정보 권위는 ADR-0069·0074 그대로다.
- 미룬 것(구현 안 함): 불투명 id·scope 열 일반화는 기존 보류를 유지한다. 다시 열 조건: 플랫폼이 opaque id·scope를 쓰는 type(equipment/metric)의 감사 이벤트를 FeedbackOps `core.audit_log`에 쓰기 시작할 때([기존 backlog #621 O16](../../.planning/backlog.md)).
