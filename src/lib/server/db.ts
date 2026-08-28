import Database from "better-sqlite3";
import path from "node:path";
import type { MaintenanceLogRecord } from "@/types";

declare global {
  var __sensegridDb: Database.Database | undefined;
}

/** Additive schema evolution — no migration framework exists, so this just adds
 *  any RUL columns missing from a maintenance_logs table created before this
 *  feature existed. New columns are nullable; existing rows/reads are unaffected. */
function migrateRULColumns(db: Database.Database): void {
  const existing = new Set(
    (db.pragma("table_info(maintenance_logs)") as { name: string }[]).map((c) => c.name)
  );
  const rulColumns: { name: string; ddl: string }[] = [
    { name: "rul", ddl: "ALTER TABLE maintenance_logs ADD COLUMN rul REAL" },
    { name: "failure_probability", ddl: "ALTER TABLE maintenance_logs ADD COLUMN failure_probability REAL" },
    { name: "prediction_confidence", ddl: "ALTER TABLE maintenance_logs ADD COLUMN prediction_confidence REAL" },
    { name: "trend", ddl: "ALTER TABLE maintenance_logs ADD COLUMN trend TEXT" },
  ];
  for (const column of rulColumns) {
    if (!existing.has(column.name)) db.exec(column.ddl);
  }
}

function createDb(): Database.Database {
  const dbPath = path.join(process.cwd(), "sensegrid.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      phase TEXT NOT NULL,
      component TEXT NOT NULL,
      health REAL NOT NULL,
      vibration REAL NOT NULL,
      temperature REAL NOT NULL,
      action TEXT NOT NULL
    );
  `);
  migrateRULColumns(db);
  return db;
}

/** Guarded via globalThis so dev-mode hot reload never opens a second connection. */
function getDb(): Database.Database {
  if (!globalThis.__sensegridDb) {
    globalThis.__sensegridDb = createDb();
  }
  return globalThis.__sensegridDb;
}

export function insertMaintenanceLog(record: MaintenanceLogRecord): void {
  getDb()
    .prepare(
      `INSERT INTO maintenance_logs
         (id, timestamp, phase, component, health, vibration, temperature, action, rul, failure_probability, prediction_confidence, trend)
       VALUES
         (@id, @timestamp, @phase, @component, @health, @vibration, @temperature, @action, @rul, @failureProbability, @predictionConfidence, @trend)`
    )
    .run(record);
}

export function listMaintenanceLogs(): MaintenanceLogRecord[] {
  return getDb()
    .prepare(
      `SELECT id, timestamp, phase, component, health, vibration, temperature, action,
              rul, failure_probability AS failureProbability, prediction_confidence AS predictionConfidence, trend
         FROM maintenance_logs ORDER BY timestamp DESC`
    )
    .all() as MaintenanceLogRecord[];
}

export function clearMaintenanceLogs(): void {
  getDb().prepare(`DELETE FROM maintenance_logs`).run();
}
