import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { FloatingWindow, type FloatingWindowLabels, type FloatingWindowMode } from '@ap/components';
import { Button } from '@ap/ui';
import { EQUIPMENT } from '../equipment';
import { guidedPage } from '../guidance';

// The frame has no built-in strings: the caller passes every label.
const LABELS: FloatingWindowLabels = {
  titleBar: '창 이동: 끌거나 방향키, Alt+방향키는 크기', menu: '창 위치·크기', positionGroup: '위치', sizeGroup: '크기',
  place: { 'top-left': '왼쪽 위', 'top-right': '오른쪽 위', 'bottom-left': '왼쪽 아래', 'bottom-right': '오른쪽 아래', center: '가운데' },
  size: { small: '작게', medium: '보통', large: '크게' },
  handle: { n: '위쪽 크기 조절', ne: '오른쪽 위 크기 조절', e: '오른쪽 크기 조절', se: '오른쪽 아래 크기 조절', s: '아래쪽 크기 조절', sw: '왼쪽 아래 크기 조절', w: '왼쪽 크기 조절', nw: '왼쪽 위 크기 조절' },
  moved: (x, y) => `창을 ${x}, ${y}로 옮겼습니다`, resized: (w, h) => `창 크기 ${w}×${h}`,
};
const AREA = { left: 0, top: 0, width: 920, height: 540 }; // the frame never shrinks below FLOATING_MIN_SIZE (640×420)

function Frame({ initialMode }: { initialMode: FloatingWindowMode }) {
  const [mode, setMode] = useState(initialMode);
  const [geometry, setGeometry] = useState({ x: 260, y: 40, width: 640, height: 440 });
  return <div className="relative h-[540px] w-[920px] bg-surface-sunken">
    <p className="p-4 text-sm text-text-secondary">작업 영역(창 아래 화면은 계속 쓸 수 있다)</p>
    <FloatingWindow area={AREA} geometry={geometry} onGeometryChange={setGeometry} mode={mode} title="EQ-0207 알람 이력" titleId={`fw-${mode}`} labels={LABELS}
      actions={<Button type="button" size="sm" variant="ghost" onClick={() => setMode(mode === 'fill' ? 'window' : 'fill')}>{mode === 'fill' ? '창으로 보기' : '영역 채우기'}</Button>}>
      <ul className="grid gap-1 p-3 text-sm">{EQUIPMENT.slice(0, 5).map(e => <li key={e.id} className="flex justify-between"><span>{e.id}</span><span className="tabular">{e.alarms}건</span></li>)}</ul>
    </FloatingWindow>
  </div>;
}

/** 작업 영역 안에 부가 정보를 비모달 창으로 띄워 끌기·크기 조절·⋯ 메뉴를 해 보는 예제. 규칙은 아래 원문 인용을 따른다. */
const meta = {
  title: '페이지·작업 영역/FloatingWindow',
  component: FloatingWindow,
  parameters: { docs: {
    subtitle: '@ap/components · packages/sdk/components/src/floating/FloatingWindow.tsx',
    page: guidedPage([['docs/contract/components.md', '배경 차단막·포커스 가두기·외부 클릭 닫기 없음'], ['docs/contract/components.md', '창으로 못 그리는 폭은 `fitsArea`로 판정해 호출자가 `fill`을 고른다']]),
  } },
  render: () => <Frame initialMode="window" />,
} satisfies Meta<typeof FloatingWindow>;
export default meta;
type Story = StoryObj;

/** `window`: 영역 오른쪽 위의 창. 제목줄을 끌거나 포커스 뒤 방향키로 옮긴다. */
export const Windowed: Story = {};
/** `fill`: 좁은 폭에서 영역 전체를 채운다. 내용은 다시 마운트되지 않는다. */
export const Fill: Story = { render: () => <Frame initialMode="fill" /> };
