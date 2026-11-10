# 저장소 구조 이력

[저장소 구조](../repository-layout.md)에서 옮긴 과거 기록이다. 현행 구조의 원본은 아니다.

## 디자인 시스템 이전 기록 (#441, ADR-0046)

- 출처: FeedbackOps `packages/ui` 커밋 `a8d768b8`(`origin/develop`, 2026-10-19). 값·클래스 문자열은 그대로 옮겼다. FeedbackOps 루트의 `patchedDependencies`(`@formkit/auto-animate@0.10.0`)도 함께 가져왔다(`patches/`, `pnpm-workspace.yaml`). FeedbackOps 쪽 사본은 #642에서 지웠다.
- 옮긴 것(1묶음, `packages/sdk/ui/src/`): `styles/`(tokens·semantic·theme·compat + 소비 계약·토큰 충실도·대비 테스트), `utils/`(cn·motion·toast-target·useListMotion), `internal/useHorizontalOverflow`, `components/`(Button·KeyboardShortcut·SkeletonBlocks·SkeletonRows), `components/shadcn/` 22개(alert-dialog·alert·avatar·badge·button·card·checkbox·combobox·dialog·dropdown-menu·hover-card·input·label·popover·radio-group·select·sheet·skeleton·tabs·textarea·toggle-group·tooltip)와 그 테스트. 플랫폼 확장 CSS는 `platform-tokens.css`로 이름을 바꿨다(옛 `tokens.css`).
- 2묶음(#442, `packages/sdk/ui/src/`): `layout/`(ListShell·PageShell·ShellHeader·ToolbarKicker·WorkbenchShell, `useDetailPanelSlot`은 플랫폼 슬롯의 `layout/useDetailPanelContent`로 대체 — [ADR-0047](../../adr/0047-detail-panel-slot-single-registrant-model.md)), `panel/`, `toolbar/`, `forms/`, `feedback/`과 그 테스트, 그리고 `DetailPanelHeader`가 쓰는 `badges/StatusBadgeFrame.tsx` 한 개. oxlint 주석은 `eslint-disable-next-line … -- 이유`로 바꿨다.
- 3묶음(#443, `packages/sdk/ui/src/`)에서 `badges/`(나머지 전부)·`data/`·`entity/`·`identity/`·`indicators/`·`permissions/`·`rich-content/`와 `components/{ChipPicker,ManagedSystemPicker,AnalyticsAreaPicker}`를 옮겨 당시 전체 이전을 끝냈다. ADR-0050/#479는 도메인 결합 배지(`StatusBadgeFrame` 제외)·`entity/LinkedEntityTrail`·pickers·`rich-content/`와 전용 테스트를 SDK에서 되돌리고 allowlist 사본 parity test와 turbo 입력을 제거했다. SDK에는 `data/ObjectRow`·`identity/{UserAvatar,UserChip}`·`indicators/{ProgressMeter,SeverityIndicator}`·`permissions/PermissionBlockedPanel`이 남고, `StatusBadgeFrame`은 #442부터 유지한다. 패키지 수준 `shells` 테스트도 남는다. FeedbackOps에만 남는 파일은 `components.json`과 FeedbackOps `AGENTS.md`다. rich-content는 ADR-0052/#483에서 SDK에 복원했다(allowlist 사본 parity test 포함).
- 이후 기능의 `@ap/feature-ui`는 기능에 그대로 남고, 이전된 묶음의 모양 변경은 `@ap/ui`에서 먼저 한다. 기능이 SDK를 쓰는 전환 시점 = #443 완료 + 배포 경로 확정(#151).

## 합류 전환 규칙 (2026-10-21)

> **2026-10-21: 기능은 플랫폼에 합친다([ADR-0066](../../adr/0066-feedbackops-merges-into-platform.md), [합류 설계](feedbackops-merge-design.md)).** 아래 1·2단계는 합류 단계 4까지의 전환 규칙으로만 유효하다. 서브모듈은 합류 단계 1a(#592)에서 일반 디렉터리가 됐다.

## 다음 설계에서 확정할 항목

Scope와 Managed System의 관계, 권한 검증 책임, 메뉴·URL·Context 계약, 감사·알림 계약, 실행·배포 단위를 결정한다. 그 결과를 바탕으로 공통 코드 추출과 기능 도구 통일 여부를 정한다. 답이 필요한 질문과 미결 범위는 [`.planning/README.md`](../../../.planning/README.md)에 있다.
