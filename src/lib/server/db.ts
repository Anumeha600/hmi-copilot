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

  // Time-Travel HMI replay — discrete, timestamped machine/HMI events.
  db.exec(`
    CREATE TABLE IF NOT EXISTS hmi_events (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      machine TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      state_json TEXT
    );
  `);
  return db;
}

export interface HmiEventRecord {
  id: string;
  ts: number;
  machine: string;
  kind: string;
  title: string;
  detail: string;
  /** Compact machine-state snapshot at this instant, JSON-encoded. */
  stateJson: string | null;
}

export function insertHmiEvent(record: HmiEventRecord): void {
  getDb()
    ?.prepare(
      `INSERT OR REPLACE INTO hmi_events (id, ts, machine, kind, title, detail, state_json)
       VALUES (@id, @ts, @machine, @kind, @title, @detail, @stateJson)`
    )
    .run(record);
}

export function listHmiEvents(sinceMs?: number): HmiEventRecord[] {
  const db = getDb();
  if (!db) return [];
  const rows = sinceMs
    ? db.prepare(`SELECT id, ts, machine, kind, title, detail, state_json AS stateJson FROM hmi_events WHERE ts >= ? ORDER BY ts ASC`).all(sinceMs)
    : db.prepare(`SELECT id, ts, machine, kind, title, detail, state_json AS stateJson FROM hmi_events ORDER BY ts ASC`).all();
  return rows as HmiEventRecord[];
}

export function clearHmiEvents(): void {
  getDb()?.prepare(`DELETE FROM hmi_events`).run();
}

/**
 * Guarded via globalThis so dev-mode hot reload never opens a second connection.
 *
 * Returns `null` if the database can't be opened (e.g. a read-only production
 * filesystem). Every caller degrades gracefully — the HMI Copilot's DVR keeps
 * its state frames in memory regardless; SQLite only persists discrete live
 * events, which are best-effort. See DEPLOYMENT.md.
 */
let dbUnavailable = false;
function getDb(): Database.Database | null {
  if (globalThis.__sensegridDb) return globalThis.__sensegridDb;
  if (dbUnavailable) return null;
  try {
    globalThis.__sensegridDb = createDb();
    return globalThis.__sensegridDb;
  } catch (err) {
    dbUnavailable = true;
    console.warn("[db] SQLite unavailable — persistent event history disabled for this run:", (err as Error).message);
    return null;
  }
}

export function insertMaintenanceLog(record: MaintenanceLogRecord): void {
  getDb()
    ?.prepare(
      `INSERT INTO maintenance_logs
         (id, timestamp, phase, component, health, vibration, temperature, action, rul, failure_probability, prediction_confidence, trend)
       VALUES
         (@id, @timestamp, @phase, @component, @health, @vibration, @temperature, @action, @rul, @failureProbability, @predictionConfidence, @trend)`
    )
    .run(record);
}

export function listMaintenanceLogs(): MaintenanceLogRecord[] {
  return (getDb()
    ?.prepare(
      `SELECT id, timestamp, phase, component, health, vibration, temperature, action,
              rul, failure_probability AS failureProbability, prediction_confidence AS predictionConfidence, trend
         FROM maintenance_logs ORDER BY timestamp DESC`
    )
    .all() as MaintenanceLogRecord[]) ?? [];
}

export function clearMaintenanceLogs(): void {
  getDb()?.prepare(`DELETE FROM maintenance_logs`).run();
}
