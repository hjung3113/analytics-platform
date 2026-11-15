# Mock delays

Server requests and adapter helpers share `sleep(ms, signal)` in `src/server.ts`.
An already aborted signal rejects with `AbortError` before scheduling work.
The abort listener runs once and is removed on both normal completion and cancellation; cancellation also clears the timer.
Delay selection still uses the adapter-wide latency override and the existing per-call defaults.
