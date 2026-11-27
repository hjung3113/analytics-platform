import type { Condition, EquipmentAxisDescriptor } from '@ap/contracts';

/** Descriptor order first, unknown axes last by ID; no domain vocabulary in the SDK. */
export function labelledCondition(condition: Condition, axes: readonly EquipmentAxisDescriptor[], lang: 'ko' | 'en'): string {
  const known = axes.filter(axis => Object.hasOwn(condition, axis.id));
  const unknown = Object.keys(condition).filter(id => !axes.some(axis => axis.id === id)).sort();
  const listed = (id: string): readonly string[] => {
    const values = condition[id];
    if (values === undefined) throw new Error(`Condition axis "${id}" has no values`);
    return values;
  };
  return [...known.map(axis => `${axis.label[lang]}: ${listed(axis.id).join(', ')}`),
    ...unknown.map(id => `${id}: ${listed(id).join(', ')}`)].join(' · ');
}
