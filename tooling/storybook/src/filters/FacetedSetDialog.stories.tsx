import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { FacetedSetDialog, type FacetedSetFacet, type FacetedSetItem, type FacetedSetValue } from '@ap/components';
import { EQUIPMENT, PROCESSES } from '../equipment';
import { guidedPage } from '../guidance';

// Every authorized item with its facet values (synthetic): process, and an alarm band from the alarm count.
const FACETS: FacetedSetFacet[] = [{ id: 'process', label: '공정', values: PROCESSES }, { id: 'alarm', label: '알람', values: ['없음', '1–3건', '4건 이상'] }];
const band = (n: number) => (n === 0 ? '없음' : n <= 3 ? '1–3건' : '4건 이상');
const ITEMS: FacetedSetItem[] = EQUIPMENT.map(e => ({ id: e.id, facets: { process: e.process, alarm: band(e.alarms) } }));

function Picker({ value: initial, ...rest }: { value: FacetedSetValue; initialFacet?: string; allowFixed?: boolean }) {
  const [value, setValue] = useState(initial);
  return <FacetedSetDialog open onOpenChange={() => undefined} title="대상 설비 고르기" facets={FACETS} items={ITEMS} value={value} onApply={setValue}
    itemKindLabel="설비" note="개수는 1공장 설비 기준(합성 데이터)" {...rest} />;
}

/** 분류(공정·알람)로 규칙을 만들거나 설비를 직접 체크해 대상 묶음을 고르는 대화창. 분류끼리는 AND이고, 값 옆 개수는 다른 분류 조건을 만족하는 항목 수다. */
const meta = {
  title: '조회·필터/FacetedSetDialog',
  component: FacetedSetDialog,
  parameters: { docs: {
    story: { inline: false, iframeHeight: 860 },
    subtitle: '@ap/components · packages/sdk/components/src/filters/FacetedSetDialog.tsx',
    page: guidedPage(),
  } },
  render: () => <Picker value={{ rule: { process: ['증착'] }, fixed: null }} initialFacet="process" />,
} satisfies Meta<typeof FacetedSetDialog>;
export default meta;
type Story = StoryObj;

/** 규칙 모드: 공정 = 증착. 결과 표에 맞는 설비가 보이고 «조건 적용 · N대»로 제출한다. */
export const Rule: Story = {};
/** 고정 모드: 설비 셋을 직접 체크한 상태. */
export const Fixed: Story = { render: () => <Picker value={{ rule: {}, fixed: ['EQ-0142', 'EQ-0207', 'EQ-0519'] }} /> };
