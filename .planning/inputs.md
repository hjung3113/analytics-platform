# 열린 입력 — 물어 와야 할 것과 아직 정해지지 않은 범위

사람이 골라야 하는 결정은 [README "결정 대기"](README.md#결정-대기--사람이-고를-것)에 있다. 여기는 **답을 받아 와야 하는 질문**과 **아직 범위가 정해지지 않은 입력**이다. 답이 오면 소유 문서를 Decided로 고치고 이 줄을 지운다.

## 누구에게 무엇을 묻나

| 담당 | 질문지 | 답에 기대는 이슈 |
| --- | --- | --- |
| 사내 SSO | [사내 적용 가이드](../docs/integration/in-house-rollout.md) §3 | #150 → #86, #98 나머지 절반, #154, #155 |
| 사내 인프라 | 사내 적용 가이드 §3 | #151 |
| 사내 백엔드(FastAPI) | [전송 형식 초안](../docs/integration/http-adapter-contract.md) §10, 사내 적용 가이드 §3 | #149 합의, #148 의견 → #154, #155, #165 |
| 파서 담당 | [적재 워커 상태 스키마 초안](../docs/integration/ingest-status-schema.md) §7 | #37 → #51, #155의 신뢰 원천 |
| FeedbackOps 저장소 | FeedbackOps#548, FeedbackOps#549, [딥링크 계약](../docs/integration/feedbackops-deeplink.md) §5 | #84, #85, #81 |
| 업무 수요 확인 | — | #163(자유 피벗), #164(셀 범위 복붙·채우기) |

#165(폴링·계산 세대)와 #155(서버)를 시작할 때는 [플랫폼 구축 리서치 종합](../docs/research/platform-build-2026-09-22/SYNTHESIS.md) §5(요청 경쟁·계산 기준·접근 가능성 분리, 읽기 수명, export 권한, 성능 측정)를 설계 입력으로 읽는다.

## 미결 범위

번호는 옛 `PLATFORM_REQUIREMENTS.md` Open Questions 번호를 유지한다(화면 설계 문서가 이 번호로 인용한다). 1·10·14번은 결정이 끝나 지웠다.

<a id="q2"></a>
**2. Scope 상속 세부** — 관계(Site → room_name → StGroup → Equipment, Line 독립 축)와 room_name 기준 권한은 Decided(ADR-0004·0005). v1 단일 Scope와 상속·행 스코핑 방식은 Open([06 §6.2](../docs/06_platform_ui_contract.md#62-scope와-권한-decided--open)).

<a id="q3"></a>
**3. 시간 의미** — TZ는 Asia/Seoul 단일값으로 시작(Decided). timeDomain assertion 공급자, 교대일/영업일, 다중 Site의 "같은 날짜"는 Open. assertion 공급 근거는 복수 시간축 병합을 제공하기 전에 필요하다([06 시간 계약](../docs/06_platform_ui_contract.md#ctx-time)).

<a id="q4"></a>
**4. 운영 수치** — `defaultRangeTo` 기본 길이, 실제 데이터 볼륨·조회 패턴, 최대 조회량·timeout, 폴링 중단 조건·워커 감지 주기. (`H`=1시간, 폴링 5분은 Decided.)

<a id="q5"></a>
**5. 인증·배포** — 사내 SSO 프로토콜 사양(#150), 브라우저 지원 범위(#151).

<a id="q6"></a>
**6. 상태 근거 서비스** — 수집·파서 지연·coverage 판정의 `statusSource`·`observedAt` 공급자. 없으면 모니터링 메뉴(#51)를 열 수 없다(#37).

<a id="q7"></a>
**7. 공개 계약 산출물 형식** — 필드명·공집합 표식·assessment enum을 OpenAPI/JSON Schema/codegen 중 무엇으로 확정할지(#148), URL `v` 폐기(sunset) 정책.

<a id="q8"></a>
**8. 디자인 바인딩 잔여** — 대용량 성능 측정. 다크모드는 Deferred(05).

<a id="q9"></a>
**9. 공지·알림** — 공지 배너 위치·노출 조건, 알림 벨의 읽음/집계/권한 의미(벨 자체는 필수 아님). FeedbackOps 2단계의 알림·감사 통합 결정과 함께 본다.

<a id="q11"></a>
**11. 업무 모델 세부** — 마스터 필드별 외부/플랫폼 소유권과 전환 순서(ADR-0003), VOC 담당 조직·상태 전이 예외.

<a id="q12"></a>
**12. 운영 완료 기준** — 가용성·복구 목표(RTO/RPO), 감사 보존 기간, 대량 작업 실패 재개 책임.

<a id="q13"></a>
**13. 추가 메뉴 착수 조건** — 알람/이상탐지·리포트 빌더·저장된 뷰를 정당화할 실제 수요·반복 사례가 있는가.

<a id="q15"></a>
**15. 보조기술 사용자** — 06 §26 접근성 기준은 Decided. 실제 사용자 유무에 따른 투입 우선순위만 남았다.

## 사내 메뉴를 만들 때 정할 것 (견본 메뉴에서 나온 질문)

견본 메뉴는 사내에서 새로 만들므로 지금 정하지 않는다.

- **기준정보(공정·레시피·자재)**: 탭 하나의 페이지인가, 메뉴 두 개인가(현재 manifest는 `master-process`·`master-recipe` 두 메뉴, 화면 없음). 유형별 안정 키·유일성, Recipe 마스터와 PRC `prc_name`의 관계(키·원천·이름 변경 전파), 필드별 원천 소유권(정해질 때까지 쓰기 없음), '자재' 용어·식별키, 공정 마스터 변경이 설비 `room_name`에 미치는 영향, 유형 탭·상세의 URL 계약과 유효구간 필요 여부. 원래 설계는 git 이력의 `docs/10_reference_data_wireframe.md`.
- **CFG 데이터**: 형식과 mart 의존성([01](../docs/01_architecture_and_data_contract.md) CFG 경계, [반도체 도메인 조사](../docs/research/semiconductor-domain-2026-09-24/README.md)).
