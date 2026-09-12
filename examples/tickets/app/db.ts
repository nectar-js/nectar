import { DatabaseSync } from "node:sqlite";

let db: DatabaseSync | undefined;

/**
 * Opened on first use, not at import, so `nectar build` (which imports every route file) never
 * touches the database. `TICKETS_DB` overrides the path; the tests set it to `:memory:`.
 */
export function database(): DatabaseSync {
  if (db === undefined) {
    db = new DatabaseSync(process.env.TICKETS_DB ?? "tickets.db");
    db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        id        INTEGER PRIMARY KEY,
        subject   TEXT    NOT NULL,
        opened_by TEXT    NOT NULL,
        assignee  TEXT,
        reason    TEXT,
        opened_at INTEGER NOT NULL,
        closed_at INTEGER
      )
    `);
  }
  return db;
}
