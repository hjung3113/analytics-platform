import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { PanelSettingsDrawer, type PanelSettingsMapping } from '@ap/components';
import { createChartPanel, readChartPanelDraft, type ChartPanelDraft, type MenuViewPanels } from '@ap/contracts';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';

const mapping: PanelSettingsMapping = {
  granted: () => true,
  fields: {
    measures: [
      { id: 'htm', label: { ko: 'HTM 시간 (h)', en: 'HTM time (h)' }, unit: 'h', reaggregation: 'sum' },
      { id: 'utilization', label: { ko: '가동률 (%)', en: 'Utilization (%)' }, unit: '%',
        reaggregation: 'ratioOfSums', breakdowns: ['equipment', 'module'] },
      { id: 'alarms', label: { ko: '알람 수 (count)', en: 'Alarms (count)' }, unit: 'count', reaggregation: 'sum' },
    ],
    breakdowns: [
      { id: 'equipment', label: { ko: '장비', en: 'Equipment' }, dimension: 'equipment' },
      { id: 'module', label: { ko: '모듈', en: 'Module' }, dimension: 'module' },
      { id: 'motion', label: { ko: 'Motion', en: 'Motion' }, dimension: 'motion' },
    ],
    time: { field: 'day', label: { ko: '날짜', en: 'Date' } },
  },
};
const title = { ko: '설비별 Module 타입 평균', en: 'Average by equipment and module type' };

function initialValue(draft: ChartPanelDraft): MenuViewPanels {
  const result = createChartPanel(mapping.fields, draft, 'chart-1', mapping.granted);
  if (result.status === 'problem') throw new Error(result.problem.code);
  return { version: 1, instances: [result.instance] };
}

function SettingsDrawer({ draft }: { draft: ChartPanelDraft }) {
  const slot = useDetailPanelSlotHost();
  const [value, setValue] = useState(() => initialValue(draft));
  const [open, setOpen] = useState(true);
  return <div className="flex min-h-dvh justify-end bg-surface-canvas">
    {!open && <button type="button" className="self-start p-3" onClick={() => setOpen(true)}>패널 설정</button>}
    <aside ref={slot.ref} className="flex w-detail-panel shrink-0 flex-col border-l border-border-subtle bg-surface-detail" />
    {open && <PanelSettingsDrawer mapping={mapping} panel={value.instances[0]!} title={title} value={value}
      outputLabel={({ panel }) => {
        if (panel.source.kind !== 'chart') return undefined;
        const { breakdown } = readChartPanelDraft(panel.source.config);
        return mapping.fields.breakdowns.find(field => field.id === breakdown)?.label;
      }}
      selectionOf={() => null} onChange={setValue} onClose={() => setOpen(false)} />}
  </div>;
}

const meta = {
  id: 'workspace-panelsettingsdrawer',
  title: '페이지·작업 영역/PanelSettingsDrawer',
  component: PanelSettingsDrawer,
  parameters: { layout: 'fullscreen', docs: { story: { inline: false, iframeHeight: 660 } } },
} satisfies Meta<typeof PanelSettingsDrawer>;
export default meta;

/** 선 차트, 가동률, 장비에서 시작한다. 기준 칩을 바꾸거나 지운 뒤 막대로 전환할 수 있다. «모양»은 쌓기·영역 채우기·소수 자리다. */
export const Mapping: StoryObj = {
  render: () => <DetailPanelSlotProvider><SettingsDrawer draft={{ kind: 'line', measure: 'utilization', breakdown: 'equipment' }} /></DetailPanelSlotProvider>,
};

/** 막대 차트. 막대 방향·색 계열·소수 자리를 고를 수 있다. */
export const ShapeBar: StoryObj = {
  render: () => <DetailPanelSlotProvider><SettingsDrawer draft={{ kind: 'bar', measure: 'htm', breakdown: 'equipment' }} /></DetailPanelSlotProvider>,
};
