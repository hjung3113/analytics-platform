import type { ModuleScreenProps } from '@ap/contracts';

export function ItemScreen({ params, host }: ModuleScreenProps) {
  return (
    <section>
      <h1 ref={el => host.focusTarget(el)} tabIndex={-1}>Fixture item {params.id}</h1>
      <p data-testid="tab">{host.page('tab') ?? '-'}</p>
      <p data-testid="api">{host.config('apiBase')}</p>
    </section>
  );
}
