/** A user-facing string in both supported languages. */
export type Text = { ko: string; en: string };

/** App-supplied classification metadata (ADR-0059). */
export type EquipmentAxisDescriptor = { id: string; label: Text; membershipHistory: boolean; dependsOn?: string };
