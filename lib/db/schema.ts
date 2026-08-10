/**
 * Truewiki database schema (PostgreSQL via Drizzle).
 */
export { users } from "lyzr-architect-pg/schema";

import {
  pgTable,
  text,
  integer,
  boolean,
  real,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  timestamps,
  ownerUserId,
  generateId,
} from "lyzr-architect-pg/schema";

// Per-user profile — extends the auth user with a role. 1:1 with the auth
// user via owner_user_id (auto-stamped/scoped by scopedRepo).
export const user_profiles = pgTable(
  "user_profiles",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    owner_user_id: ownerUserId(),
    email: text("email").notNull().default(""),
    role: text("role").notNull().default("viewer"), // admin | owner | viewer
    invited: boolean("invited").notNull().default(false),
    default_cadence: text("default_cadence").notNull().default("weekly"),
    notify_on_drift: boolean("notify_on_drift").notNull().default(true),
    notify_digest: boolean("notify_digest").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("user_profiles_owner_uidx").on(t.owner_user_id)]
);

// Connected source systems (shared, workspace-wide — gated by role in routes).
export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    kind: text("kind").notNull(), // slack | drive | github | jira | linear
    display_name: text("display_name").notNull(),
    scopes: jsonb("scopes").notNull().default([]),
    authority_rank: integer("authority_rank").notNull().default(3), // 1-5
    status: text("status").notNull().default("disconnected"),
    last_synced_at: timestamp("last_synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("sources_kind_idx").on(t.kind)]
);

export const source_cursors = pgTable(
  "source_cursors",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    source_id: text("source_id").notNull(),
    scope_key: text("scope_key").notNull(),
    cursor_ts: timestamp("cursor_ts", { withTimezone: true }),
    cursor_native_id: text("cursor_native_id"),
    last_run_at: timestamp("last_run_at", { withTimezone: true }),
    last_status: text("last_status").notNull().default("idle"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("source_cursors_src_scope_uidx").on(t.source_id, t.scope_key),
    index("source_cursors_source_idx").on(t.source_id),
  ]
);

export const source_events = pgTable(
  "source_events",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    event_uid: text("event_uid").notNull(),
    source_id: text("source_id").notNull(),
    scope_key: text("scope_key").notNull().default(""),
    author: text("author").notNull().default(""),
    event_ts: timestamp("event_ts", { withTimezone: true }),
    text: text("text").notNull().default(""),
    url: text("url").notNull().default(""),
    ingested_at: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("source_events_uid_uidx").on(t.event_uid),
    index("source_events_source_idx").on(t.source_id),
  ]
);

export const pages = pgTable(
  "pages",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    body_md: text("body_md").notNull().default(""),
    status: text("status").notNull().default("verified"), // verified | drift_detected | stale | applying
    owner_user_id: text("owner_user_id"), // business owner (nullable) — NOT the framework scoping column
    cadence: text("cadence").notNull().default("weekly"), // daily | weekly | monthly
    last_verified_at: timestamp("last_verified_at", { withTimezone: true }),
    open_finding_count: integer("open_finding_count").notNull().default(0),
    self_maintained: boolean("self_maintained").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("pages_slug_uidx").on(t.slug),
    index("pages_owner_idx").on(t.owner_user_id),
  ]
);

export const page_sections = pgTable(
  "page_sections",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    page_id: text("page_id").notNull(),
    heading: text("heading").notNull(),
    body_md: text("body_md").notNull().default(""),
    source_scope_ids: jsonb("source_scope_ids").notNull().default([]),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("page_sections_page_idx").on(t.page_id)]
);

export const page_versions = pgTable(
  "page_versions",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    page_id: text("page_id").notNull(),
    body_md: text("body_md").notNull().default(""),
    version_no: integer("version_no").notNull(),
    created_by: text("created_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("page_versions_page_v_uidx").on(t.page_id, t.version_no),
    index("page_versions_page_idx").on(t.page_id),
  ]
);

export const findings = pgTable(
  "findings",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    finding_key: text("finding_key").notNull(),
    section_id: text("section_id").notNull(),
    kind: text("kind").notNull().default("contradiction"), // contradiction | staleness | gap | confirmation
    confidence: real("confidence").notNull().default(0),
    claim: text("claim").notNull().default(""),
    evidence: jsonb("evidence").notNull().default([]),
    state: text("state").notNull().default("detected"), // detected | pending_review | approved | rejected | superseded
    ...timestamps,
  },
  (t) => [
    uniqueIndex("findings_key_uidx").on(t.finding_key),
    index("findings_section_idx").on(t.section_id),
  ]
);

export const proposals = pgTable(
  "proposals",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    finding_id: text("finding_id").notNull(),
    page_id: text("page_id").notNull(),
    section_id: text("section_id").notNull(),
    current_md: text("current_md").notNull().default(""),
    proposed_md: text("proposed_md").notNull().default(""),
    rationale: text("rationale").notNull().default(""),
    source_kind: text("source_kind").notNull().default(""),
    source_url: text("source_url").notNull().default(""),
    source_snippet: text("source_snippet").notNull().default(""),
    conflict: jsonb("conflict"),
    state: text("state").notNull().default("pending_review"), // pending_review | approved | applied | rejected | superseded
    owner_user_id: text("owner_user_id"),
    resolved_at: timestamp("resolved_at", { withTimezone: true }),
    applied_version_id: text("applied_version_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("proposals_finding_uidx").on(t.finding_id),
    index("proposals_page_idx").on(t.page_id),
    index("proposals_owner_idx").on(t.owner_user_id),
    index("proposals_state_idx").on(t.state),
  ]
);

export const audit_log = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    actor_user_id: text("actor_user_id"),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id").notNull(),
    action: text("action").notNull(),
    detail: jsonb("detail").notNull().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entity_type, t.entity_id),
    index("audit_log_actor_idx").on(t.actor_user_id),
  ]
);
