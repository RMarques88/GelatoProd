/**
 * Testes End-to-End (E2E) para validar fluxos completos da aplicação
 * com dados reais no Firestore.
 *
 * IMPORTANTE: Estes testes interagem com o Firestore real usando o
 * firebase-service-account.json. Execute em um projeto de testes separado
 * ou com cuidado para não poluir dados de produção.
 *
 * Como executar:
 *   npm run test:e2e
 *
 * Como executar um teste específico:
 *   npm run test:e2e -- stockAlerts.e2e.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

interface ServiceAccountJSON {
  project_id: string;
  [key: string]: unknown;
}

const serviceAccountPath = path.join(
  __dirname,
  '..',
  '..',
  'firebase-service-account.json',
);
const serviceAccountJSON = JSON.parse(
  fs.readFileSync(serviceAccountPath, 'utf8'),
) as ServiceAccountJSON;
const serviceAccount = serviceAccountJSON as unknown as ServiceAccount;

// Inicializa o Firebase Admin SDK para testes E2E
const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccountJSON.project_id,
});

export const db = getFirestore(app);
export const auth = getAuth(app);

// Ensure admin SDK is cleaned up when the test process exits to avoid
// open GRPC handles that make Jest hang with "Jest did not exit".
async function shutdownFirebaseApp() {
  try {
    // Terminate Firestore to close GRPC connections used by the Admin SDK.
    await db.terminate();
    console.log('✅ Firestore client terminated');
  } catch (err) {
    console.warn('⚠️ Error shutting down Firebase Admin app:', err);
  }
}

process.once('beforeExit', () => {
  // best-effort cleanup
  shutdownFirebaseApp().catch(() => {});
});

process.once('SIGINT', async () => {
  await shutdownFirebaseApp();
  process.exit(0);
});

process.once('SIGTERM', async () => {
  await shutdownFirebaseApp();
  process.exit(0);
});

// Helper para limpar coleções após os testes
export async function clearCollection(collectionName: string) {
  const snapshot = await db.collection(collectionName).get();
  const batch = db.batch();

  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(
    `✨ Coleção '${collectionName}' limpa (${snapshot.size} documentos removidos)`,
  );
}

// Helper para criar um usuário de teste
export async function createTestUser(email: string, password: string, role: string) {
  try {
    // Cria o usuário no Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `Test User ${role}`,
    });

    // Cria o perfil no Firestore
    await db.collection('users').doc(userRecord.uid).set({
      email,
      displayName: userRecord.displayName,
      role,
      phoneNumber: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });

    console.log(`✅ Usuário de teste criado: ${email} (${role})`);
    return userRecord;
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'auth/email-already-exists') {
      const userRecord = await auth.getUserByEmail(email);
      console.log(`♻️  Reutilizando usuário existente: ${email}`);
      return userRecord;
    }
    throw error;
  }
}

// Helper para deletar usuário de teste
export async function deleteTestUser(uid: string) {
  try {
    await auth.deleteUser(uid);
    await db.collection('users').doc(uid).delete();
    console.log(`🗑️  Usuário de teste removido: ${uid}`);
  } catch (error) {
    console.warn(`⚠️  Erro ao remover usuário de teste ${uid}:`, error);
  }
}

// Garante que testes não rodem em produção
// Verifica se o project_id termina com sufixos de produção
const productionSuffixes = ['-prod', '-production', '_prod', '_production'];
const isProduction = productionSuffixes.some(suffix =>
  serviceAccountJSON.project_id?.endsWith(suffix),
);

if (isProduction && process.env.ALLOW_E2E_ON_PROD !== 'true') {
  console.error('❌ ERRO: Tentativa de executar testes E2E em projeto de PRODUÇÃO!');
  console.error('   Para permitir (não recomendado), defina ALLOW_E2E_ON_PROD=true');
  process.exit(1);
}

console.log(`🧪 Testes E2E inicializados no projeto: ${serviceAccountJSON.project_id}`);
