/*
  Seed default users in Firebase Auth and Firestore.
  - Requires app/firebase-service-account.json (already in repo)
  - Creates/updates users with roles: gelatie, estoquista, produtor, gerente
  Usage:
    npm run db:seed:users
*/

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin = require('firebase-admin');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serviceAccount = require('../firebase-service-account.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || '12345678';

const USERS = [
  {
    email: 'junascimento1103@gmail.com',
    password: DEFAULT_PASSWORD,
    displayName: 'Gelatie',
    role: 'gelatie',
  }
];

async function upsertUser({ email, password, displayName, role }) {
  try {
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
      // Update password/display name to ensure known credentials
      await admin.auth().updateUser(userRecord.uid, { password, displayName });
      // eslint-disable-next-line no-console
      console.log(`✔️  Usuário já existia e foi atualizado: ${email}`);
    } catch (err) {
      if (err && err.errorInfo && err.errorInfo.code === 'auth/user-not-found') {
        userRecord = await admin.auth().createUser({ email, password, displayName });
        // eslint-disable-next-line no-console
        console.log(`✅ Usuário criado: ${email}`);
      } else {
        throw err;
      }
    }

    // Upsert Firestore profile
    await db.collection('users').doc(userRecord.uid).set(
      {
        email,
        displayName,
        role,
        // Using server time for created/updated
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // eslint-disable-next-line no-console
    console.log(`👤 Perfil gravado no Firestore (role=${role}): ${email}`);

    return userRecord.uid;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`❌ Falha ao criar/atualizar usuário ${email}:`, e.message || e);
    throw e;
  }
}

(async () => {
  try {
    // Simple confirmation if running interactively
    if (!process.env.CI) {
      // eslint-disable-next-line no-console
      console.log('Seeding de usuários padrão...');
    }

    for (const u of USERS) {
      // eslint-disable-next-line no-await-in-loop
      await upsertUser(u);
    }

    // eslint-disable-next-line no-console
    console.log('\n✅ Concluído. Credenciais padrão: email conforme acima, senha:', DEFAULT_PASSWORD);
    process.exit(0);
  } catch (e) {
    process.exit(1);
  }
})();
