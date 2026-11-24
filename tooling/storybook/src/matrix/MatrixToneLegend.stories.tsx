import type { Meta, StoryObj } from '@storybook/react-vite';
import { MatrixToneLegend } from '@ap/components';
import { guidedPage } from '../guidance';

/** `TreeMatrix` 셀 톤의 범례. 톤마다 셀과 같은 표본을 그리고, 문구는 소비자가 준 것만 보인다. */
const meta = {
  title: '행렬/MatrixToneLegend',
  component: MatrixToneLegend,
  args: { labels: { danger: '목표 85% 미만', missing: '미측정' }, 'aria-label': '셀 색 범례' },
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/matrix/MatrixToneLegend.tsx',
    page: guidedPage([['docs/contract/components.md', '소비자 문구로 같은 표본을 그린다']]),
  } },
} satisfies Meta<typeof MatrixToneLegend>;
export default meta;
type Story = StoryObj<typeof meta>;

/** `TreeMatrix` 예시와 같은 두 톤: 목표 미달과 미측정. */
export const Default: Story = {};
/** 네 톤 모두. */
export const AllTones: Story = { args: { labels: { info: '선택 기준 설비', danger: '목표 85% 미만', missing: '미측정', muted: '정비 중' } } };
