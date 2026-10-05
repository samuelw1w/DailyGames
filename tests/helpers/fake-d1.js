// Minimal stand-in for Cloudflare D1 backed by Node's built-in SQLite, so API tests run
// against the real migration SQL without Wrangler. Covers only what the API uses.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

const MIGRATIONS = new URL("../../api/migrations/", import.meta.url);

class Bound {
  constructor(db, sql, args) { this.db = db; this.sql = sql; this.args = args; }
  _exec() {
    const stmt = this.db.prepare(this.sql);
    if (/^\s*select/i.test(this.sql)) return { results: stmt.all(...this.args), meta: { changes: 0 } };
    const info = stmt.run(...this.args);
    return { results: [], meta: { changes: Number(info.changes) } };
  }
  async first() { return this._exec().results[0] ?? null; }
  async all() { return this._exec(); }
  async run() { return this._exec(); }
}

export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(new URL(f, MIGRATIONS), "utf8"));
  }
  return {
    prepare: (sql) => ({ bind: (...args) => new Bound(db, sql, args), ...new Bound(db, sql, []) }),
    async batch(stmts) {
      db.exec("BEGIN");
      try { const out = stmts.map((s) => s._exec()); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}
