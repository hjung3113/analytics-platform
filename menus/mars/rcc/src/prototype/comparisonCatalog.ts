export type Cohort = { id: string; ppid: string; layer: number; recipe: string };
export const COHORTS = [
  { id: '204-2-042', ppid: 'PPID-204', layer: 2, recipe: 'RCP-042' },
  { id: '318-3-057', ppid: 'PPID-318', layer: 3, recipe: 'RCP-057' },
  { id: '204-1-031', ppid: 'PPID-204', layer: 1, recipe: 'RCP-031' },
  { id: '318-1-042', ppid: 'PPID-318', layer: 1, recipe: 'RCP-042' },
  { id: '427-1-081', ppid: 'PPID-427', layer: 1, recipe: 'RCP-081' },
  { id: '427-2-091', ppid: 'PPID-427', layer: 2, recipe: 'RCP-091' },
] as const satisfies readonly Cohort[];

export type Structure = 'A' | 'B';
export type Step = { id: string; no: number; seq: number };
const STEP_COUNT = 18;

function steps(kind: Structure): Step[] {
  return Array.from({ length: STEP_COUNT }, (_, i) => {
    let no = i + 1 <= 2 ? (i + 1) * 10 : i * 10;
    if (kind === 'B' && i === 5) no += 5;
    if (kind === 'B' && i === 11) no += 5;
    const seq = i + 1;
    return { id: `${no}:${seq}`, no, seq };
  });
}

export const STRUCTURES = { A: steps('A'), B: steps('B') };
