import type { evaluateDrift } from '@eqv/editor';
import { Button, EmptyState, PanelSectionTitle } from '@ap/ui';
import type { EquipmentData } from './useEquipment';

export const DRIFT_UNKNOWN = 'Drift를 판단할 수 없습니다';

/**
 * ⑦ Drift of the selected window against the latest Binding's Baseline Inventory (ONBOARDING §6). Unknown is its own state with the
 * reason, never «no drift»; nothing changes automatically.
 */
export function DriftTab({ data, drift, onMapping }: { data: EquipmentData; drift: ReturnType<typeof evaluateDrift> | null; onMapping(): void }) {
  const range = data.window ? `${data.window.from} – ${data.window.to}` : null;
  const body = data.bindings === null || data.bindings.bindings.length === 0 ? <EmptyState title="게시된 Mapping이 없습니다" body="게시한 뒤 새 Sample Window와 비교합니다." />
    : drift === null ? <EmptyState title={DRIFT_UNKNOWN} body={data.inventory === null ? '선택한 Sample Window의 Inventory가 없습니다.' : '최신 Binding의 Mapping Version이 없습니다.'} />
      : drift.drift === null ? <EmptyState title={DRIFT_UNKNOWN} body={drift.unknown ?? undefined} />
        : !drift.drifted ? <EmptyState title="기준 대비 Drift 없음" />
          : <div className="space-y-4 text-xs">
            {drift.drift.newAliases.length > 0 && <section aria-label="새 alias"><PanelSectionTitle className="mb-1">새 alias · {drift.drift.newAliases.length}</PanelSectionTitle>
              <ul className="m-0 list-disc pl-5 font-mono">{drift.drift.newAliases.map((alias) => <li key={alias}>{alias}</li>)}</ul></section>}
            {drift.drift.newSlots.length > 0 && <section aria-label="새 slot"><PanelSectionTitle className="mb-1">새 slot · {drift.drift.newSlots.length}</PanelSectionTitle>
              <ul className="m-0 list-disc pl-5 font-mono">{drift.drift.newSlots.map(({ alias, slot }) => <li key={`${alias}\u0000${slot}`}>{alias} / {slot}</li>)}</ul></section>}
            {drift.drift.transfersWithoutCapability.length > 0 && <section aria-label="Transfer Capability 없는 관측 이송"><PanelSectionTitle className="mb-1">Transfer Capability 없는 관측 이송 · {drift.drift.transfersWithoutCapability.length}</PanelSectionTitle>
              <ul className="m-0 list-disc pl-5">{drift.drift.transfersWithoutCapability.map(({ from, to, count }) => <li key={`${from}\u0000${to}`}><span className="font-mono">{from} → {to}</span> · {count}건</li>)}</ul></section>}
            <Button size="toolbar" variant="secondary" onClick={onMapping}>Mapping에서 검토</Button>
          </div>;
  return <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
    <p className="text-xs text-text-secondary">{range ? `Sample Window ${range}` : 'Sample Window 없음'} · 최신 Binding의 Baseline Inventory와 비교합니다. 자동으로 바뀌지 않습니다.</p>
    {body}
  </div>;
}
