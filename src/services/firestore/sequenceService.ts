import { doc, runTransaction } from 'firebase/firestore';

import { getDb } from './utils';

const SEQUENCES_COLLECTION = 'appSequences';

export async function getNextSequence(sequenceName: string): Promise<number> {
  const db = getDb();
  const reference = doc(db, SEQUENCES_COLLECTION, sequenceName);

  const nextValue = await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(reference);
    const currentValue = snapshot.exists() ? ((snapshot.data().value as number) ?? 0) : 0;
    const updatedValue = currentValue + 1;

    transaction.set(
      reference,
      { value: updatedValue, updatedAt: Date.now() },
      { merge: true },
    );

    return updatedValue;
  });

  return nextValue;
}

export function formatSequenceCode(prefix: string, sequence: number, length = 4): string {
  const padded = sequence.toString().padStart(length, '0');
  return `${prefix}-${padded}`;
}
