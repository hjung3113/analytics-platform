import type { CSSProperties, ReactNode } from 'react';
import { Unstyled } from '@storybook/addon-docs/blocks';
import { colors, docs, roles, vars } from 'virtual:design-sources';

// Every value on these pages is read from @ap/ui at build time (names, notes) or from the live stylesheet (values).
const note = (name: string) => vars.find(v => v.name === name)?.note ?? '';
const live = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
const hex = (name: string) => /^(\d+) (\d+) (\d+)$/.exec(live(name))?.slice(1).map(n => Number(n).toString(16).padStart(2, '0')).join('');
const prefixed = (prefix: string) => vars.filter(v => v.name.startsWith(prefix));
// eslint-disable-next-line shadcn/no-arbitrary-values -- the token catalogue draws each token by name from `--sample`; no fixed class can
export const SAMPLE = { color: 'bg-[rgb(var(--sample))]', font: '[font-family:var(--sample)]', size: 'text-[length:var(--sample)]', radius: 'rounded-[var(--sample)]', shadow: 'shadow-[var(--sample)]' };

function Row({ name, value, sample, children }: { name: string; value: string; sample?: ReactNode; children?: ReactNode }) {
  return <div className="flex items-center gap-4 border-b border-border-row py-2">
    {sample}<div className="min-w-0 flex-1">
      <div className="t-mono text-text-primary">--{name} <span className="text-text-muted">{value}</span></div>
      <div className="t-caption text-text-secondary">{children ?? note(name)}</div>
    </div>
  </div>;
}

const GROUPS = ['surface', 'border', 'text', 'accent', 'chart', 'severity', 'status'];
export function ColorTokens() {
  const all = [...colors.map(c => c.name), ...prefixed('status-').map(v => v.name)];
  const groupOf = (name: string) => GROUPS.find(g => name.startsWith(`${g}-`)) ?? '기타';
  return <Unstyled>{[...GROUPS, '기타'].map(group => <section key={group} className="mb-8">
    <h3 className="t-section-title mb-2">{group}</h3>
    {all.filter(name => groupOf(name) === group).map(name => <Row key={name} name={name} value={hex(name) ? `#${hex(name)}` : live(name)}
      sample={<span className={`size-10 shrink-0 rounded-md border border-border-subtle ${SAMPLE.color}`} style={{ '--sample': `var(--${name})` } as CSSProperties} />} />)}
  </section>)}</Unstyled>;
}

export function TypeRoles() {
  return <Unstyled>
    {prefixed('font-').map(v => <Row key={v.name} name={v.name} value="" sample={<span className={`w-56 shrink-0 text-lg ${SAMPLE.font}`} style={{ '--sample': `var(--${v.name})` } as CSSProperties}>설비 EQ-0142 Aa 0123</span>}>{v.value}</Row>)}
    {roles.map(role => <div key={role.name} className="flex items-center gap-4 border-b border-border-row py-2">
      <span className={`w-80 shrink-0 ${role.name}`}>식각 공정 가동률 84.6%</span>
      <div className="min-w-0 flex-1"><div className="t-mono text-text-primary">.{role.name}</div><div className="t-caption text-text-secondary">{role.css}</div></div>
    </div>)}
    {prefixed('text-').filter(v => v.value.endsWith('px')).map(v => <Row key={v.name} name={v.name} value={v.value} sample={<span className={`w-56 shrink-0 ${SAMPLE.size}`} style={{ '--sample': `var(--${v.name})` } as CSSProperties}>가동률</span>} />)}
  </Unstyled>;
}

const SCALES: [prefix: string, look: string][] = [
  ['spacing-', 'h-3 w-[var(--sample)] bg-accent-primary'],
  ['radius-', `size-10 border-2 border-accent-primary ${SAMPLE.radius}`],
  ['shadow-', `h-10 w-16 bg-surface-card ${SAMPLE.shadow}`],
  ['motion-', 'hidden'],
];
export function ScaleTokens() {
  return <Unstyled>{SCALES.map(([prefix, look]) => <section key={prefix} className="mb-8">
    <h3 className="t-section-title mb-2">{prefix.slice(0, -1)}</h3>
    {prefixed(prefix).map(v => <Row key={v.name} name={v.name} value={v.value}
      sample={<span className="flex w-20 shrink-0 justify-center"><span className={look} style={{ '--sample': `var(--${v.name})` } as CSSProperties} /></span>} />)}
  </section>)}</Unstyled>;
}

/** The Do/Don't table of DESIGN.md, row by row. */
export function Principles() {
  const section = docs['DESIGN.md'].split("## Do's and Don'ts")[1]?.split('\n## ')[0] ?? '';
  const rows = section.split('\n').filter(line => line.startsWith('|') && !line.startsWith('| Do') && !line.startsWith('| ---'));
  return <Unstyled><div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
    <h3 className="t-card-title">Do</h3><h3 className="t-card-title">Don&apos;t</h3>
    {rows.flatMap(row => row.split('|').slice(1, 3).map(cell => <p key={cell} className="border-b border-border-row pb-2">{cell.trim()}</p>))}
  </div></Unstyled>;
}
