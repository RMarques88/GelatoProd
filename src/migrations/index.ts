export type MigrationContext = {
  dryRun?: boolean;
  now: Date;
};

export type Migration = {
  id: string;
  description: string;
  run: (context: MigrationContext) => Promise<void>;
};

const registry: Map<string, Migration> = new Map();

export function registerMigration(migration: Migration): void {
  if (registry.has(migration.id)) {
    throw new Error(`Migration with id "${migration.id}" already registered.`);
  }

  registry.set(migration.id, migration);
}

export function getRegisteredMigrations(): Migration[] {
  return Array.from(registry.values()).sort((first, second) =>
    first.id.localeCompare(second.id),
  );
}

export function createMigrationPlan(): Array<{
  id: string;
  description: string;
}> {
  return getRegisteredMigrations().map(({ id, description }) => ({ id, description }));
}

export async function runPendingMigrations(context: MigrationContext): Promise<void> {
  for (const migration of getRegisteredMigrations()) {
    // Future implementation: persist executed migrations (Firestore/AsyncStorage)
    // For now, we simply run them in order.
    await migration.run(context);
  }
}
