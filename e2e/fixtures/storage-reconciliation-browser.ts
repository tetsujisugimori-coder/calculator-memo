// Only the blank-origin synthetic test page imports these capabilities.
export * from './storage-reconciliation';
export { createMigrationEngine, hashRaw } from './storage-migration';
export { createIsolatedAdapter } from './storage-idb';
