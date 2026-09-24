# 반도체 도메인 외부 조사

작성일: 2026-09-24. 상태: **Research / Candidate**.

후속 도메인 확인(같은 날 [2차 인터뷰](../../reviews/2026-09-24-equipment-routing-domain-interview-round-2.md)): XFR/FNC/PRC는 Module/Slot grain, CFG 기록은 설비 단위이며 Module 대상은 값 내부 속성(테이블 분할 키 아님)이다. 분석의 유효값 기준은 Job 시작 시점 하나로 충분하다. 아래 외부 조사·형식 제안의 Candidate 상태는 유지한다.

이 문서는 외부 표준·특허·제품 자료를 이번 세션의 열린 질문에만 비춘 조사다. [CONTEXT.md](../../../CONTEXT.md)와 `docs/adr/`, [06](../../06_platform_ui_contract.md)의 Decided를 덮지 않는다. 용어를 바꾸거나 CFG 형식을 확정하는 문서가 아니다. 다음 리뷰의 입력이다.

범위는 세 가지다. Operation이라는 임시 이름이 업계 용어와 맞는지, CFG를 어떤 데이터 형태로 봐야 하는지, 생산성·연계 분석이 이미 있는 제품 패턴을 벗어나는지. `CONTEXT.md`에 이미 있는 Carrier/Lot/Recipe 정의는 반복하지 않는다.

한/영 UI에 대해서는, 이번 결정(UI 문구·정적 본문만 번역, 마스터 값·식별자는 그대로)을 뒤집을 자료를 찾지 못했다. SEMI의 PPID·ECID는 표시용 번역 문자열이 아니라 호스트와 설비가 주고받는 식별자다.

## 1. 용어 — Operation을 유지해도 되는 이유

**Operation은 SEMI E40 Process Job이 아니다.** E40 Process Job은 설비에 내려가는 실행 요청이다. 어떤 기판(또는 캐리어 슬롯)을, 어떤 프로세스 프로그램으로 처리할지와 그 수명주기(QUEUED → PROCESSING → COMPLETE)를 담는다. E94 Control Job은 그 Process Job을 하나 이상 묶어 캐리어 단위 작업을 스케줄한다. E87 Carrier는 물리적 용기(FOUP 등)다. 팹 전역 라우팅의 한 단계에 대한 SEMI 표준 이름은 없다. 이 프로젝트의 Operation(Lot이 외부 시스템에서 공급받는 라우팅 작업 단위, v1 필터에서는 제외)을 Process Job으로 바꾸면 설비 쪽 잡과 섞인다.

**MES 쪽 이름은 원래 둘로 갈라져 있다.** PROMIS에서 라우트의 한 줄은 `operdef`의 `opername`이고, 같은 특허 문장이 그것을 step이자 operation이라고 부른다. 설비 타입은 `stnfam`(station family), 설비 한 대는 `stn`이다. 사이클타임 제품 FabTime도 같은 대상을 operation이라고 부르고, 직전 단계라는 뜻으로 step도 같이 쓴다. 이쪽의 step은 라우트 방문이다. 레시피 안의 step이 아니다.

**레시피 step은 별개 객체다.** Applied Materials 클러스터 툴 특허의 구분이 이 프로젝트의 파서 충돌과 같다. PPID로 식별되는 프로세스 프로그램이 있고, 그 시퀀스의 한 스텝은 챔버 경로이며, 챔버 레시피는 그 챔버 안에서 도는 sub-step의 묶음이다. PRC 로그의 Step/StepNo/StepSeq와 이름을 피하려고 Operation을 고른 것은 임시 이름이 아니라, 라우트 단계와 레시피 단계를 가르는 업계 구분과 맞다. FACTORYworks 계열은 라우트 단계를 Step이라고 부르므로, 그 시스템과 말할 때는 alias로 적어두면 된다. 개명할 이유는 없다.

**Job도 E40 Process Job으로 개명하지 않는다.** 프로젝트의 Job은 한 Lot이 한 Operation 안에서도 여러 개로 나뉠 수 있는 생산성 분석 grain이다. E40 Process Job은 레시피 하나와 기판 목록을 가진 설비 잡이고, 그 안에 이송·챔버 스텝이 여러 번 들어간다. 같은 단어여도 grain이 다르다.

**PPID = FlowId, Recipe = RecipeId 단순화는 클러스터 툴 용법과는 맞고, GEM의 일반 정의는 아니다.** GEM에서 PPID는 프로세스 프로그램(재사용 가능한 처리 지시·설정·파라미터)의 식별자일 뿐이다. 단챔버 설비에서는 그 프로그램이 곧 챔버 레시피인 경우가 많다. 위 Applied 특허는 반대로, PPID → 챔버 간 시퀀스 → 챔버 레시피(서브스텝)로 나누고, 한 Lot 안에서도 기판마다 PPID가 다를 수 있다고 한다. 프로젝트의 “Operation을 수행하는 방법 하나 = PPID, PPID:Recipe = N:M”은 이 클러스터 툴 구조와 맞다. SEMI가 PPID를 항상 플로우로 정의해서가 아니다. 파서의 FlowId/RecipeId에 맞춰 둔 로컬 규약으로 유지하고, GEM 정의에 맞춰 되돌릴 필요는 없다.

**StGroup은 `stnfam`이 아니다.** `stnfam`은 설비 타입이라 Model/ChamberType에 가깝다. StGroup(한 Operation을 서로 대체할 수 있는 설비 묶음, 챔버·분임조가 아님)에 가까운 업계 말은 capability 또는 qualified tool group이다. Critical Manufacturing은 Lot이 capability를 요구하고 설비가 capability를 제공한다고 보고, 챔버 가용성이 설비 capability를 끌어내린다. FabTime의 병목 집계 단위도 tool group이다. 이름은 유지한다. 나중에 “이 챔버가 죽어서 이 Operation을 못 한다”를 StGroup에 넣으려면, 지금 확정한 설비 단위보다 한 단계 아래가 필요하다. 그건 아직 이 용어의 범위가 아니다.

## 2. CFG — 한 종류의 데이터가 아니다

후속 인터뷰에서 설비 단위 기록·값 내부 Module 대상·Job 시작 시점 유효값까지 확정됐다. 원천은 이벤트 로그·파일·외부 시스템이 섞여 있다. 형식은 Open이다. 업계도 이것을 하나의 객체로 두지 않는다.

| 형태 | 표준에서의 자리 | 키 | 이 프로젝트 CFG와의 관계 |
| --- | --- | --- | --- |
| Equipment Constant | SEMI E30. 비휘발성 read/write 설정. 바꾸면 설비 동작이 바뀐다. 변경은 collection event로 호스트에 알린다 | 설비(실제로는 모듈)의 ECID → 값 | 인터뷰의 “설비 단위 설정”에 가장 가깝다 |
| 레시피 파라미터 | E30 프로세스 프로그램, SEMI E139(Recipe and Parameter Management). 프로그램 생성·수정·삭제 이벤트가 따로 있다 | PPID/레시피(+ 레시피 스텝) → 파라미터 셋 | PRC를 좌우한다. 설비 전역 키가 아니다. 이미 Recipe로 다루는 쪽에 가깝다 |
| 트레이스·상태 | Status Variable, Data Variable, 트레이스 | 시각 × 센서 | FDC의 본체. 설정이 아니다 |
| R2R/APC 보정값 | SEMI E133은 R2R·FD·SPC가 공장 시스템과 데이터를 주고받는 인터페이스다 | 툴 × 챔버 × 레시피 × 제품/레이어의 상태, 런마다의 오프셋 | 실행 시점의 제어 출력이라 설정 마스터가 아니다 |

Applied 특허가 이 갈라짐을 XFR/PRC에 그대로 쓴다. 챔버 레시피가 공정 시간을 정하고, Equipment Constant는 이송 로봇이 어느 챔버를 먼저 서비스하는지를 정한다. “CFG가 XFR/FNC/PRC 동작을 좌우한다”는 말만으로는 레시피 본문인지 설비 상수인지 구분되지 않는다. 인터뷰가 설비 단위라고 답한 것은 레시피 본문·트레이스·R2R 오프셋이 아니라 **EC에 가까운 쪽**으로 읽힌다.

그래서 CFG 화면을 만든다면, 업계에서 빠지기 쉬운 실수는 “지금 값”을 보여주는 것이다. EC는 바뀔 때까지 유효한 값이라, Job과의 조인은 설비 + 그 Job 시작 시각에 유효했던 값이어야 한다. 형상은 파라미터 식별(이름, 단위)과 유효 시각이 있는 변경 이력이다. 원천이 로그·파일·외부 시스템으로 섞여 있는 것은 이 모델과 충돌하지 않는다. 당초 질문했던 grain은 후속 인터뷰로 해소됐다. **기록은 설비 단위이고 Module 대상은 개별 CFG 값 안의 속성**이다. 분석은 Job 시작 시점 값 하나로 충분하며 구간별·Job 중간 CFG 변경 모델은 요구하지 않는다. 구체 값 스키마와 원천 매핑은 여전히 Open이며 별도 Recipe 키나 Module 테이블 분할을 추론하지 않는다.

메뉴 간 이동을 보류한 것(인터뷰 14)은 화면 연결을 미루는 것이지, 이 유효 시각 모델을 미루는 것이 아니어야 한다. 향후 §22 연계를 검토하더라도 유효값 조인 기준은 Job 시작이다. 설정 변경/정정의 mart 의존·재계산 정책은 [01](../../01_architecture_and_data_contract.md)에 Open으로 추적하며 이 조사로 자동 트리거를 확정하지 않는다.

## 3. 제품 패턴 — 없는 화면을 만들고 있는 것은 아니다

생산성 분석과 FDC는 이미 다른 제품이다.

FabTime류 사이클타임은 Lot이 한 operation에 머문 시간이다. 직전 스텝 move-out부터 이번 스텝 move-out까지이고, 그 안에 이동·대기·공정이 들어 있다. 집계는 operation × tool group이고, 화면은 X-factor(실제 시간 / 이론 공정 시간), 운영 곡선(가동률 대비 X-factor), 툴 상태 추세·파레토(대기, WIP를 두고 쉰 시간, 공정 종료 후 move-out까지의 시간)다. 이 프로젝트의 Job 단위 XFR/FNC/PRC는 그 “공정 시간” 안을 쪼개는 것이다. 라우트 사이클타임을 대체하지 않고, 그 한 칸의 내부를 본다.

FDC류는 다른 질문이다. 특허 US8285414가 보여주는 연결은 챔버×레시피 리포트 → 센서 트레이스 히트맵 → 레시피 스텝 기준선 비교다. 키가 챔버, 레시피, 레시피 스텝, 시각이다. “이 런이 정상 궤적이었는가”이지 “이 Job이 왜 오래 걸렸는가”가 아니다.

설비 성능 표준 SEMI E116은 모듈(챔버, 로드포트, 로봇)별로 IDLE / BUSY / BLOCKED와 태스크 유형(Process, Support, Waiting 등)을 보고한다. XFR/FNC/PRC와 같은 가족(설비 스스로 남기는 시간 블록)이지만 이름 대응은 되지 않는다. E116 태스크 유형을 도메인 용어로 가져오지 않는다.

§22에 이미 있는 이동(사이클타임 → 느린 실행 → 실행 상세 → 타임라인)은 FabTime형 드릴과 같은 방향이다. 업계가 이미 풀어 둔 패턴 중 여기에 없는 것은 별도의 메뉴 구조가 아니라, 그 드릴에 붙는 컨텍스트다. 설비, PPID/Recipe, Lot과 Job, 시각, 그리고 Job 시작 시점에 유효했던 설정. CFG의 메뉴 간 연계를 나중으로 미룬 것은 이 패턴을 버린 것이 아니라, 설정 쪽만 뺀 것이다. 트레이스 뷰어는 이번 범위의 빠진 조각이 아니다. 다른 제품이다.

## 다음 리뷰에 올릴 것

- Operation, PPID, StGroup, Job 이름은 유지. 용어집에 alias만 고려한다. Operation = PROMIS operation / FabTime operation(라우트 방문). Job ≠ E40 Process Job. StGroup ≈ capability / tool group. StGroup ≠ `stnfam`.
- CFG 형식은 아직 닫지 않는다. 기본 후보는 설비 스코프의 유효 시각 이력(EC에 가까운 것)이다. 설비 기록/값 내부 Module 속성과 Job 시작 시점 기준은 확인됐고, 구체 형식·소비 계약만 Open이다.
- 플랫폼 정체성(메뉴 사이 문맥 이동)은 사이클타임 드릴로서는 업계 패턴과 맞다. 빠지기 쉬운 것은 화면 종류가 아니라, 느린 Job에서 “그때의 Recipe와 Job 시작 시점에 유효했던 CFG”로 가는 조인이다.

## 출처

- SEMI E40 요약: [PEER Group](https://www.peergroup.com/definition-of-standard/semi-e40/). E94: [KXWARE](https://www.kxware.com/en/semi-standards/gem300-standards/semi-e94/), [Kontron](https://kontron-ais.com/en/resources/semi-standards/semi-e94). Carrier·Job 관계: [3D InCites, GEM300](https://www.3dincites.com/2020/07/semiconductor-back-end-processes-selective-gem300-adoption/).
- PPID는 프로세스 프로그램 식별자: [Ignition SDL, SEMI E5 기반](https://www.docs.inductiveautomation.com/docs/8.3/ignition-modules/secs-gem/secs-definition-language-sdl-file). 프로세스 프로그램 정의·EC 변경 보고의 문안: [SEMI E30 위원회 초안 5549A](https://downloads.semi.org/web/wstdsbal.nsf/de4d7939711aeedf8825753e0078317f/d3de1503d6ecb9e1882580c700222251/$FILE/5549A.pdf) (초안이며 구매본 표준이 우선). EC/SV/프로세스 프로그램 요약: [learn-semi E30](http://www.learn-semi.com/post-e30), [KXWARE E30](https://www.kxware.com/en/semi-standards/secsgem-standards/semi-e30/).
- PPID → 시퀀스 → 챔버 레시피, EC가 이송 우선순위를 바꿈: [US20130226336A1](https://patents.google.com/patent/US20130226336A1/en) (Applied Materials).
- PROMIS `opername` / `stnfam` / step=operation: [US6128588A](https://patents.google.com/patent/US6128588A/en).
- Capability, 챔버 의존 레시피, E139 매핑: [Critical Manufacturing, Advanced MES](https://www.criticalmanufacturing.com/wp-content/uploads/2024/09/Advanced-MES-Capabilities-for-Semiconductor.pdf). E139·E133 초록: [SEMI E139](https://store-us.semi.org/products/e13900-semi-e139-specification-for-recipe-and-parameter-management-rap), [SEMI E133](https://store-us.semi.org/products/e13300-semi-e133-specification-for-automated-process-control-systems-interface).
- E116: [SEMI 스토어 초록](https://store-us.semi.org/products/e11600-semi-e116-specification-for-equipment-performance-tracking), [PEER Group](https://www.peergroup.com/definition-of-standard/semi-e116/). 태스크 유형 나열은 벤더 요약인 [KXWARE](https://www.kxware.com/en/semi-standards/gem300-standards/semi-e116/).
- Operation 사이클타임, X-factor, 툴 상태 파레토: [INFICON FabTime 프레임워크](https://www.inficon.com/en/news/a-fab-cycle-time-improvement-framework), [FabTime 뉴스레터 25.04](https://www.inficon.com/media/11404/download/FabTimeNewsletter25.04.pdf?v=1).
- 챔버×레시피 연결 리포트: [US8285414B2](https://patents.google.com/patent/US8285414B2/en).
