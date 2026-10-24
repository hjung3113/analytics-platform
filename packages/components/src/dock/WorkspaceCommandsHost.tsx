import { createContext, useContext, useId, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

/** One command a menu workspace offers its host (the board pane menu): presets and the height mode as radios, reopening a hidden panel, the default layout. */
export type WorkspaceCommand = {
  id: string;
  label: string;
  /** `radio`: one of a group of exclusive choices; `action`: runs once. */
  kind: 'radio' | 'action';
  /** The radio group a `radio` belongs to, each with its own checked item. Absent = `'preset'` (the presets); the height mode is `'mode'`. */
  group?: 'preset' | 'mode';
  /** The localized name of the radio group, set by the producer on a group's commands; absent = the group is unnamed. */
  groupLabel?: string;
  checked?: boolean;
  disabled?: boolean;
  /** A hidden panel's badge description, shown with its `다시 보기` item. */
  description?: string;
  /** A hidden panel's badge is a warning: the surface marks the hidden-panel list. */
  warning?: boolean;
  run: () => void;
};

/** The radio commands in their groups, first-seen order (the presets, then the height mode): one exclusive set each, with its own checked item. */
export function radioGroupsOf(commands: readonly WorkspaceCommand[]): WorkspaceCommand[][] {
  const groups = new Map<string, WorkspaceCommand[]>();
  for (const command of commands) if (command.kind === 'radio') groups.set(command.group ?? 'preset', [...(groups.get(command.group ?? 'preset') ?? []), command]);
  return [...groups.values()];
}

type Entry = { key: string; depth: number; commands: readonly WorkspaceCommand[] };
type Registrar = { set: (entry: Entry) => void; remove: (key: string) => void };
type HostState = { activeKey: string | undefined; commands: readonly WorkspaceCommand[] };

const RegistrarContext = createContext<Registrar | null>(null);
const StateContext = createContext<HostState>({ activeKey: undefined, commands: [] });
const NoCommands: readonly WorkspaceCommand[] = [];

/**
 * Host-only provider (ADR-0067 decision 3): a surface that owns its own menu (the board pane) renders it around the pane content. A
 * `PanelWorkspace` inside shows no toolbar and registers its commands here; the host reads them with `useWorkspaceCommands()`.
 *
 * One registrant is active, the innermost (deepest nested workspace; among equals the last registered). A superseded workspace is not
 * hosted: it draws its own toolbar. Two nested workspaces are not a supported design; this only keeps the outcome defined.
 */
export function WorkspaceCommandsHost({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<readonly Entry[]>([]);
  const registrar = useMemo<Registrar>(() => ({
    set: entry => { setEntries(previous => [...previous.filter(existing => existing.key !== entry.key), entry]); },
    remove: key => { setEntries(previous => (previous.some(existing => existing.key === key) ? previous.filter(existing => existing.key !== key) : previous)); },
  }), []);
  const state = useMemo<HostState>(() => {
    const winner = entries.reduce<Entry | undefined>((best, entry) => (best === undefined || entry.depth >= best.depth ? entry : best), undefined);
    return { activeKey: winner?.key, commands: winner?.commands ?? NoCommands };
  }, [entries]);
  return <RegistrarContext.Provider value={registrar}><StateContext.Provider value={state}>{children}</StateContext.Provider></RegistrarContext.Provider>;
}

/** The commands of the active workspace under the nearest `WorkspaceCommandsHost`; empty outside one or while none is registered. */
export function useWorkspaceCommands(): readonly WorkspaceCommand[] {
  return useContext(StateContext).commands;
}

const DepthContext = createContext(0);
export const WorkspaceDepthProvider = DepthContext.Provider;
export const useWorkspaceDepth = () => useContext(DepthContext);

/**
 * Internal (the workspace only). Registers `commands` for as long as the caller is mounted and returns whether the host shows them: true
 * while this caller is the active registrant (or nothing has registered yet, so the first paint carries no toolbar). Outside a host: false.
 */
export function useRegisterWorkspaceCommands(commands: readonly WorkspaceCommand[], depth: number): boolean {
  const registrar = useContext(RegistrarContext);
  const { activeKey } = useContext(StateContext);
  const key = useId();
  useLayoutEffect(() => {
    if (!registrar) return;
    registrar.set({ key, depth, commands });
  }, [registrar, key, depth, commands]);
  useLayoutEffect(() => {
    if (!registrar) return;
    return () => { registrar.remove(key); };
  }, [registrar, key]);
  return registrar !== null && (activeKey === undefined || activeKey === key);
}
