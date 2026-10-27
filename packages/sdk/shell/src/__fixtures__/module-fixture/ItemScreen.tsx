import { useState } from 'react';
import { defineAction, type ActionResult, type ModuleScreenProps } from '@ap/contracts';
import { listEndpoint } from './ListScreen';

/** The fixture's version-checked write; it belongs to the list menu, which owns `listEndpoint`, the query it invalidates. */
export const saveAction = defineAction<{ text: string }, { id: string }>({
  id: 'fixture.save', menuId: 'fixture:list', inputKeys: { text: true },
  // The closed platform Permission until module-scoped action permissions arrive (#492).
  permission: 'platform:view', requiresScope: false, concurrency: 'version', invalidates: [listEndpoint],
});

/** Version the fixture treats as current; a real module reads it from the data it queried. */
export const FIXTURE_VERSION = 'v1';

export function ItemScreen({ params, host }: ModuleScreenProps) {
  const [result, setResult] = useState<ActionResult<{ id: string }> | null>(null);
  const save = () => {
    host.act?.(saveAction, { text: `item ${params.id}` }, { expectedVersion: FIXTURE_VERSION }).then(setResult, () => { /* released or superseded */ });
  };
  return (
    <section>
      <h1 ref={el => host.focusTarget(el)} tabIndex={-1}>Fixture item {params.id}</h1>
      <p data-testid="tab">{host.page('tab') ?? '-'}</p>
      <p data-testid="api">{host.config('apiBase')}</p>
      <button type="button" onClick={save}>save</button>
      <p data-testid="save-outcome">{result?.outcome ?? '-'}</p>
      {result?.retry && <button type="button" onClick={() => result.retry!().then(setResult, () => { /* released or superseded */ })}>retry save</button>}
    </section>
  );
}
