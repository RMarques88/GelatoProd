/*
 * Script: wipe-firestore.js
 * PERIGO: Remove (delete) todos os documentos das coleções principais do projeto.
 * Use APENAS em ambiente de desenvolvimento ou projeto de testes.
 * Requer o arquivo firebase-service-account.json na raiz de /app.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountPath = path.join(__dirname, '..', 'firebase-service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Arquivo firebase-service-account.json não encontrado em /app');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
const db = getFirestore();

// Lista de coleções que serão limpas. Ajuste conforme necessário.
const collections = [
  'users',
  'products',
  'recipes',
  'stockItems',
  'stockMovements',
  'stockAlerts',
  'productionPlans',
  'productionStages',
  'productionDivergences',
  'notifications',
  'appSequences',
  'pricingSettings',
];

async function deleteCollection(name) {
  const snap = await db.collection(name).get();
  if (snap.empty) {
    console.log(`✅ ${name}: vazia (nada a remover)`);
    return;
  }
  const batch = db.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  console.log(`🗑️  ${name}: ${snap.size} documentos removidos.`);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve =>
    rl.question(question, ans => {
      rl.close();
      resolve(ans);
    }),
  );
}

(async () => {
  const confirm = (process.argv || []).includes('--yes')
    ? 'yes'
    : await ask(
        '⚠️  Esta ação vai APAGAR documentos das coleções principais. Digite "APAGAR" para confirmar: ',
      );

  if (confirm !== 'APAGAR' && confirm !== 'yes') {
    console.log('Operação cancelada. Nenhuma coleção foi alterada.');
    process.exit(0);
  }

  console.log('⚠️  INICIANDO LIMPEZA DO FIRESTORE');
  const start = Date.now();
  for (const c of collections) {
    try {
      await deleteCollection(c);
    } catch (err) {
      console.error(`Erro limpando coleção ${c}:`, err);
    }
  }
  console.log(`✨ Concluído em ${((Date.now() - start) / 1000).toFixed(2)}s.`);
})();
