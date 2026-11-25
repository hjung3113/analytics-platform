/** Reserve a helper ID in the option's set of consumer and already assigned helper IDs. */
export function helperSeriesId(base: string, taken: Set<string>): string {
  let id = base;
  for (let suffix = 1; taken.has(id); suffix++) id = `${base}~${suffix}`;
  taken.add(id);
  return id;
}
