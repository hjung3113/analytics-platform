import type { ReactNode } from 'react';
import { Description, Primary, Title, Unstyled } from '@storybook/addon-docs/blocks';
import { useDetailPanelSlotHost } from '@ap/ui';
import { docs } from 'virtual:design-sources';

const LAYOUT = 'docs/contract/layout.md';
const strip = (text: string) => text.trim().replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replaceAll('**', '').replaceAll('`', '');

/** The purpose line and ```text slot list under a layout.md §12 heading, and that archetype's row of the §12.6 table; read at build time. */
function archetype(heading: string, name: string) {
  const text = docs[LAYOUT];
  const at = text.indexOf(`\n### ${heading}\n`);
  const section = at < 0 ? '' : text.slice(at, text.indexOf('\n### ', at + 1));
  const row = text.split('\n').find(line => line.startsWith(`| ${name} (`))?.split('|').map(strip);
  return {
    purpose: section.split('\n').find(line => line.startsWith('사용 목적'))?.trim() ?? null,
    slots: /```text\n([\s\S]*?)```/.exec(section)?.[1]!.trim().split('\n') ?? [],
    part: row?.[2] ?? null,
    status: row?.[4] ?? null,
  };
}

/** A template page at the desktop width it is designed for. */
export const Frame = ({ children }: { children: ReactNode }) => <div className="min-h-screen w-[1440px] bg-surface-canvas">{children}</div>;

/** The shell's right detail slot, which the template stands in for (no shell in Storybook). */
export function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" className="flex w-detail-panel shrink-0 flex-col border-l border-border-subtle bg-surface-detail" />;
}

/**
 * Template docs page: layout.md's purpose and slot list for the archetype, which public pieces fill each slot here, the §12.6 layout part
 * and status, then the 1440px page scaled to the docs column. A slot with no entry in `parts` shows in red, so a renamed slot is seen.
 */
export const templatePage = (heading: string, name: string, parts: Record<string, ReactNode>) => function TemplatePage() {
  const { purpose, slots, part, status } = archetype(heading, name);
  return <><Title /><Description /><Unstyled><section className="my-6 space-y-3 text-sm">
    <h3 className="t-section-title">조합</h3>
    <p className="text-text-secondary">{purpose ?? <span className="text-text-danger">layout.md에서 사라진 절: {heading}</span>} <span className="t-caption text-text-muted">{LAYOUT} §{heading}</span></p>
    <table className="w-full border-collapse"><thead><tr className="border-b border-border-subtle text-left text-text-secondary"><th className="w-56 py-1.5">슬롯(layout.md)</th><th>이 템플릿의 부품</th></tr></thead>
      <tbody>{slots.map(slot => <tr key={slot} className="border-b border-border-subtle align-top"><td className="py-1.5 font-medium">{slot}</td>
        <td className={parts[slot] ? 'py-1.5' : 'py-1.5 text-text-danger'}>{parts[slot] ?? '부품 미지정'}</td></tr>)}</tbody></table>
    <p><span className="font-medium">layout 부품:</span> {part ?? '—'} · <span className="font-medium">상태:</span> {status ?? '—'} <span className="t-caption text-text-muted">{LAYOUT} §12.6</span></p>
  </section></Unstyled><div className="overflow-hidden [zoom:0.69]"><Primary /></div></>;
};
