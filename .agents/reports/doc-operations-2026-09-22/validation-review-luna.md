# 문서 운영 산출물 원문 대조 검토

검토 대상은 `operating-model.md`, `migration-plan.md`, `sample-time-contract.md`, `representative-validation.md` 네 파일이다. 새 discussion R1/R2는 근거로 사용하지 않았다. 원문은 `docs/06_platform_ui_contract.md` §6.1–§6.4, §15, §18–§19, `docs/05_roadmap_and_open_questions.md` 지연 완료 절, `docs/01_architecture_and_data_contract.md` mart 재계산 절, `DESIGN.md`의 table-density/Layout/Shared interaction, `docs/INDEX.md`, `docs/03`, `docs/04`, `docs/07`, `PLATFORM_REQUIREMENTS.md`, 그리고 V3가 직접 참조하는 `docs/integration/component-contract-candidates.md`를 대조했다. 소스 문서는 수정하지 않았다.

## 먼저 확인한 정합성

### 1. §6.3 샘플은 범위를 정확히 잘라 byte-exact로 보존한다

**사실.** `docs/06_platform_ui_contract.md:242–258`의 `### 6.3 시간 계약`부터 `### 6.4 URL 계약` 직전까지를 `sample-time-contract.md:19–35`가 그대로 담는다. 이 검토에서 두 구간을 독립적으로 비교한 결과 길이는 각각 3,066자이고 동일했으며 SHA-256은 `bc1a24c6c09a8cc1cfd75fe94e5c2c9f65512a20ff8dbc196af508b42a9c2cfc`였다. 기존 `validation.json`도 `sample_exact_match: true`, `source_drift: []`를 기록한다.

**보존된 예외.** naive wall-clock과 초 단위 datetime/정밀도(`06:244–246`), 날짜-only의 다음 날 배타 경계(`06:248`), TZ 미확인과 DST 변환 불가의 구별(`06:250`), 서버 assertion의 전체 설비·전체 구간·동일 `timeDomainId` 요건과 `time_domain_unverified`/`time_domain_mismatch` 오류(`06:252`), `defaultRangeTo`의 배타 경계와 완전성 비주장(`06:254`), R이 없을 때 독립적으로 유효한 기본 기간은 물질화하고 자동 재집계만 보류하는 예외(`06:256`)가 모두 남아 있다. §6.3의 review §3 포인터(`06:258`)도 포함된다.

**해석.** 샘플의 원문 범위 주장은 맞다. 샘플 바깥의 안내·영향 표는 원문의 일부라고 주장하지 않으며, 부모가 갱신한 도입문(`sample-time-contract.md:3`, `operating-model.md:17`)도 이 사본을 조사 snapshot의 역사 증거로만 보존하고 현재 계약과 동기화하지 않는다고 명시한다. 현재 권위는 원본 §6.3이고, §6.4와 05의 상세 소비·운영 정책을 샘플 하나로 대체하지 않는다.

**검증 한계.** `validation.json`은 보고서 패키지의 구조 검사 산출물이지 runtime 계약 시험이나 의미 승인 기록이 아니다. 샘플 문서도 `sample-time-contract.md:12,46,64`에서 runtime 미실행을 명시하므로, 이 부분에는 실행 완료를 가장한 주장이 없다.

### 2. DESIGN의 32/25/44 수치는 사실과 예외가 맞다

**사실.** `DESIGN.md:486–489`의 `table-density` token은 row/header 모두 32px이다. `DESIGN.md:729–731`은 32px을 일반 데스크톱 최소 행으로, 25px을 compact 시각 목표로, 줄바꿈·포커스·24px 최소 target에 따라 늘어날 수 있는 값으로, coarse-pointer controls/rows의 44px을 target으로 적는다. `docs/06_platform_ui_contract.md:630–638`도 같은 의미를 Decided baseline으로 재진술한다.

**해석.** `representative-validation.md:39–41`의 숫자와 “25px은 기본값이 아니다”라는 상태 보존은 정확하다. 44px은 고정 행 높이가 아니라 coarse-pointer target이며, 25px은 reference row 목표라는 자격을 계속 붙여야 한다. 이 값이 같다는 이유로 `06 §23`의 Candidate 전체를 Decided로 올리지 않는다는 문장도 원문 상태와 맞다.

## 수정 또는 후속 확인이 필요한 항목

### V-01 — 첫 M1 지시가 `REQUIREMENTS`의 실제 경로를 지정하지 않는다 (중요)

**사실.** `migration-plan.md:22–23`은 첫 patch의 네 파일을 지정하면서 root `REQUIREMENTS`를 링크하라고 하지만 실제 root 파일명은 `PLATFORM_REQUIREMENTS.md:1`이다. `REQUIREMENTS.md`는 현재 존재하지 않는다. 같은 축약명이 `operating-model.md:34,98,103`, `sample-time-contract.md:45`, `representative-validation.md:17,20`에도 쓰인다.

**해석.** M1의 대상 파일 네 개 자체는 `INDEX`, `03`, `04`, `07`에 대한 안내 정정 범위로 충분하다. 그러나 구현자가 문장을 그대로 따라가면 존재하지 않는 링크를 만들 수 있어, `migration-plan.md:28`의 링크 대상 존재 조건을 스스로 만족하지 못한다. M3의 `[N/3]`(`migration-plan.md:12`)도 `PLATFORM_REQUIREMENTS.md:13–17`에 정의된 `[3/3]`, `[2/3]`, `[1/3 · 모델명]` 표기와 일치하지 않는 미정 기호다.

**다음 확인.** 첫 patch 지시와 후속 M3 지시에서 `PLATFORM_REQUIREMENTS.md`를 실제 파일명으로 명시하고, `docs/INDEX.md`의 상대 링크 대상까지 확인한다. 출처 수 표기는 현재 파일의 기존 리터럴 표기를 보존할지 별도 결정하기 전에는 새 `[N/3]` 의미를 만들지 않는다.

### V-02 — 존재하지 않는 최종 판정 파일을 권위 경로처럼 가리킨다

**사실.** `operating-model.md:3`은 `discussion/DECISIONS.md`를 함께 보라고 하지만 `.agents/reports/doc-operations-2026-09-22/discussion/DECISIONS.md`는 없다.

**해석.** 미채택 권고의 최종 판정을 없는 파일에 위임하면 새 작업자가 역사 토론 파일을 찾다가 현재 원문 권위를 놓칠 수 있다. 이 문장은 현재 상태의 사실 포인터가 아니라 해소되지 않은 stale reference다.

**다음 확인.** 해당 파일을 실제로 만들지 여부를 이 보고서 범위에서 결정하지 말고, 후속 문구 반영 전에 유효한 현재 권위 경로를 확인하거나 없는 포인터를 제거한다. M1 네 파일 범위에 이 파일을 조용히 추가하지 않는다.

### V-03 — 06/DESIGN 책임 경계가 두 곳에서 약하게 표현된다

**사실.** `docs/06_platform_ui_contract.md:107–123`은 Kernel 책임에 Theme/Design Token과 공통 Keyboard Shortcut을 포함하고, `docs/06_platform_ui_contract.md:1025–1031`은 visible keyboard focus와 focus trap을 접근성 기준으로 소유한다. 반면 `DESIGN.md:863–895`는 focus/disabled/busy의 render binding을 설명하면서 상태 의미는 06 §19에 둔다. 또 `docs/06_platform_ui_contract.md:630–638` 자체가 table baseline을 Decided로 선언한다.

**해석.** `operating-model.md:33`의 “DESIGN이 focus/input states를 소유”와 `representative-validation.md:39`의 “06은 인용 소비”는 render treatment와 공개 행동·접근성·플랫폼 최소치를 충분히 구별하지 않는다. 이 표현을 그대로 적용하면 DESIGN 수정만으로 06의 32px table contract, 상태/접근성 의미를 바꾼 것으로 오인할 수 있다. 수치 자체는 틀리지 않지만 권위 배정은 보강이 필요하다.

**다음 확인.** 후속 문구에서는 06 §4/§15/§19/§26을 플랫폼 행동·최소치·상태·접근성 권위로 두고, DESIGN을 token 값과 render recipe/상태 표현의 소유자로 나눠 표기한다. 32px은 06 §15의 Decided minimum과 DESIGN token binding, 25px은 DESIGN reference target, 44px은 coarse-pointer target으로 각각 확인한다.

### V-04 — V1/V2/V3 읽기 경로에 Data Trust §18이 빠져 있다

**사실.** `operating-model.md:71–74`의 새 메뉴·URL/시간·연구 채택 최소 읽기 묶음과 `representative-validation.md:7,12,17–22,28–30`은 Data Trust 또는 상태/adapter 영향을 말하면서 06 §18을 직접 포함하지 않는다. 원문 `docs/06_platform_ui_contract.md:739–772`는 freshness, calculation basis time, coverage, completeness/provisional, metric version, source/lineage의 공통 의미를 소유하고, `docs/06_platform_ui_contract.md:798–815`는 §19 상태 판정의 `statusSource`/`observedAt`과 unknown 예외를 둔다. §6.3의 TZ 미확인 표시(`06:250`)도 Data Trust를 명시적으로 소비한다.

**해석.** V1의 “Data Trust 대조”(`representative-validation.md:12`), V2의 TZ 미확인 벡터, V3의 Raw Evidence 상태 매핑은 §18을 읽지 않고도 끝난 것으로 기록될 수 있다. 이는 runtime 누락이 아니라 원문 coverage 누락이며, source/lineage와 원인 미확인·provisional 예외를 놓칠 위험이다.

**다음 확인.** 후속 문서 워크스루에서 V1/V2/V3와 운영 모델의 관련 묶음에 §18을 추가하고, `source/lineage`, `statusSource`, `observedAt`, `unknown`/`empty`/`forbidden`의 적용 범위를 직접 대조한다.

### V-05 — V2의 시간 변경 영향 검토가 01과 05의 중요한 예외를 모두 덮지 않는다

**사실.** `representative-validation.md:17–23`은 06→05→06.4/11/19→03/07/DESIGN 경로와 여섯 개 시간 반례를 제시하지만 01을 읽기 경로에 넣지 않는다. `operating-model.md:99`는 06 시간+05 R/H 변경의 소비자로 01을 명시한다. 실제 05 원문(`docs/05_roadmap_and_open_questions.md:57–61`)에는 `lateArrivalAutoHorizon/H` 미설정, `[R-H,R)` 창, 원천 진행 중단, 창 밖 정정 후보 보존, `autoRefreshClosed`가 완전성을 뜻하지 않는다는 예외가 있다. 01 원문(`docs/01_architecture_and_data_contract.md:43–51`)에는 지연 완료 외 마스터 소급 정정·설비 재분류·지표 정의 변경의 재계산 trigger와 세대 혼합 금지가 있다.

**해석.** V2는 R 부재를 “자동 재집계만 보류”로 올바르게 보존하지만, 현재 목록만으로는 R/H 변경의 전체 영향 검토가 완료됐다고 볼 수 없다. 이는 기존 예외를 잘못 바꾼 사실 오류라기보다, 검증 항목이 좁아진 coverage 문제다.

**다음 확인.** 후속 V2 대조에 01을 추가하고, H 미설정·`[R-H,R)`·원천 정지·창 밖 후보·`autoRefreshClosed`≠완전·세 가지 별도 재계산 trigger·R 부재와 독립적인 `defaultRangeTo` 물질화를 각각 판정한다. M4(`migration-plan.md:13,36`)의 요약 “R 부재 예외”도 이 문장 단위로 역대조한다.

### V-06 — V3의 Candidate 예외 목록은 원문보다 축약되어 있다

**사실.** `representative-validation.md:27–33`은 후보2의 log/history/current 축 분리, API key caller와 설비 ACL의 불일치, 무단 ID 조용한 필터 금지, naive→Seoul 추측 금지, offset 제거만으로 의미 보존 불가, 시간역 분리 조회, 요청 감사와 master audit 분리를 보존한다. 그러나 원문 `docs/integration/component-contract-candidates.md:56–71`에는 Configuration current/history의 파라미터 차이, API key/token payload·물리 경로·health 감사 범위, read-only/opaque cursor/status/error/partial failure, 단일 Site TZ가 공통 시간역 증명이 아니라는 예외, gateway default range를 `defaultRangeTo`로 위임할 수 없다는 예외도 있다.

**해석.** V3의 목록이 “대표적으로 보존할 예외”라는 축약으로는 사실에 맞지만, 후보 채택 검증의 완전한 체크리스트는 아니다. 후보 문서가 Research/Candidate이고 외부 원 구현의 실행·적합성을 증명하지 않는다는 V3의 상태 구분은 유지된다.

**다음 확인.** 후보2 채택 분기를 실행할 때는 원문 표의 각 행을 one-to-one으로 점검하고, 누락된 파라미터·감사 redaction·partial failure·default range·시간 매핑을 별도 결과로 남긴다. 이 검토는 외부 서비스의 현재 버전이나 실통합 적합성을 확인하지 않았다.

### V-07 — M1 네 파일 범위는 “선정된 포인터 정리”에는 충분하지만 전 저장소 stale 정리에는 부족하다

**사실.** M1은 `migration-plan.md:22`에서 `docs/INDEX.md`, `docs/03_backend_stack.md`, `docs/04_frontend_ui_ux.md`, `docs/07_app_shell_wireframe.md`만 대상으로 하며 06/DESIGN/05 본문 이관을 명시적으로 제외한다. 현재 `DESIGN.md:763`은 screenshot의 6개 그룹을 06 §9의 registry 그룹과 matching한다고 적고, `DESIGN.md:640–641`은 production navigation이 06의 7개 canonical group이라고 정정한다. `DESIGN.md:942`도 06이 exact sidebar/top-bar width를 고정하지 않았다고 적지만, 현재 06 §7(`docs/06:301–314`)은 270px/54px을 Decided canonical로 명시한다.

**해석.** 네 파일만으로 M1의 구체적인 03/04/07 상태 포인터와 INDEX 진입점을 고치는 작업은 실행 가능하다. 다만 “확인된 stale 상태”를 전 저장소의 stale 문구 정리로 읽거나 M1 완료를 전역 정합성으로 보고하면 범위를 넘는다. DESIGN의 두 문장은 M1에서 해결되지 않은 known boundary다.

**다음 확인.** M1 수용 판정은 “선정한 INDEX/03/04/07 포인터만 정리”로 한정하고, DESIGN stale 문구를 해결했다는 주장을 하지 않는다. DESIGN을 건드리는 후속 작업이 생길 때 6/7 그룹과 270/54 baseline을 별도 원문 대조한다.

### V-08 — Scope의 Open 범위가 너무 넓게 읽힐 수 있다

**사실.** `migration-plan.md:10,32`는 “TZ/Scope/필드명/구현 형식은 여전히 미결”이라고 묶는다. 하지만 `docs/06_platform_ui_contract.md:236–239`는 단일 `scopeId`, 매 요청 권한 재검증, 무단 Scope의 명시적 오류를 Decided로 두고, `docs/06:240`에서 hierarchy·상속·복수 Scope·설비 소속 규칙만 Open으로 둔다.

**해석.** 제품 계약을 잘못 승격한 것은 아니지만, M1 수용 기준의 “Scope 미결” 표현은 이미 닫힌 단일 Scope/재검증 불변식을 다시 Open으로 오독하게 할 수 있다.

**다음 확인.** 후속 문구에서 Open을 Scope hierarchy·상속·복수 선택·소속 규칙으로 한정하고, `scopeId` 1개와 서버 재검증은 Decided로 명시한다. 필드명/enum과 구현 형식 Candidate도 별도로 유지한다.

## 현재 산출물 상태 재확인

위 항목을 확인한 뒤 현재 checkout의 네 산출물을 다시 읽은 범위에서 다음 상태를 기록한다. 이 단락은 새 전수 검토가 아니라, 부모 작업에서 반영한 문구와 검토 중 생성된 파일이 기존 판정을 어떻게 바꾸는지에 대한 상태 갱신이다.

- `operating-model.md:3`, `migration-plan.md:23`, `representative-validation.md:3`은 `REQUIREMENTS`를 실제 루트 파일 `PLATFORM_REQUIREMENTS.md`의 약칭으로 명시한다. `migration-plan.md:12`는 기존 `[3/3]`, `[2/3]`, `[1/3 · 모델명]` 표기를 사용한다. 따라서 V-01의 M1 경로와 M3 표기 모호성은 현재 산출물에서 해소됐다.
- `operating-model.md:5`가 가리키는 `discussion/DECISIONS.md`는 현재 checkout에 존재한다. 따라서 V-02의 “없는 최종 판정 파일” 지적은 생성 전 상태에 대한 관찰이며, 현재 활성 오류로 남기지 않는다. 이 파일의 존재만으로 제품 원문 권위나 구현 승인을 주장하지 않는다.
- `operating-model.md:43,75–78`, `representative-validation.md:7,17,29,39,45`, `migration-plan.md:10,12–13,23,32,36`에는 §18, 상태 예외, 01/05 재계산 예외, 후보2의 전체 예외, 06/DESIGN 책임 경계, Scope의 Decided/Open 범위가 현재 문구로 반영되어 있다. 이 상태 갱신은 해당 반영이 있는지 확인한 것이며, runtime·외부 후보의 실행 적합성 검증을 뜻하지 않는다.
- V-07은 그대로 유효하다. M1은 네 파일만 대상으로 하므로 `DESIGN.md:763,942`의 stale 문구와 현재 `06:301–314`의 270px/54px 기준을 전역적으로 해결하지 않는다. M1 완료를 전 저장소 정합성 완료로 승격하지 않는다.

## 실행하지 않은 검증의 판정과 한계

`representative-validation.md:3,46,61`, `sample-time-contract.md:12,46,64`, `migration-plan.md:3,28`은 제품 runtime·성능·접근성·실제 migration을 실행하지 않았다고 명시한다. V1/V2의 “검증” 및 V5의 “검증 결과”는 현재 문맥에서 문서 대조·변경 영향 모의 검토로 읽어야 하며, `validation.json`에는 그 다섯 작업의 per-case pass/fail이나 실행 환경 기록이 없다. 따라서 이를 runtime 통과나 구현 완료로 승격할 근거는 없다. 샘플 exact match·local link·negative structural check만 현재 패키지 산출물로 확인된다.

## 확인 범위의 제한

- 원본 대조와 로컬 구조 산출물만 확인했다. runtime, renderer, 접근성 실기기, DB/IdP, 외부 서비스 버전·실통합 적합성은 확인하지 않았다.
- `sample-time-contract.md`의 byte-exact 여부와 DESIGN/06의 32/25/44 의미는 직접 확인했지만, 외부 참고자료의 현재 유효성은 exhaustive하게 검증하지 않았다.
- 위 항목은 원문 변경 제안이 아니라 네 산출물의 권위·상태·예외·검증 범위를 후속 작업자가 재확인할 지점이다.
