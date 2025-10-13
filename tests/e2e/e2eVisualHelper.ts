/* eslint-disable */
/*
 * Helper activated when E2E_VISUAL=true in the environment.
 * - adds beforeEach/afterEach hooks that pause 5s so a human can observe test output
 * - logs test name, start/end and a small timestamp
 * - exposes utility `e2eLog(expected, actual, message?)` for tests to call for detailed comparisons
 */

export const E2E_VISUAL_ENABLED = process.env.E2E_VISUAL === 'true' || false;

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export function installVisualHooks() {
  if (!E2E_VISUAL_ENABLED) return;

  beforeEach(async () => {
    const name = expect.getState().currentTestName ?? '<unknown test>';
    console.log('\n[E2E-VISUAL] Starting test:', name, 'at', new Date().toISOString());
    // small initial pause so the user can prepare
    await sleep(500);
  }, 30000);

  afterEach(async () => {
    const name = expect.getState().currentTestName ?? '<unknown test>';
    console.log('[E2E-VISUAL] Finished test:', name, 'at', new Date().toISOString());

    // If the setup instrumentation recorded Firestore ops, print them now.
    try {
      // @ts-expect-error - dynamic global populated by setup
      const ops = (globalThis as any).e2eVisualOps ?? [];
      if (ops && ops.length) {
        console.log('[E2E-VISUAL] Firestore operations recorded for this test:');
        for (const op of ops) {
          console.log('   ', op);
        }

        // Attempt to read back set ops and compare expected vs persisted values.
        try {
          // dynamically import the test setup which exports the admin db
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          // @ts-ignore
          const setup = await import('./setup');
          const db = setup.db;
          for (const op of ops) {
            if (op.op === 'set' && op.collection && op.docId) {
              try {
                const doc = await db.collection(op.collection).doc(op.docId).get();
                const actual = doc.exists ? doc.data() : null;
                console.log(`[E2E-VISUAL] Compare for ${op.collection}/${op.docId}:`);
                compareAndLog(op.data ?? {}, actual ?? {}, 'write->read');
              } catch (err) {
                console.log('[E2E-VISUAL] failed to read back for compare:', err);
              }
            }
          }
        } catch (err) {
          // reading back is best-effort; ignore errors (e.g., missing setup or permissions)
          console.log('[E2E-VISUAL] read-back compare skipped:', err?.message ?? err);
        }

        // clear ops after reporting
        // @ts-expect-error
        (globalThis as any).e2eVisualOps = [];
      }
    } catch {
      // ignore overall errors in visual reporting
    }

    console.log('[E2E-VISUAL] Pausing 5s before next test...');
    await sleep(5000);
  }, 30000);
}

export function e2eLog(expected: unknown, actual: unknown, message?: string) {
  console.log(
    '[E2E-VISUAL-LOG]',
    message ?? '',
    'expected:',
    JSON.stringify(expected),
    'actual:',
    JSON.stringify(actual),
  );
}

// Deep-diff a pair of objects and print a compact, line-by-line field report.
export function compareAndLog(
  expected: Record<string, any> | unknown,
  actual: Record<string, any> | unknown,
  label?: string,
) {
  try {
    const e = expected as Record<string, any> | null;
    const a = actual as Record<string, any> | null;
    console.log('[E2E-VISUAL-COMPARE]', label ?? 'compare');
    if (e == null && a == null) {
      console.log('  both null/undefined');
      return;
    }
    if (e == null) {
      console.log('  expected: null/undefined, actual:', JSON.stringify(a));
      return;
    }
    if (a == null) {
      console.log('  actual: null/undefined, expected:', JSON.stringify(e));
      return;
    }
    const keys = new Set([...Object.keys(e), ...Object.keys(a)]);
    for (const k of Array.from(keys).sort()) {
      const ev = e[k];
      const av = a[k];
      if (JSON.stringify(ev) === JSON.stringify(av)) {
        console.log(`  ${k}: OK -> ${JSON.stringify(av)}`);
      } else {
        console.log(
          `  ${k}: EXPECTED ${JSON.stringify(ev)} || GOT ${JSON.stringify(av)}`,
        );
      }
    }
  } catch (err) {
    console.log('[E2E-VISUAL-COMPARE] compare error:', err);
  }
}

// Expose helper globally so existing tests do not need to import it.
try {
  // @ts-ignore
  (globalThis as any).e2eVisual = {
    E2E_VISUAL_ENABLED,
    sleep,
    e2eLog,
    compareAndLog,
  };
} catch {
  // ignore
}
