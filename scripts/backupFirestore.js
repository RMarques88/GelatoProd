/*
 * Script to back up specific Firestore collections to local JSON files.
 * Run from the `app` folder: `node ./scripts/backupFirestore.js`
 * Requires app/firebase-service-account.json to exist.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('firebase-service-account.json not found at', serviceAccountPath);
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});
const db = admin.firestore();

const COLLECTIONS = ['products', 'stockItems', 'recipes', 'stockMovements', 'users'];

async function dumpCollection(col) {
  const snapshot = await db.collection(col).get();
  const docs = snapshot.docs.map(d => ({ id: d.id, data: d.data() }));
  return docs;
}

async function run() {
  const dir = path.join(__dirname, '..', 'tests', 'e2e', 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const summary = {};
  for (const col of COLLECTIONS) {
    console.log('Backing up', col);
    const docs = await dumpCollection(col);
    const filename = path.join(dir, `${col}-${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify(docs, null, 2), 'utf8');
    summary[col] = filename;
    console.log(' ->', filename);
  }
  await admin.app().delete();
  console.log('Backup complete', summary);
}

run().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
