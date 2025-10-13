const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

module.exports = async function globalTeardown() {
  try {
    const serviceAccountPath = path.join(
      __dirname,
      '..',
      '..',
      'firebase-service-account.json',
    );
    if (!fs.existsSync(serviceAccountPath)) {
      console.warn(
        'globalTeardown: no firebase-service-account.json found, skipping Firestore terminate',
      );
      return;
    }
    const serviceAccountJSON = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    const app = initializeApp({
      credential: cert(serviceAccountJSON),
      projectId: serviceAccountJSON.project_id,
    });
    const db = getFirestore(app);
    await db.terminate();
    // try to delete the admin app if possible (best-effort)
    if (typeof app.delete === 'function') {
      try {
        await app.delete();
      } catch (e) {
        /* ignore */
      }
    }
    console.log('globalTeardown: Firestore terminated');
    // Also attempt to terminate any client SDK Firestore instances created by tests
    try {
      // require the modular client SDK (if present) and terminate its Firestore instances
      const { getApps: getClientApps } = require('firebase/app');
      const {
        getFirestore: getClientFirestore,
        terminate: terminateClientFirestore,
      } = require('firebase/firestore');
      const clientApps = typeof getClientApps === 'function' ? getClientApps() : [];
      for (const clientApp of clientApps) {
        try {
          const clientDb = getClientFirestore(clientApp);
          if (clientDb && typeof terminateClientFirestore === 'function') {
            await terminateClientFirestore(clientDb);
          }
        } catch (e) {
          // ignore per-app failures
        }
      }
      // Also attempt to delete client apps (best-effort) to close any underlying resources
      try {
        const { deleteApp } = require('firebase/app');
        for (const clientApp of clientApps) {
          try {
            if (clientApp && typeof clientApp.delete === 'function') {
              // modern SDK may expose instance.delete()
              await clientApp.delete();
            } else if (typeof deleteApp === 'function') {
              await deleteApp(clientApp);
            }
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        // ignore if deleteApp not available
      }
      console.log('globalTeardown: attempted client SDK Firestore termination');
      // give the underlying GRPC/connection layer a moment to close
      await new Promise(res => setTimeout(res, 1000));
    } catch (e) {
      // firebase client SDK not installed or termination not available - ignore
    }
    // If running in CI or explicitly requested, force the process to exit after a short delay.
    try {
      const shouldForceExit =
        process.env.CI === 'true' || process.env.FORCE_JEST_EXIT === 'true';
      if (shouldForceExit) {
        console.log(
          'globalTeardown: forcing process.exit to ensure Jest terminates (CI/override)',
        );
        setTimeout(() => process.exit(0), 500);
      }
    } catch (e) {
      // ignore
    }
  } catch (err) {
    console.warn('globalTeardown: error during teardown', err);
  }
};
