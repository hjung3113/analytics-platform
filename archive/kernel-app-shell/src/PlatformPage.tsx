import type { ReactNode } from 'react';
export const slotNames = ['title', 'description', 'primaryAction', 'secondaryActions', 'contextExtension', 'content', 'dataTrustSummary'] as const;
export type PageSlots = { [K in typeof slotNames[number]]: ReactNode } & { children?: never };
/** Named extension points only. No children, header, sidebar, or spread DOM props. */
export function PlatformPage(props: PageSlots) {
  const keys = Object.keys(props);
  if (keys.length !== slotNames.length || keys.some(key => !slotNames.includes(key as typeof slotNames[number]))) throw new Error('PlatformPage requires exactly seven named slots');
  return <main>
    <section className="flex min-h-16 items-center justify-between px-6 py-3"><div><h1 className="text-[22px] font-semibold">{props.title}</h1><p>{props.description}</p></div><div>{props.primaryAction}{props.secondaryActions}</div></section>
    <div data-slot="contextExtension">{props.contextExtension}</div>
    <section data-slot="content" aria-label="Page content" className="mx-6 min-h-60 border border-dashed border-border-subtle">{props.content}</section>
    <footer data-slot="dataTrustSummary" className="m-6 text-text-muted">{props.dataTrustSummary}</footer>
  </main>;
}
