/** Per-target concurrency cap shared by the SQL dialects. `acquire` waits while `limit` holders are active and rejects as
 * soon as `stopped` rejects; the returned release is idempotent and wakes every waiter so each re-checks the cap. */
export function createConcurrencyGate(limit: number): { acquire(stopped: Promise<never>): Promise<() => void> } {
  let active = 0;
  const waiters = new Set<() => void>();
  return {
    async acquire(stopped) {
      while (active >= limit) {
        let waiter: () => void = () => {};
        try {
          await Promise.race([new Promise<void>((resolve) => { waiter = resolve; waiters.add(resolve); }), stopped]);
        } finally {
          waiters.delete(waiter);
        }
      }
      active++;
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        active--;
        for (const waiter of [...waiters]) waiter();
      };
    },
  };
}
