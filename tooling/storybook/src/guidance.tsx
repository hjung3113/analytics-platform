import { Controls, Description, Primary, Stories, Subtitle, Title, Unstyled } from '@storybook/addon-docs/blocks';
import { docs } from 'virtual:design-sources';

type Doc = keyof typeof docs;
/** One quoted rule: the document and a phrase that occurs once in it. */
export type Quote = [doc: Doc, phrase: string];
const REPO = 'https://github.com/hjung3113/analytics-platform/blob/main/';
/** Shown instead of invented rules when the design files hold no sentence to quote (owner decision, #2828). */
export const NO_RULE = '문서화된 사용 규칙 없음 — 규칙이 필요하면 DESIGN.md 또는 docs/contract에 먼저 추가';

/** The table cell or sentence of `doc` that holds `phrase`, links reduced to their text; null when the source no longer says it. */
export function quote([doc, phrase]: Quote): string | null {
  const line = docs[doc].split('\n').find(text => text.includes(phrase));
  if (!line) return null;
  const parts = line.startsWith('|') ? line.split('|') : line.replace(/^[-*]\s+/, '').split(/(?<=\.)\s+/);
  return parts.find(part => part.includes(phrase))!.trim().replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function Rules({ title, quotes }: { title: string; quotes: Quote[] }) {
  return <div className="min-w-0 flex-1 rounded-md border border-border-subtle p-4">
    <h4 className="t-card-title mb-2">{title}</h4>
    {quotes.length === 0 ? <p className="text-sm text-text-secondary">{NO_RULE}</p> : <ul className="space-y-2 text-sm">{quotes.map(q => {
      const text = quote(q);
      return <li key={q[1]} className={text ? 'text-text-primary' : 'text-text-danger'}>
        {text ?? `원문에서 사라진 문장: ${q[1]}`} <a className="t-caption text-text-muted" href={REPO + q[0]}>{q[0]}</a>
      </li>;
    })}</ul>}
  </div>;
}

/** 사용 지침: Do/Don't lines quoted from DESIGN.md and docs/contract at build time (no second copy of a rule); an empty list shows `NO_RULE`. */
export function Guidance({ dos, donts }: { dos: Quote[]; donts: Quote[] }) {
  return <Unstyled><section className="my-6">
    <h3 className="t-section-title mb-3">사용 지침</h3>
    {dos.length + donts.length === 0
      ? <p className="rounded-md border border-border-subtle p-4 text-sm text-text-secondary">{NO_RULE}</p>
      : <div className="flex gap-4"><Rules title="Do" quotes={dos} /><Rules title="Don't" quotes={donts} /></div>}
  </section></Unstyled>;
}

/** Autodocs page of a component: overview, primary story, Props, 사용 지침 and every story. */
export const guidedPage = (dos: Quote[] = [], donts: Quote[] = []) => function GuidedPage() {
  return <><Title /><Subtitle /><Description /><Primary /><Controls /><Guidance dos={dos} donts={donts} /><Stories /></>;
};
