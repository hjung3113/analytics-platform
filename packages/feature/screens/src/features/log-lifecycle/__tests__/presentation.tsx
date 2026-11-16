import type { Presentation, TableParts } from '../contracts';

/** The one fake `ui.table` for these tests: renders every `TableParts` slot, so a new slot is added here once (#2365). */
export function Table<T extends { id: string }>(p: TableParts<T>) {
  // A fragment, so the table's parent stays the screen's own wrapper; the frame element carries the controls and the read identity.
  return <>
    <div data-testid="table-frame" data-filter-key={p.filterKey}><div data-testid="controls">{p.pageControls}</div></div>
    {p.summary}
    <table aria-label={p.title}>
      <thead><tr>{p.columns.map(c => <th key={c.id}>{c.header}</th>)}</tr></thead>
      <tbody>{p.rows.map(r => <tr key={r.id}>{p.columns.map(c => <td key={c.id}>{c.cell(r)}</td>)}{p.rowAction && <td>{p.rowAction(r)}</td>}</tr>)}</tbody>
    </table>
    {p.rows.length === 0 ? p.emptyAction : null}
    {p.pagination}
  </>;
}

/** The shared fake `Presentation`; a test overrides only the parts it checks, and `undefined` removes an optional part. */
export function fakeUi(overrides: { [K in keyof Presentation]?: Presentation[K] | undefined } = {}): Presentation {
  const defaults: Presentation = {
    page: p => <>
      {p.primaryAction ? <button type="button" onClick={p.primaryAction.onSelect}>{p.primaryAction.label}</button> : null}
      {p.secondaryActions?.map(a => <button type="button" key={a.label} disabled={a.allowed === false} onClick={a.onSelect}>{a.label}</button>)}
      {p.children}
    </>,
    table: Table,
    drawer: p => <section role="dialog" aria-label={String(p.title)}>{p.subtitle}{p.body}<button type="button" onClick={p.requestClose}>상세 닫기</button></section>,
    timeline: () => null,
    trust: () => null,
    sourceView: () => <p>합성 원본</p>,
  };
  const ui: Record<string, unknown> = { ...defaults, ...overrides };
  for (const key of Object.keys(ui)) if (ui[key] === undefined) delete ui[key];
  return ui as Presentation;
}
