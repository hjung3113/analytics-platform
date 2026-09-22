# 현황 지도와 내용 진단

기준: 2026-09-22, HEAD `2d6fe5ad9f9d610e45ba028930f7c2effdad9d4a`, 시작 dirty/untracked 없음. 원본 해시는 `source-snapshot.json`. FeedbackOps gitlink `b5dd614ac8da3792cb1627e7daeffb8fc9c4944e` 확인. 이 문서는 현황 분석이며 제품 계약이 아니다.

## 현재 지도

아래 책임은 현행 본문 기준이다. 목표 이관 위치와 혼동하지 않는다.

| 자료 | 독자/현재 역할·소유 내용 | 경계/선행·후행 |
|---|---|---|
| AGENTS / README | 작업자 규칙, 저장소 진입, Kernel 목적 | AGENTS→INDEX. README 메뉴 나열만으로 구현 범위 해석 금지 |
| INDEX | 역할별 경로, 00–07 책임·Research 진입 | DESIGN/REQUIREMENTS 직접 항목 부족; 원문 계약 대체 아님 |
| 00 | 목적·YAGNI와 과거 리뷰 정정 | parser 독립; docs/23은 upstream 설계 입력, 실행 계약과 구별 |
| 01 | view/mart·grain·버전·집계·계산세대·마스터 소유 | parser upstream→소비 계층→API. 실제 fixture/지원 revision 미제공 |
| 02 | 6개 도메인 capability·객체 의미와 공통 기능 요약 | 06의 7개 navigation과 다른 분류. Phase 언급은 05 Deferred로 제한 |
| 03 | 백엔드 후보와 SQL/API/worker 책임; wall-clock 원천 의미·상태 근거 | 06 §6.3이 원천 시간 의미를 여기로 역참조. 전부 기술 후보라 분류하면 계약 손실 |
| 04 | FE 후보·2026-09-17 조사·화면 패턴·주석 설계 | 06 소비. 주석 영속 의미도 있어 전부 연구로 일괄 이동 금지 |
| 05 | 상태/질문 + 폴링·DB 접근·R/H의 상세 원본 + 과거 Phase | 현재 세 메커니즘 원본은 여기. 06 §6.3이 R 정의를 소비 |
| 06 | 전역 UX/URL/Context/Scope/Registry/IA/상태·거버넌스 | 하위 Decided·Candidate·Open·Deferred 혼재. 값 270/54/32 원본은 DESIGN |
| 07 | 06 소비 App Shell spec/시나리오·Candidate 배치 | 런타임 검증 아님. 로컬 UI 질문과 전역 상태 재진술 혼합 |
| DESIGN | 시각 토큰·render 상호작용·참고 dashboard recipe·Open/리뷰 이력 | 행동/권한/시간은 06 우선; screenshot은 데이터·메뉴 승인 아님 |
| REQUIREMENTS | 계약 재진술·신규 제안·Must/Should·결정 체크·미결 질문 | 파생 작업 후보. 모델 표수는 권위/구현 증거 아님 |
| HANDOFF | 세션 배경·당시 결과·다음 작업 | 현재 사용자 요청/Git/원문보다 우선하지 않음 |
| integration/layout | 독립 FeedbackOps gitlink·소유권·갱신 절차 | 런타임 통합·공통 패키지 채택 미결 |
| integration/ideas, component candidates | 출처 있는 재사용 가설과 게이트 질문 | Research/Candidate. parser 소비는 이미 존재하는 기준선 |
| research | 조사·토론·종합 권고, 일부 오류를 후속 기록에서 정정 | 원본 3개 사본과 원본 위치 존재; 채택/실서비스 검증 아님 |
| reviews / .agents/reports | 당시 반례·판정·조사 근거 | 현재 상태를 원문에서 재확인; 역사 내용을 새 규범으로 검색하지 않음 |
| .agents/skills, commands | 작업 절차·참고 도구 | 제품 결정권 없음; 원본 .agents, 호환 symlink 별도 편집 금지 |
| references | 고정 외부 자료와 적용 경계 | upstream 사본 불변. 수집 날짜·commit·hash와 적용 근거를 분리 |

## 원문 확인 문제 목록

심각도는 제품 버그가 아닌 구현 오독/운영 위험이다. '수정'은 후속 제안이며 이번에 적용하지 않았다.

| ID / 우선도 | 확인한 근거와 재현 가능한 오독 | 후속 처리 / 종류 |
|---|---|---|
| D01 / 높음 | 03 '시간 계약'은 half-open·TZ 미확인 처리를 Phase 0 결정 대상으로 열어 두지만 06 §6.3은 Decided | 원천 wall-clock 설명 보존, 결정된 메커니즘은 06 링크, 실제 TZ/영업일만 Open. 명료화 |
| D02 / 높음 | 04 '정보구조·Context·딥링크', 07 §6은 URL 버전/오류·직렬화를 Open처럼 기술. 07 §8은 이미 메커니즘 Decided로 수정되어 파일 내부에서도 갈림 | 06 §6.4로 상태 소비. 필드명 Candidate 보존. 명료화 |
| D03 / 높음 | DESIGN Components→Navigation은 screenshot 6그룹이 06 §9에 맞는다고 하며, 같은 파일 Open Decisions는 불일치 인정 | 7그룹 권위 유지; screenshot 목록은 예시라고 인접 표시. 수치/IA 재결정 아님 |
| D04 / 높음 | 05 '결정 상태' 문서가 지연완료 `[R-H,R)`·R 부재 예외의 유일 상세 원본이며 06 §6.3에서 참조 | 단순 색인화로 삭제 금지. 현재 원본 표기 후 완전성 대조 이관 |
| D05 / 높음 | REQUIREMENTS 서두 '[3/3] 신뢰도가 가장 높다', §0 [x] 결정 완료와 이후 구현/제안 [ ] 혼합, 'Open Questions 결정 전 구현 금지' | 출처 수/우선순위 제안/설계 상태/delivery 분리. 06 §6.4 허용 경로에 scoped blocker 적용 |
| D06 / 높음 | 06 §13 'shadcn/ui + Base UI를 기반'과 04/05 Candidate | 기술 채택 상태 충돌 후보. 04/05와 research SYNTHESIS §1/§3을 보면 채택 증거 없음. 라이브러리를 새로 결정하지 말고 문구 정렬 검토 |
| D07 / 중간 | INDEX 메뉴 구현 시작점 04, DESIGN이 독립 시각 원본으로 등재되지 않음 | 작업별 06→도메인→spec→DESIGN/후보 경로 보강 |
| D08 / 중간 | 06 §23 Candidate radius/type/spacing과 DESIGN 값이 반복, 상호 '일치' 기록 | 값 의미/상태 보존하며 단일 편집 책임 지정; Candidate 숫자를 Decided로 올리지 않음 |
| D09 / 중간 | DESIGN Open Decisions '06은 정확한 픽셀을 고정하지 않음'은 현재 06 §7/§15와 불일치 | 과거 당시 진술로 분리, 현재 270/54/32 단일 원본은 유지 |
| D10 / 중간 | 01의 외부 docs/23, docs/09·11·22 섹션 참조에 소비 revision·fixture 경로 없음 | upstream locator/확인 revision 확보는 추가 조사. 권위 있는 입력과 실제 지원 버전 구별 |
| D11 / 중간 | component candidates의 `#L41-L54` 등은 Markdown heading anchor와 다름 | 로컬 렌더러에서 이동되는지 검증; path 존재만으로 참조 성공 주장 금지 |
| D12 / 중간 | REQUIREMENTS §3 'metricId+metricVersion 한쪽만 ... 최신 버전 대체 금지'는 06 §6.1의 명시적 초기화 허용을 담지 않음 | 체크리스트는 예외가 있는 원문 계약 단위 링크로 소비. 요약만으로 부정 테스트 만들지 않음 |

## 내용 충실도: 구현자가 추측하면 안 되는 항목

| 범위 / 근거 | 이미 확정된 것 | 부족한 입력·실패 조건 / 후속 주체 | 막히는 범위 / 지금 가능한 범위 |
|---|---|---|---|
| Registry / 06 §5–6 | 선언 책임·지원 Context·금지사항 | 실제 필드/타입/등록 API·중복 ID/path 처리·검증 산출물. Kernel 담당이 제안, 담당자 지정 필요 | 운영 Registry 구현 완료 주장 불가 / 개념적 consumer spec 가능 |
| 공개 codec / 06 §6.1/6.4 | 반복 집합/단일 중복 오류/지표 쌍 예외/버전 | Candidate 이름 최종 채택·하나의 FE/BE artifact·호환 decoder 수명. 기술 검토+운영 sunset 승인 | 운영 wire 고정 불가 / 계약 벡터·오류 사례 준비 가능 |
| Scope / 06 §6.2 | 요청 scopeId 1개·매 요청 재검증 | hierarchy·상속·설비 소속 이력/변경·조직 실제 정책. 업무/보안 담당 입력 | 계층/다중 Scope 구현 / 선택·재검증·거부 spec 가능 |
| 시간 / 06 §6.3 | naive·half-open·assertion 전체 구간·R 부재 예외 | timeDomain assertion 공급자/갱신·TZ 실제 값·Δ/프리셋. 데이터/업무 담당 | 미증명 병합·자동 기본기간 임의 산정 / 단일 설비 naive 설계 가능 |
| 상태 / 06 §19, 03 마지막 절 | 2층 응답·적용 kind 완전성·unknown·인과 증거 | 각 조회 적용 kind 목록·statusSource/observedAt 실제 공급·유효성 기준 | 원인 확인 UI / unknown과 empty 의미 검토 가능 |
| mart / 01,05 지연완료 | 4 재계산 원인·계산세대·R/H·창 밖 보존 | 입력 revision/공개·pin·실패 재개/retention은 research 후보, H 값 미정. 데이터 운영 입력 | 자동 재집계 운영 / 정책·반례 문서화 가능 |
| 마스터 / 01,02 | 발견한 equipment_id, business 속성, 이력≠Audit | 필드별 외부/플랫폼 원천·쓰기 충돌·소급 수정 정책 | 쓰기/동기화 / read-only 화면 소비 spec 가능 |
| 시각/상호작용 / DESIGN | canonical 셸/밀도, 포커스·상태 원칙 | CJK/실렌더·키보드·대비 증거 없음, preset/queue 의미 Open | 시각 구현 검증 완료 주장 / token 원문 찾기 가능 |
| 감사 / 02, integration 후보2 | 변경 감사 who/when/before-after | 요청 감사는 별도 후보, identity·보존·열람·redaction·실패 의미 불충분 | 공통 Audit 운영 승인 / 경계 표 작성 가능 |

누락은 전체 저장소에 절대 없다는 주장이 아니다. 위 명시 범위에서 실행 계약에 필요한 값/증거를 찾지 못했다는 진단이다. 후속 구현 전에 소유 원문과 승인 기록을 추가 조사한다.

## 현재 결정표 밖의 미결 사항

`docs/reviews/2026-09-18-url-time-status-contract-grilling.md` §8을 직접 확인했다. 403/404 존재 누설 정책, DST gap/overlap 변환 세칙, backfill 실행 권한 세칙, assessment kind 구체 목록 등은 이력에 명시돼 있지만 05의 짧은 Open 목록에는 개별 항목으로 드러나지 않는다. 이것을 누락됐다는 이유로 Decided로 보거나 새 결정을 만들어서는 안 된다. 후속 담당이 현재 계약·승인 기록을 확인하여 아직 열린 항목만 해당 원문에 연결해야 한다. 특히 403/404는 보안 정책 검토가 필요하며 일반 오류 문자열 선택으로 축소하지 않는다.

## 과거 감사 재검증

기존 `.agents/reports/docstructure-{codex-astra,grok}.md`는 유효한 조사 출발점이다. 그러나 다음은 이미 정정됐다: 00의 시간 정정 위치는 06으로 변경, 03 재현성도 06 직접 참조, 06 상단 셸/밀도 Decided 표기, 07 §8 URL/시간 상태, REQUIREMENTS Open Q1 취소선·완료, wireframe SKILL의 DESIGN 존재 안내. 과거 감사 항목을 그대로 미해결 목록으로 복사하지 않는다. D01–D12는 현재 원문으로 다시 판정했다.
