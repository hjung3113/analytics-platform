import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { PageConditionLayer } from '@ap/components';
import { Button } from '@ap/ui';
import { guidedPage } from '../guidance';
import { DECLARATION, INITIAL, INPUTS_KEY, loadOptions, TREE_SOURCES, useConditionValues } from './pageConditions';

// The page owns open state, draft values and apply; the global Context shows only as a read-only summary.
function Layer({ notice }: { notice?: string }) {
  const { values, onChange } = useConditionValues(INITIAL);
  const [open, setOpen] = useState(true);
  return <div className="relative h-[640px] w-[900px] overflow-auto bg-surface-canvas">
    <PageConditionLayer id="sb-conditions" open={open} onClose={() => setOpen(false)} notice={notice}
      globalSummary={<><p>기간 2026-11-01 ~ 11-07</p><p>Scope 1공장</p></>} onEditContext={() => undefined}
      footer={<><Button variant="secondary" size="sm" onClick={() => setOpen(false)}>취소</Button><Button size="sm">적용</Button></>}
      declaration={DECLARATION} values={values} onChange={onChange} loadOptions={loadOptions} treeSources={TREE_SOURCES} inputsKey={INPUTS_KEY} />
    <div className="p-4 pl-95 text-sm text-text-secondary">
      {open ? '페이지 본문(층은 본문 위에 떠 있고 막지 않는다)' : <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>페이지 조건 열기</Button>}
    </div>
  </div>;
}

/** 페이지 본문 위에 그 자리에서 뜨는 페이지 조건 층. 포털·차단막·포커스 가두기가 없고, 전역 Context는 읽기 전용 요약과 «조회 조건에서 바꾸기»로만 보인다. */
const meta = {
  title: '조회·필터/PageConditionLayer',
  component: PageConditionLayer,
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/filters/PageConditionLayer.tsx',
    page: guidedPage([['docs/contract/components.md', '비모달 편집 표면이다'], ['docs/contract/components.md', '전역 편집은 기존 Context 바에서 한다']]),
    story: { inline: false, iframeHeight: 680 },
  } },
  render: () => <Layer />,
} satisfies Meta<typeof PageConditionLayer>;
export default meta;
type Story = StoryObj;

/** 열린 층: 머리의 전역 요약, 범주 편집, 바닥의 «적용». */
export const Open: Story = {};
/** `notice`: 거절된 쓰기(상한 초과 등)를 범주 위에 알린다. */
export const Notice: Story = { render: () => <Layer notice="설비는 50대까지 고를 수 있습니다" /> };
