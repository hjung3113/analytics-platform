import type { Condition, EquipmentAxisDescriptor } from '@ap/contracts';

/** Descriptor order first, unknown axes last by ID; no domain vocabulary in the SDK. */
export function labelledCondition(condition: Condition, axes: readonly EquipmentAxisDescriptor[], lang: 'ko' | 'en'): string {
  const known = axes.filter(axis => Object.hasOwn(condition, axis.id));
  const unknown = Object.keys(condition).filter(id => !axes.some(axis => axis.id === id)).sort();
  return [...known.map(axis => `${axis.label[lang]}: ${condition[axis.id].join(', ')}`),
    ...unknown.map(id => `${id}: ${condition[id].join(', ')}`)].join(' · ');
}
