/**
 * Writes that survive a slow CODAP.
 *
 * iframe-phone abandons a request after 2 s, but CODAP v3.1.1 often takes
 * longer than that to reply to a create while it is busy, and the write still
 * happens (measured 2026-10-13: creating a dataset or a case table took over
 * 2 s on most attempts). So a timed-out write is not a failed write: `settle`
 * polls `check()` until the change shows up, and only then gives up.
 */
// Long, because each check is a read that may itself retry for ~20 s.
const VERIFY_FOR_MS = 60_000;
// Gentle: CODAP can stall its main thread for ~18 s after creating a table.
const POLL_MS = 1500;

export const isTimeout = (error) => /timed out/i.test(String(error?.message ?? error));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function settle(label, write, check) {
  try {
    const result = await write();
    if (result?.success) return;
    throw new Error(`${label}: ${JSON.stringify(result?.values ?? 'request failed')}`);
  } catch (error) {
    if (!isTimeout(error)) throw error;
  }
  for (const until = Date.now() + VERIFY_FOR_MS; Date.now() < until; await sleep(POLL_MS)) {
    try {
      if (await check()) return;
    } catch (error) {
      if (!isTimeout(error)) throw error;
    }
  }
  throw new Error(`CODAP did not confirm the change in time (${label})`);
}
