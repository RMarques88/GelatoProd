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
/* eslint-disable */

import * as fs from 'fs';
import * as path from 'path';
import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { cleanupFirebase } from '../../src/services/firebase';

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

// Namespacing test collections per run to avoid cross-test interference when
// multiple E2E suites run in the same project. This appends a run-specific
// suffix to every collection name used by tests (only affects the `db` exported
// from this module, not the application runtime).
const TEST_RUN_ID =
  process.env.E2E_RUN_ID || `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
// Preserve original collection method
const __origCollection = (db as any).collection.bind(db);
(db as any).collection = function (colName: string) {
  // If caller already provided a namespaced string (rare), don't double-namespace
  if (typeof colName === 'string' && colName.includes('__e2e__')) {
    return __origCollection(colName);
  }
  const namespaced = `${colName}__e2e__${TEST_RUN_ID}`;
  return __origCollection(namespaced);
};

console.log(
  `🧪 E2E test run id: ${TEST_RUN_ID} — test collections will be namespaced with this id`,
);

// If visual E2E mode is enabled, instrument a lightweight operations recorder
// so tests can report exactly what was written/read. This is best-effort and
// only active when E2E_VISUAL=true in the environment.
if (process.env.E2E_VISUAL === 'true') {
  try {
    // Attach a global operations array
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).e2eVisualOps = (globalThis as any).e2eVisualOps ?? [];

    const origCollection = (db as any).collection.bind(db);
    (db as any).collection = function (colName: string) {
      const collRef = origCollection(colName);
      const origDoc = collRef.doc.bind(collRef);
      collRef.doc = function (docId?: string) {
        // When no docId is provided, call origDoc() without arguments so Firestore
        // generates a random ID. Passing undefined to origDoc causes a validation
        // error in the Firestore SDK.
        const docRef =
          typeof docId === 'string' && docId.length > 0 ? origDoc(docId) : origDoc();
        // Wrap set
        const origSet = docRef.set?.bind(docRef);
        if (origSet) {
          docRef.set = async function (data: any, options?: any) {
            try {
              (globalThis as any).e2eVisualOps.push({
                op: 'set',
                collection: colName,
                docId: docRef.id,
                data,
              });
            } catch (_) {
              // ignore
            }
            return origSet(data, options);
          };
        }

        // Wrap delete
        const origDelete = docRef.delete?.bind(docRef);
        if (origDelete) {
          docRef.delete = async function () {
            try {
              (globalThis as any).e2eVisualOps.push({
                op: 'delete',
                collection: colName,
                docId: docRef.id,
              });
            } catch (_) {}
            return origDelete();
          };
        }

        return docRef;
      };
      return collRef;
    };
    console.log('E2E_VISUAL: Firestore db instrumentation enabled');
  } catch (err) {
    console.warn('E2E_VISUAL: failed to instrument db:', err);
  }
}

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

process.once('beforeExit', async () => {
  // best-effort cleanup: terminate Admin SDK Firestore then cleanup client SDK
  try {
    await shutdownFirebaseApp();
  } catch {}
  try {
    await cleanupFirebase();
  } catch {}
});

process.once('SIGINT', async () => {
  try {
    await shutdownFirebaseApp();
  } catch {}
  try {
    await cleanupFirebase();
  } catch {}
  process.exit(0);
});

process.once('SIGTERM', async () => {
  try {
    await shutdownFirebaseApp();
  } catch {}
  try {
    await cleanupFirebase();
  } catch {}
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
