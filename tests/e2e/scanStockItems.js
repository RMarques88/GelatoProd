/*
 * Read-only scanner for stockItems to classify stored cost units.
 * Usage: node ./tests/e2e/scanStockItems.js
 * Requires the firebase-service-account.json file at the repository root (app/firebase-service-account.json)
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const serviceAccountPath = path.join(
  __dirname,
  '..',
  '..',
  'firebase-service-account.json',
);
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

async function run() {
  const snapshot = await db.collection('stockItems').get();
  const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  const results = {
    total: items.length,
    zeroCostCount: 0,
    kgLikeCount: 0,
    gLikeCount: 0,
    zeroExamples: [],
    kgExamples: [],
    gExamples: [],
  };

  for (const it of items) {
    const avg = (it.averageUnitCostInBRL ?? it.highestUnitCostInBRL ?? 0) || 0;
    if (!avg || avg === 0) {
      results.zeroCostCount++;
      if (results.zeroExamples.length < 10)
        results.zeroExamples.push({ id: it.productId ?? it.id, avg, raw: it });
    } else if (avg > 1) {
      results.kgLikeCount++;
      if (results.kgExamples.length < 10)
        results.kgExamples.push({ id: it.productId ?? it.id, avg, raw: it });
    } else if (avg > 0 && avg < 0.01) {
      results.gLikeCount++;
      if (results.gExamples.length < 10)
        results.gExamples.push({ id: it.productId ?? it.id, avg, raw: it });
    }
  }

  // Save backup
  const dir = path.join(__dirname, 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = path.join(dir, `stockItems-scan-${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify({ items, results }, null, 2), 'utf8');

  console.log('Scan complete. Summary:');
  console.log(' total items:', results.total);
  console.log(' zeroCostCount (avg/highest == 0):', results.zeroCostCount);
  console.log(' kgLikeCount (avg > 1):', results.kgLikeCount);
  console.log(' gLikeCount (avg < 0.01):', results.gLikeCount);
  console.log(' examples saved to', filename);

  await admin.app().delete();
}

run().catch(err => {
  console.error('Scan failed:', err);
  process.exit(1);
});
