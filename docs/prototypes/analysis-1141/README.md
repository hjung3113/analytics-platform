# #1141 분석 밀도·도킹·강조 프로토타입

**상태: Candidate · 실제 앱에 붙인 개발 전용 `?variant=` 시안 코드. 사용자 확정 아님.**

- 이 브랜치는 일회성 비교용이다. `main`과 정식 `DESIGN.md`/토큰/공개 SDK 계약을 수정하지 않는다.
- 프로토타입은 **실제 플랫폼 앱**의 HW Time 4개 메뉴 및 보드가 사용하는 SDK 소비 경로에 조건부로 적용된다. 별도 HTML 목업이 아니다.
- **제한:** 이 프로토타입의 코드 변경은 커넥터로 수행했다. 작업 환경에 pnpm 의존성/실행 앱이 없어 **실제 앱 구동, 화면 캡처, 성능 측정, 컴파일/테스트 성공을 확인하지 못했다**. 아래 체크를 통과해야 시안으로 사용한다.
- 기존 요구·평가표·이슈 범위: https://github.com/hjung3113/analytics-platform/issues/1141

## 비교 방법

개발 모드에서 플랫폼을 시작하고(레포 개발 매뉴얼에 따라 pnpm 의존성 설치 후 `pnpm --filter @ap/platform-web dev`) 다음 세 URL 중 하나를 사용한다.

| 시안 | 예시 URL (개발 서버 주소에 추가) | 차이 |
| --- | --- | --- |
| C = 현행 | `/hw-time/overview` | 현행 페이지 padding, embedded card, `emphasis.focus=series`, 현행 Dockview |
| A = Dense + Gentle | `/hw-time/overview?variant=analysis-dense` | 16/12/16px 페이지 여백, 도킹 카드 중복 경계/헤더 여백 축소, HW Time 막대 비선택 계열 비흐림 |
| B = Dense + Gentle + Snap | `/hw-time/overview?variant=analysis-snap` | A + Dockview 네이티브 분할 타깃 outline/탭 삽입선/절제된 탭 이동 모션 |

동일 `?variant=`를 `/hw-time/steps`, `/hw-time/compare`, `/hw-time/table`, `/board`에도 적용한다. `?variant`는 일반 업무 URL 계약이 아니라 **개발 앱 내부의 일시적인 표시 스위치**다. 모듈 수준에 고정된 Dock theme 때문에 시안 전환은 **URL 변경 후 전체 새로고침**으로 테스트한다.

## 구현 범위

- `apps/platform-web/src/main.tsx`: dev 실행과 명시적 A/B variant에서만 `data-ap-analysis-prototype`를 루트에 설정한다. 일반 URL·production의 결과는 baseline.
- `apps/platform-web/src/dev/analysis1141Prototype.css`: 데이터 영역의 여백과 임베디드 차트·표의 2중 card chrome만 조건부 조절. `@ap/ui` 컬러/폰트 토큰 자체는 변경하지 않는다. **가상화된 테이블 행 32px은 그대로 둔다.**
- `packages/sdk/components/src/chart/AnalysisChartFrame.tsx`, `buildChartOption.ts`: dev A/B + `chartId`가 `hw-`로 시작할 때만 ECharts emphasis focus를 `none`으로 설정. 데이터 값/series color/실제 클릭·드릴·선택 행 outline은 유지. **새 공개 SDK prop을 추가하지 않는다.**
- `packages/sdk/components/src/dock/DockEngine.tsx`: B에서만 기존 Dockview native theme의 `dndOverlayBorder`·`dndTabIndicator`·`dndPanelOverlay`·`tabAnimation` 사용. 새 도킹 엔진/오버레이를 만들지 않는다. `prefers-reduced-motion`이면 tab animation은 `none`.
- `AnalysisChartFrame.rowFocus.test.tsx`: A/B focus 강도 비교와 baseline 강조 회귀 테스트.

## 시안 평가 순서 (동일 데이터·상태)

1. HW Time 개요 L1/L2/L3, 비교 L1/L2/L3, 단계별, 표를 **1440×900 및 1280×800** 브라우저 100%로 캡처하고 상단·좌우 여백·그림 plot 면적·표 가시 행 수를 수치화. 현재 스크린샷 포함.
2. 막대 Hover → Click → 같은 행/다른 시리즈 → 포인터 이탈 → 드릴/뒤로가기를 녹화. C는 나머지 series 어두워짐 여부, A/B는 **나머지 밝기·색 유지 + 2px outline/굵은 라벨 식별**을 확인. 툴팁·점 동작·키보드·미측정/null·MinMax(3px) 표시 회귀 검증.
3. 도킹 패널을 가운데(탭 결합)·좌/우/상/하(분할)로 드래그. **preview footprint = 실제 놓인 결과인지**, target 표시가 명확한지, drop 후 크게 튀거나 차트가 재마운트되는지 검증.
4. 보드 안 HW Time 중첩, 그룹 탭 여러 개, 최대화/복원, 최소 가로폭, 100/125/150% 줌 및 DPR 1/1.25/1.5/2 조건에서 **이중선/끊긴 border/축 잘림/선택 포커스** 확인.
5. ECharts `resize`, React commits, p95 frame time과 재조회 수를 dev와 **production build preview**에서 분리 측정. dev 전용 variant는 production에 비활성이므로 정식 성능 검증은 컨펌된 구현 변경 후 수행.
6. 브라우저 `prefers-reduced-motion`, Tab/Enter/Space/Esc, 고정 테이블 열, 문맥 선택/복원 등 기존 접근성을 검사한다.

## 시안 수용 규칙
- 3개 안(현행 C, A, B)의 **실제 앱 캡처와 드래그/막대 포커스 녹화**를 만든 뒤 사용자 선택을 받는다. **코드만 만들었다고 컨펌/완료 처리하지 않는다.**
- A/B의 `padding`과 `dnd` 옵션은 **비교 후보**, 확정 토큰이 아니다.
- 주의: 최근 Dockview 버전의 API 설명과 현행 고정 버전 8.6.1의 타입/실동작 일치 여부를 **실제 typecheck와 브라우저로 확인**한다. 버전 업그레이드는 이 프로토타입 범위 밖.
- 검증 후 선택된 한 안만 별도 구현 이슈/PR에서 공통 API·디자인 계약으로 승격하고 이 프로토타입은 폐기한다.

## 실행환경 검증 명령 (환경을 가진 작업자가 실행)
```sh
pnpm --filter @ap/platform-web typecheck
pnpm --filter @ap/components test -- AnalysisChartFrame.rowFocus.test.tsx
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
