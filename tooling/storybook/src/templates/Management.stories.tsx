import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { AuditTimeline, DetailDrawer, ManagementLayout, PlatformDataTable, PlatformPage, TableQuickSearch } from '@ap/components';
import { Button, DetailPanelSlotProvider, FieldList, FieldRow, StatusBadge } from '@ap/ui';
import { AUDIT, COLUMNS, EQUIPMENT, type Eq } from '../equipment';
import { Frame, SlotHost, templatePage } from './assembly';

const eq = EQUIPMENT[1]!;

/** Management(layout.md §12.3): 기준정보·설정을 표로 찾고 고친다. `ManagementLayout`이 표와 상세 서랍 자리를 잡는다. */
const meta = {
  title: '템플릿/Management',
  component: ManagementLayout,
  parameters: { layout: 'fullscreen', docs: { page: templatePage('12.3 Management', 'Management', {
    'Page Header': 'PlatformPage — title · description · primaryAction(Button)',
    'Search + Filter': 'PlatformDataTable search ← TableQuickSearch(page key q), 열 필터는 표가 소유',
    'Data Table': 'ManagementLayout table ← PlatformDataTable(activeRowId로 열린 행 표시)',
    'Selection Actions': 'PlatformDataTable bulkActions(선택 열과 선택 막대의 동작)',
    'Detail Drawer': 'ManagementLayout drawer ← DetailDrawer(셸 오른쪽 슬롯, 탭 속성·이력)',
    'History / Audit': 'DetailDrawer 이력 탭 ← AuditTimeline',
  }) } },
} satisfies Meta<typeof ManagementLayout>;
export default meta;

/** 1440px 설비 기준정보: 검색과 선택 동작이 있는 표, EQ-0207의 상세 서랍이 이력 탭으로 열린 상태. */
export const EquipmentMaster: StoryObj = {
  render: function EquipmentMasterStory() {
    const [tab, setTab] = useState('history');
    return <DetailPanelSlotProvider><Frame><div className="flex h-screen">
      <div className="min-w-0 flex-1"><PlatformPage title="설비 기준정보" description="설비의 공정·기준값을 찾고 고친다." primaryAction={<Button size="sm">설비 추가</Button>}>
        <ManagementLayout
          table={<div className="flex h-[560px] flex-col"><PlatformDataTable<Eq> title="설비" ariaLabel="설비 기준정보 표" columns={COLUMNS} rows={EQUIPMENT} getRowId={e => e.id} fill
            preferenceKey="storybook:management:v1" activeRowId={eq.id} search={<TableQuickSearch pageKey="q" label="설비 ID 검색" />}
            bulkActions={ids => <Button size="toolbar" variant="secondary">{ids.length}대 비활성</Button>} /></div>}
          drawer={<DetailDrawer id={eq.id} title="증착 설비" focusOnOpen={false} onClose={() => {}} tab={tab} onTabChange={setTab}
            subtitle={<StatusBadge tone="warning" dot>점검 필요</StatusBadge>} tabs={[
              { id: 'props', label: '속성', content: <FieldList>
                <FieldRow layout="detail" label="공정">{eq.process}</FieldRow>
                <FieldRow layout="detail" label="기준 사이클타임(초)">160</FieldRow>
              </FieldList> },
              { id: 'history', label: '이력', content: <AuditTimeline events={AUDIT} /> },
            ]} />}
        />
      </PlatformPage></div>
      <SlotHost />
    </div></Frame></DetailPanelSlotProvider>;
  },
};
