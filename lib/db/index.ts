// Database access for the app. `getDb()` returns the Drizzle instance
// (lazy singleton over the injected DATABASE_URL); `getSql()` the raw
// postgres.js client. Prefer `scopedRepo` from "lyzr-architect-pg" for
// user-owned tables.
export { getDb, getSql, initDB } from "lyzr-architect-pg";
