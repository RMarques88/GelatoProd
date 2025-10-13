import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function globalTeardown() {
  try {
    const serviceAccountPath = path.join(__dirname, '..', '..', 'firebase-service-account.json');
    if (!fs.existsSync(serviceAccountPath)) {
      console.warn('globalTeardown: no firebase-service-account.json found, skipping Firestore terminate');
      return;
    }
    const serviceAccountJSON = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    const app = initializeApp({ credential: cert(serviceAccountJSON), projectId: serviceAccountJSON.project_id });
    const db = getFirestore(app);
    await db.terminate();
    if (typeof app.delete === 'function') {
      try { await app.delete(); } catch (e) { /* ignore */ }
    }
    console.log('globalTeardown: Firestore terminated');
  } catch (err) {
    console.warn('globalTeardown: error during teardown', err);
  }
}

export default globalTeardown();
