type LabelledSystem = { id: string; name: string; slug: string };

/**
 * Labels for a set of Managed Systems shown together: the name alone (#2541 «코드 대신 라벨»), plus ` (slug)` only where
 * the name is shared by another system in the set (names are not unique, FO ADR-0017). A plain name that reads exactly
 * like another system's decorated label is decorated too, so no two labels in the set can look the same.
 */
export function managedSystemLabels(systems: readonly LabelledSystem[]): Map<string, string> {
  const nameCount = new Map<string, number>();
  for (const { name } of systems) nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  const decorate = ({ name, slug }: LabelledSystem) => (name && slug ? `${name} (${slug})` : name);
  const labels = new Map(systems.map(system => [system.id, (nameCount.get(system.name) ?? 0) > 1 ? decorate(system) : system.name]));
  // Decorating one plain name can make it equal a third system's plain name, so repeat until no plain name matches a
  // decorated label. Each pass decorates at least one more system, so this ends within `systems.length` passes.
  for (let changed = true; changed;) {
    changed = false;
    const decorated = new Set(systems.filter(system => labels.get(system.id) !== system.name).map(system => labels.get(system.id)));
    for (const system of systems) {
      if (labels.get(system.id) === system.name && decorated.has(system.name) && decorate(system) !== system.name) {
        labels.set(system.id, decorate(system));
        changed = true;
      }
    }
  }
  return labels;
}
