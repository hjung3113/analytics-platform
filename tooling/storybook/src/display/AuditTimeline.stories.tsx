import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuditTimeline } from '@ap/components';
import { AUDIT } from '../equipment';
import { guidedPage } from '../guidance';
import { withPlatform } from '../platform';

/** 대상 하나의 변경 이력(`AuditEvent`): 시각·행위자·바뀐 값·사유. 더 있으면 끝의 «이전 변경 이력 더 보기»가 Kernel `useEntityAudit`의 `more`를 부른다. */
const meta = {
  title: '표시/AuditTimeline',
  component: AuditTimeline,
  args: { events: AUDIT },
  argTypes: { events: { control: false }, more: { control: false }, fields: { control: false }, actorName: { control: false } },
  decorators: [Story => <div className="w-[440px]"><Story /></div>, withPlatform],
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/drawer/AuditTimeline.tsx',
    page: guidedPage([['docs/contract/components.md', '사유·값은 기록된 문자열 그대로다']]),
  } },
} satisfies Meta<typeof AuditTimeline>;
export default meta;
type Story = StoryObj<typeof meta>;

const more = (status: 'idle' | 'end' | 'error') => ({ status, load: () => undefined, last: null,
  error: status === 'error' ? { outcome: 'error' as const, message: '이력을 불러오지 못했습니다.', correlationId: 'sb-7f3a2c' } : null });

/** 첫 쪽이 끝: 버튼도 캡션도 없다. */
export const Default: Story = {};
/** 더 있음: 끝에 «이전 변경 이력 더 보기». */
export const More: Story = { args: { more: more('idle') } };
/** 다음 쪽 실패: 목록은 두고 같은 버튼이 «다시 시도»가 된다. */
export const MoreFailed: Story = { args: { more: more('error') } };
/** `fields`·`actorName`: 표시 이름과 형식만 바꾼다. 기록된 키와 값은 그대로다. */
export const Labeled: Story = { args: { fields: { '기준 사이클타임(초)': { label: { ko: '기준 사이클타임', en: 'Baseline cycle time' }, format: value => `${String(value)}초` } }, actorName: actor => (actor === 'sync' ? '설비 동기화' : undefined) } };
