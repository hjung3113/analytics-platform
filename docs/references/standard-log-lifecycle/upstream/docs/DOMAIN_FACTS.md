# Domain Facts (Sample Log & Parser)

> 검증 Workbench와 Validation Layer를 구속하는 도메인 사실.
> 출처: 사용자 인터뷰(2026-09-12, 원본 파일 미확보)와
> `context_recognized_parser` 커밋 `d84fab18`.
> 이 문서는 파서 저장소의 계약을 대체하지 않는다.
> 구현 기술은 적지 않는다.

관련 스파이크: `log-contract-lens` (Validation Run 수직 프로토타입).

## 1. Sample 파일

- 평문 `.txt`. 운영 전달은 보통 `eventlogYYYYMMDDHH.txt.zip` (1시간 구간).
  검토 중에는 압축 없는 `.txt`도 온다. Sample ingest는 둘 다 받는다.
- 파일명에 장비명 없음. `yyyyMMddHH`만 있다. 한 파일은 그 시(hour) 구간의 로그.
- **EquipmentId는 파일명·본문 어디에도 없다.** 개발 중 모델은 설비명 자체가 없을 수 있다.
  식별자는 항상 로그 밖 — 이 제품에서는 Equipment Model이 부여한다.
- 파일 선택은 수동. 실시간 수집/폴더 관행을 전제하지 않는다.
- 한 줄 = 한 레코드. 로그 타입 컬럼이 있다. 키 이름은 로그에 없고
  컬럼 위치가 스펙에 고정(위치 기반 파싱).
- 고정 컬럼 뒤 반복 블록: legacy `(key, value)` 2단위,
  신규 `(key, value, unit)` 3단위.
- 인코딩/구분자/헤더/개행은 샘플 바이트 확인 전 확정하지 않는다.

## 2. Equipment identity와 파일 집합

- Sample은 여러 시간 파일일 수 있다. 내부 모델은 `files[]` + 사용자 확인 순서.
- 파일명 시각으로 레코드를 재정렬하지 않는다. 파일 순서 = 처리 순서.
- 텍스트를 `cat`으로 이어 붙이지 않는다. EquipmentId가 로그에 없고
  진단 키가 `fileId + line`이라 원본 위치가 깨진다.
- **파일 경계는 lifecycle 종료가 아니다.** 파일 끝의 열린 Start/End를
  오류로 단정하지 말고 NotChecked로 남긴다.
- 업로드 수 / 처리 대상 수 / 제외 수를 구분한다.

## 3. Parser 입력·출력에서 오진하기 쉬운 규칙

권위: 파서 저장소. 여기 목록은 Workbench/Rule이 지키지 않으면 오진하는 항목만.

- `ParsedRecord(EquipmentId, LogType, Fields)`. LogType은 Field가 아니다.
  Field = Key / Value / Unit.
- 필드 키 중복은 대소문자 무시. 파서 dictionary 덮어쓰기 **전에** 검출한다.
  원본을 수정해 숨기지 않는다.
- DateTime → Timestamp, MaterialId → WaferId **와** MaterialId, FlowId → PPID.
  옛 키 Timestamp/WaferId/PPID를 자동 호환 키로 추가하지 않는다.
- LOT 계열 LogType `LEH`는 확인된 설비의 routing이지 전역 상수가 아니다.
- EventId 비교는 대소문자 구분. LogType·Status 비교는 대소문자 무시.
- JobId 누락은 허용. EndWaferId fallback이 있다. 전 필드 일괄 필수 금지.
- PortId는 읽지 않는다. `ModuleIsPort` / `FromModuleIsPort` / `ToModuleIsPort`는
  해당 Module의 port flag. 세 플래그를 서로 fallback하지 않는다.
- 라우팅 우선순위: EventIdRoutes → StatusRoutes → TriggerRoutes.
  표와 상세와 요약이 같은 레코드에 서로 다른 경로를 보여주면 안 된다.
- IncomingWafer EventKind null은 정상 trigger. XfrGet/XfrPut도 trigger 매칭 시
  EventKind null만으로 Unrouted로 만들지 않는다.
- Timestamp 재정렬·근거 없는 timezone/UTC 변환 금지.

## 4. 이미 있는 것과 이 제품이 더하는 것

- 사내 Python 형식검증 툴이 Layer A(및 일부 B)를 이미 수행한다.
- Workbench가 중복 구현할 핵심이 아니다. 더하는 값:
  1. Layer D — 실제 파서 가공 가능 여부
  2. Layer E — 추출 데이터 품질
  3. 원본 줄 ↔ ParsedRecord ↔ 품질 판정 Evidence
  4. (이 제품) Round / Defect / Gate 추적
- "가공 결과 테이블의 사용자 정의 최소 필수값"은 품질 규칙이지
  파서 계약 필수가 아니다. 계약 필수와 사용자 품질 기준을 UI에서 섞지 않는다.

## 5. 아직 없는 것 (추측 금지)

- 비식별 원본 샘플, 정확한 구분자/인코딩, 컬럼→키 매핑 표,
  legacy/신규 판별 방법, 설비별 EventId/Status routes.
- 자료가 오기 전에 CSV/JSON이거나 임의 날짜 형식이라고 가정하지 않는다.
