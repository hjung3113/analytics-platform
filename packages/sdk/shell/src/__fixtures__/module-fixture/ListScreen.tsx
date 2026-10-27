import { useEffect, useState } from 'react';
import { defineEndpoint, type ModuleScreenProps } from '@ap/contracts';

type Row = { id: string };

export const listEndpoint = defineEndpoint<{ page: number }, Row[]>({
  id: 'fixture.items', menuId: 'fixture:list', paramKeys: { page: true }, permission: 'platform:view', requiresScope: false,
  context: {}, kinds: ['collection'], mergeTimeDomain: false,
});

/** Calls every host port the contract offers: query, setPage, detail, focusTarget, status, href. */
export function ListScreen({ params, host }: ModuleScreenProps) {
  const page = Number(host.page('page') ?? '1');
  const [rows, setRows] = useState<readonly Row[] | null>(null);
  // The host is a snapshot (a new object when the URL, session or language changes): depend on the values read, not on its identity.
  const { generation } = host.session();
  // A write elsewhere (or any host change) notifies: read again; the rows stay until the new answer arrives.
  const [stale, setStale] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the host is a snapshot (see above): re-subscribe on the session generation, not on the host identity
  useEffect(() => host.subscribe(() => setStale(n => n + 1)), [generation]);
  useEffect(() => {
    let live = true;
    host.query?.(listEndpoint, { page }, host.signal).then(
      response => { if (live) setRows(response.data ?? []); },
      () => { /* released or superseded */ },
    );
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the host is a snapshot (see above): re-query on generation, page or a notification, not on the host identity
  }, [generation, page, stale]);
  const item = host.href({ screen: 'item', params: { id: 'a1' }, page: { tab: 'info' } });
  return (
    <section>
      <h1 ref={el => host.focusTarget(el)} tabIndex={-1}>Fixture list</h1>
      <p data-testid="params">{JSON.stringify(params)}</p>
      <p data-testid="rows">{rows === null ? 'loading' : rows.map(row => row.id).join(',') || 'empty'}</p>
      <p data-testid="page">{page}</p>
      <button type="button" onClick={() => host.setPage({ page: String(page + 1) })}>next page</button>
      <button type="button" onClick={() => host.detail?.show(<p>detail of {page}</p>, 'Detail')}>show detail</button>
      <button type="button" onClick={() => host.detail?.clear()}>clear detail</button>
      <button type="button" onClick={() => host.status('auth_required')}>sign-in lost</button>
      <button type="button" onClick={() => host.status('identity_mismatch')}>other user</button>
      <button type="button" onClick={() => host.status('unavailable')}>server down</button>
      {item && <a href={item.href} onClick={event => { event.preventDefault(); host.navigate({ screen: 'item', params: { id: 'a1' } }); }}>open item</a>}
    </section>
  );
}
