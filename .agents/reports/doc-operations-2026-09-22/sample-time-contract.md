# 시간 계약 운영 샘플 — 미채택 제안

이 파일은 기존 06 §6.3의 **본문 무손실 사본**에 탐색·영향·증거 안내만 붙인 시범이다. 새 원본/제품 결정/구현 승인이 아니다. 이행 후 현재 계약은 원본 섹션에 짧은 안내를 붙여 운영한다. 이 사본은 조사 snapshot의 과거 검증 증거로만 보존하며, 향후 계약 변경에 동기화하거나 현재 계약으로 안내하지 않는다.

<a id="sample-time-contract"></a>
## 찾아가기와 상태

- 제안 식별자: `CTX-TIME` (문서 참조용. URL `v`, metricVersion, DB/Snapshot 버전과 무관).
- 현행 authoritative source: [06 §6.3](../../../docs/06_platform_ui_contract.md#63-시간-계약-decided-tz-값다중-사업장-같은-날짜는-open-domain-decision). 링크 렌더러의 자동 anchor 지원과 무관하게 `### 6.3 시간 계약`으로 찾을 수 있다.
- 선행: 03 '시간 계약'의 원천 wall-clock, 06 §6.1 초 정렬/occurrence 정밀도, §6.2 단일 Scope.
- 설계 상태: 메커니즘 Decided / 실제 TZ·영업일·다중 사업장 날짜·Δ Open. 이 상태를 파일 전체에 단일 Decided로 축약하지 않는다.
- 구현 상태: 이 체크아웃의 플랫폼 자체 runtime 없음; 실행 검증 없음. FeedbackOps runtime을 이 계약의 구현으로 세지 않는다.
- 실제 이름 확정: 관련 문서의 Candidate 필드명 정책을 유지한다. 이 샘플의 식별자는 공개 API 채택이 아니다.
- 현재 의존: 05 '지연 완료 허용 시간'이 R/H 원본, 06 §6.4가 기간 누락/오류/URL 물질화 소비, §19가 오류/상태 표시, 07 §6–8이 화면 소비, DESIGN 기간 프리셋이 시각 입력 소비.
- 미결 담당: 데이터 계약 담당(아직 사람 미지정)이 assertion/defaultRangeTo 공급 근거를 준비하고 업무 담당(미지정)이 사업장/프리셋 의미를 확인. 아래 실행 가능한 조건만 부분 착수 판단에 사용.

## 원문 사본 시작

### 6.3 시간 계약 (Decided; TZ 값·다중 사업장 같은 날짜는 Open domain decision)

기간은 파서 원본과 같은 시간대 없는 설비 wall-clock으로 전달하며 임의로 UTC로 변환하지 않는다. 시간의 원천 의미는 `03_backend_stack.md`를 따른다. 아래는 이 wall-clock 계약 위에서 **메커니즘 수준으로 확정한** 항목이다. 사업장별 실제 시간대 값과 다중 사업장의 "같은 날짜" 의미는 여전히 Open domain decision이다.

**구간 경계와 datetime 문자열 (Decided):** 공통 조회 경계는 half-open `[from, to)`이며 `from < to`를 요구하고 잘못된 날짜는 보정하지 않고 거부한다. v1 URL의 `from`/`to`는 정확히 `YYYY-MM-DDTHH:mm:ss`(naive, `Z`/offset·소수초·날짜-only는 형식 오류)다. 원천값·조인 키·occurrence anchor의 정밀도는 축소하지 않으며, 경계 비교는 원천 전체 정밀도로 한다(`to=10:00:00`이면 `10:00:00.000`과 `10:00:00.500` 모두 제외). v1의 초 단위 입력 제한은 원천 정밀도 축소가 아니라 **신규 제품 제한**이다.

**날짜만 선택한 경우 (Decided):** URL에는 datetime만 허용한다. 달력에서 고른 양끝 포함 구간 `[D1, D2]`는 UI에서 `[D1T00:00:00, (D2+1일)T00:00:00)`으로 변환해 URL에 쓴다("다음 날"은 naive 달력 연산이지 UTC instant+24시간이 아니다). 교대일·영업일·다중 사업장 같은 날짜 의미는 이 결정 밖(Open domain decision)이다.

**원천 시간대 미확인 시 처리 (Decided):** 단일 설비, 또는 동일 wall-clock 기준이 확인된 설비 집합은 절대 TZ를 몰라도 naive 범위로 조회할 수 있다. 임의의 기본 TZ를 가정하거나 URL `from`/`to`를 UTC 필터로 바꾸거나 확인 안 된 다른 시간역과 축을 병합하지 않는다. TZ 미확인은 Data Trust에 표시한다. 확인된 TZ 이름이 있어도 DST 등으로 변환이 항상 가능한 것은 아니므로, 확인된 이름 ≠ 변환 가능이다. 이 결정이 향후 별도 UTC 분석 API 자체를 영구 금지하는 것은 아니다.

**복수 설비 시간축 병합 가드 (Decided):** 서로 다른 설비를 같은 시간축/버킷으로 병합하는 조회는 **서버 소유 assertion**이 있을 때만 허용한다(비보장을 "경고 후 허용"으로 약화하지 않는다). `scopeId`나 클라이언트가 보낸 시간역 id는 증명이 아니다. 최소 assertion 계약: `(equipmentId, timeDomainId, validFrom, validTo)`, 범위 `[validFrom, validTo)`(해당 설비의 naive wall-clock, 내부 정밀도 유지 — 지금 특정 테이블·마이그레이션을 요구하지 않는다). 실제 조회 대상 설비 전체에 대해 요청 `[from, to)` 전체가 빈틈없이 덮이고, 그 구간들의 `timeDomainId`가 모두 같을 때만 병합을 허용한다(한 설비가 요청 중간에 도메인을 바꿔도 v1 병합은 거절). 덮이지 않은 구간이 있으면 `time_domain_unverified`, 확인된 도메인 불일치가 있으면 `time_domain_mismatch`이며, 둘 다 `outcome=error`(요청 검증 오류, correlation id)로 처리하고 `empty`/`unknown`/경고 후 병합으로 위장하지 않는다. 이력 없는 현재 스냅샷으로 과거 구간을 소급 증명하지 않는다. 서로 다른 시간역의 **분리** 조회는 계속 허용한다.

**기본 구간 물질화 시계 `defaultRangeTo` (Decided):** 브라우저 로컬 now, 서버 UTC 문자열 절단, "watermark = now = Data through" 등식은 모두 쓰지 않는다. 서버가 해당 시간역·데이터셋의 기본 조회 상한 `defaultRangeTo`(배타적 초 경계, wall-clock)를 제공한다. `defaultRangeTo`는 half-open 구간의 상한이므로 그 값 자체는 §6.3의 경계 규칙에 따라 항상 제외된다. 서버가 이 값을 정할 때 "포함"이 뜻하는 것은 **포함하려는 마지막 실제 데이터 시각이 `defaultRangeTo`보다 항상 이전이 되도록**(그 시각이 필터로 잘리지 않도록) 상한을 잡는다는 것이지, 상한 이전 데이터가 모두 도착했거나 집계가 완전하다는 뜻이 아니다 — 예를 들어 포함하려는 마지막 시각이 `10:00:00.000` 또는 `10:00:00.500`이면 `defaultRangeTo`는 최소 `10:00:01`이어야 한다. 기본 구간은 `[defaultRangeTo − Δ, defaultRangeTo)`(naive 길이 산술, 자정 비정렬, Δ 숫자는 Open)로 물질화하며, 산출 불가 시 자동 물질화하지 않고 기간 선택을 요구한다. 한 번 물질화한 URL 기간을 데이터 갱신만으로 자동 이동시키지 않는다.

`defaultRangeTo`와 자동 재집계 창의 원천 진행 경계 `R`(정의는 `05_roadmap_and_open_questions.md`의 "지연 완료 허용 시간" 참조)은 서로 다른 계약 필드이며 항상 같은 값은 아니다. **`R`이 존재할 때만** 같은 시간역·대상 조건에서 `defaultRangeTo ≤ R`인 경우에만 그 기본 구간을 자동 물질화하고, 만족하는 값이 없으면 마지막 점을 버리거나 `R`을 올리지 않고 기간 선택을 요구한다(L2). `R`이 아직 없는 경우(첫 mart 세대 생성 전, 워커 일시 중단 등)에는 이 비교를 적용하지 않는다 — `defaultRangeTo`가 독립적으로 유효하면 그대로 자동 물질화하고, 자동 재집계만 보류한다(`05_roadmap_and_open_questions.md` 참조).

세부 판정 근거, 반례, Candidate 필드명 전체 목록은 `docs/reviews/2026-09-18-url-time-status-contract-grilling.md` §3을 따른다.

## 원문 사본 끝

## 변경 영향 기록 예시 (미실행 제안)

변경 가정: “R 부재 시 기본 구간 물질화를 막는다.” 이것은 기존 계약의 명료화가 아니라 동작 변경이다. 06 §6.3의 명시 예외와 충돌하므로 이번 제안에서는 채택하지 않는다.

1. 06 §6.3 원본 소유 담당에게 제품 변경으로 제안하고 이유·실패 사례를 제출한다.
2. 05 지연완료의 R 부재 시 **자동 재집계만** 보류를 대조한다. R/기본기간/계산완료를 하나로 합치지 않는다.
3. 06 §6.4의 기간 양쪽 부재, 07 초기 진입, DESIGN preset, 03 시간 요약, REQUIREMENTS 연결 항목을 검토한다.
4. runtime 미존재이므로 codec/API/UI 테스트 경로를 임의로 만들어 통과라고 쓰지 않는다. 미래 테스트 의무와 실제 증거를 분리한다.
5. 승인 전에는 현행 예외를 유지. 승인돼도 문서 반영·호환성 결정·구현·검증은 각각 별도로 완료해야 한다.

## 원문 역대조 체크

| 단위 | 보존해야 하는 의미·예외 | 사본 대조 |
|---|---|---|
| 전제 | naive wall-clock, 시간 원천 03, 실제 TZ/날짜 의미 Open | 본문 포함 |
| 경계 | `[from,to)`, from<to, 잘못된 날짜 거부, 정확히 초 datetime, offset/Z/소수초/date-only 거부 | 본문 포함 |
| 정밀도 | 원천·조인·anchor 정밀도 보존, to 시각의 .000/.500 모두 제외 | 본문 포함 |
| 달력 | 양끝 포함 날짜→다음날 배타 경계, naive 달력 연산, 영업일/교대일 별도 | 본문 포함 |
| TZ 미확인 | 단일/동일 기준 확인 집합 조회 가능, 기본 TZ 금지, Data Trust, 이름 확인≠DST 변환 가능, 미래 UTC API 영구 금지 아님 | 본문 포함 |
| 병합 | 서버 assertion 전체 설비·전체 기간 무공백·동일 timeDomain, 중간 변경 거절, scope/client id 증명 아님, snapshot 소급 증명 금지 | 본문 포함 |
| 실패 | unverified/mismatch error+correlation, empty/unknown/경고 허용 아님, 서로 다른 시간역 분리 조회 허용 | 본문 포함 |
| defaultRangeTo | 배타 초 경계, 마지막 시각보다 큼, 완전성 아님, `[to−Δ,to)`, Δ Open, 산출 불가 선택, URL 자동 이동 금지 | 본문 포함 |
| R 결합 | 다른 필드, R 있을 때 to≤R, 충족 불가 선택·점 버리기/R 올리기 금지, R 없으면 독립 to 유효 시 물질화·자동 재집계만 보류 | 본문 포함 |
| 근거 | review §3 링크 및 05 R/H 의존 | 본문 포함 |

원문 사본의 정확한 일치는 validation.json의 sample_exact_match로 확인한다. 이것은 의미 검토를 대체하지 않으며, 위 역대조는 주 에이전트의 문서 검토다. runtime 계약 시험은 수행하지 않았다.
