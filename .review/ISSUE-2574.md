#2540에서 SDK 폼 규칙 조각(`useValidatedSubmit`, `requiredMark='text'`, `Button` `disabledReason`, `validateLines`·줄 오류 목록, 모두 opt-in)을 만들고 설문 생성·Task 요청 결정·Milestone 생성에만 적용했습니다. 아래 폼은 같은 문제가 남아 있어 옮기지 않았습니다(범위 밖: log-dev·admin 폼은 #2540 브리프에서 제외).

변형: (a) 네이티브 required만, (b) 이유 없이 꺼지는 제출, (c) 대화상자 위 메시지만, (d) 필드 오류는 있으나 첫 오류로 포커스 없음.

- `packages/feature/screens/src/features/log-lifecycle/forms.tsx:16,26-33` — variant (a): project edit, stage move, and Round open use native required controls without custom field errors or first-error focus. `ProjectScreen.tsx:29-37` opens these forms.
- `packages/feature/screens/src/features/log-lifecycle/GatePanel.tsx:204-207` — variant (b): the decision submit button is disabled for a missing reason or incomplete exception fields without a visible disabled reason.
- `menus/log-dev/log-knowledge/src/pages/spec/DraftDrawer.tsx:150` — variant (b): creating a draft is disabled when source label/version is blank, before field errors can be submitted.
- `packages/feature/screens/src/features/admin/permissions/permission-direct-grant-form.tsx:800-807,921-928` — variant (b): permission grant is disabled until selection/reason prerequisites are met, with no reason tied to the submit button.
- `packages/feature/screens/src/features/admin/settings/WorkspaceSettingsScreen.tsx:495,643-654` — variant (b) in the audit: invalid threshold disables Save; source also renders the range message below the input, without field ARIA linkage.
- `platform/notice-voc/src/pages/NoticeDialogs.tsx:64-69,133-147` — variant (d): field errors render below controls, but the first invalid control is not focused.
- `packages/feature/screens/src/features/admin/managed-systems/ManagedSystemsDialogs.tsx:237-243,266-301,363-366` — variant (d) for required-field errors; a rejected slug-format response falls back to the dialog-level message (variant (c)).
- `menus/log-dev/log-knowledge/src/pages/items/ItemWriteDrawer.tsx:121-126,155-187` — variant (d): field errors render below controls, but local invalid submission does not move focus to the first invalid control.

**구현 안 함.** 이유: #2540은 SDK 조각과 세 화면만. 다시 열 조건: #2540 PR 병합 뒤, 해당 화면을 만지는 다음 작업 또는 v0.45 폼 정리 묶음.

