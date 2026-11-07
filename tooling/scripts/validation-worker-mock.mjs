// 합성 fixture — the reference worker of the validation request queue (#1445 d, ADR-0117 decision 10, log-lifecycle
// design §4). It is a SYNTHETIC stand-in: it invents rule results from the sample list it is handed and calls no
// Validator and no LLM. It is not evidence that any in-house Validator is connected; the integration tests and the dev
// seed use it to drive claim -> heartbeat -> result against the real server.
//
// Library use (transport-agnostic): `runMockWorker({ send })` with `send(method, path, body) -> { status, body }`.
// Command line (a running server, a service token holding the scope `validation.worker`):
//   node tooling/scripts/validation-worker-mock.mjs --base-url http://localhost:3000 --token ap_… [--mode pass|fail|incomplete] [--heartbeats 1]

export const MOCK_QUEUE_PREFIX = '/api/v1/validation-queue';
export const MODES = ['pass', 'fail', 'incomplete'];

/**
 * The synthetic result for a claim. `pass`: one PASS per sample file. `fail`: the first rule FAILs at line 1 of the
 * first file with a short synthetic excerpt. `incomplete`: the last required rule is NOT_CHECKED.
 */
export function syntheticResult(claim, mode = 'pass') {
  const { request, attempt } = claim;
  const files = request.sampleSet.files;
  const results = files.map((file, i) => ({
    ruleId: `SYN-${String(i + 1).padStart(3, '0')}`,
    result: 'PASS',
    required: true,
    expected: 'synthetic rule holds',
    observed: 'synthetic rule holds',
    evidence: [{ fileRef: file.fileRef, line: 1, fileSha256: file.sha256 }],
  }));
  if (mode === 'fail' && results[0]) {
    const first = files[0];
    results[0] = {
      ...results[0],
      result: 'FAIL',
      observed: 'synthetic mismatch',
      evidence: [
        {
          fileRef: first.fileRef,
          line: 1,
          fileSha256: first.sha256,
          excerpt: '합성 fixture: synthetic log line',
        },
      ],
    };
  }
  if (mode === 'incomplete' && results.length > 0) {
    const last = results.length - 1;
    results[last] = { ...results[last], result: 'NOT_CHECKED', observed: null };
  }
  return {
    attemptNo: attempt.attemptNo,
    inputManifestDigest: request.sampleManifestDigest,
    executorVersion: 'synthetic-fixture/1',
    executorDigest: null,
    ruleSetRevision: 'synthetic-rules/1',
    summary: { fixture: 'synthetic', note: '합성 fixture — 실제 Validator 아님', mode },
    results,
  };
}

/** One pass of the worker loop: claim, heartbeat, submit. Returns `{ claimed: false }` on a 204. */
export async function runMockWorker({
  send,
  mode = 'pass',
  heartbeats = 1,
  build = syntheticResult,
}) {
  const claim = await send('POST', `${MOCK_QUEUE_PREFIX}/claim`, {});
  if (claim.status === 204) return { claimed: false };
  if (claim.status !== 200) return { claimed: false, error: claim };
  const { request, attempt } = claim.body;
  for (let i = 0; i < heartbeats; i += 1) {
    const beat = await send('POST', `${MOCK_QUEUE_PREFIX}/requests/${request.id}/heartbeat`, {
      attemptNo: attempt.attemptNo,
    });
    if (beat.status !== 200) return { claimed: true, request, attempt, heartbeat: beat };
  }
  const body = build(claim.body, mode);
  const result = await send('POST', `${MOCK_QUEUE_PREFIX}/requests/${request.id}/result`, body);
  return { claimed: true, request, attempt, resultBody: body, result };
}

async function main(argv) {
  const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const baseUrl = arg('base-url', 'http://localhost:3000');
  const token = arg('token', process.env.VALIDATION_WORKER_TOKEN);
  const mode = arg('mode', 'pass');
  if (!token) throw new Error('--token (or VALIDATION_WORKER_TOKEN) is required');
  if (!MODES.includes(mode)) throw new Error(`--mode must be one of ${MODES.join(', ')}`);
  const send = async (method, path, body) => {
    const res = await fetch(new URL(path, baseUrl), {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const out = await runMockWorker({ send, mode, heartbeats: Number(arg('heartbeats', '1')) });
  process.stdout.write(
    `${JSON.stringify(out.claimed ? { claimed: true, requestId: out.request?.id, result: out.result?.body ?? null } : out, null, 2)}\n`,
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
