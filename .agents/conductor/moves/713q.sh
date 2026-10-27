#!/usr/bin/env bash
# 713q: @fops/ui의 @ap/ui 호환 re-export를 걷어낸다. SDK가 소유한 이름의 소비자 import를 `@ap/ui`로 옮기고(713q.mjs),
# 순수 re-export 파일을 지운다. 멱등. 손 편집(index.ts, useDetailPanelSlot.ts, public-api 테스트, 혼합 vi.mock, 문서)은 보고서에 있다.
# 사용: bash .agents/conductor/moves/713q.sh   (git 없이 지우려면 RM=trash)
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
RM="${RM:-trash}"

node .agents/conductor/moves/713q.mjs

UI=packages/fo-ui/src
for p in components/Button components/SkeletonBlocks components/SkeletonRows \
  components/shadcn/{alert-dialog,avatar,badge,card,checkbox,combobox,dialog,dropdown-menu,input,label,popover,radio-group,select,sheet,skeleton,tabs,toggle-group,tooltip} \
  badges/StatusBadgeFrame data/ObjectRow feedback/{DirtyConfirmation,EmptyState,PreviewModal,UndoToast} \
  forms/{DatePicker,FieldLabel,SearchInput} identity/{UserAvatar,UserChip} indicators/ProgressMeter \
  layout/{ListShell,PageShell,ShellHeader,ToolbarKicker,WorkbenchShell} \
  panel/{Callout,DetailPanelFullscreenContext,DetailPanelHeader,DetailPanelHeaderActions,DetailPanelSectionNav,FieldRow,NestedTextBlock,PanelSectionTitle,PanelTitleBlock} \
  permissions/PermissionBlockedPanel rich-content/extensions/{attachmentRef,mention} \
  rich-content/{RichContentRenderer,RichEditor} rich-content/toolbar/AttachButton \
  toolbar/{ActiveFilterBar,ListFilterButton,ListSortButton,ListTabs,ListToolbar} utils/{cn,motion,toast-target,useListMotion}; do
  for ext in ts tsx; do
    if [ -e "$UI/$p.$ext" ]; then $RM "$UI/$p.$ext"; fi
  done
done
echo "713q: done"
