CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" text PRIMARY KEY NOT NULL,
	"finding_key" text NOT NULL,
	"section_id" text NOT NULL,
	"kind" text DEFAULT 'contradiction' NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"claim" text DEFAULT '' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" text DEFAULT 'detected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"heading" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"source_scope_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"version_no" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'verified' NOT NULL,
	"owner_user_id" text,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"last_verified_at" timestamp,
	"open_finding_count" integer DEFAULT 0 NOT NULL,
	"self_maintained" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"finding_id" text NOT NULL,
	"page_id" text NOT NULL,
	"section_id" text NOT NULL,
	"current_md" text DEFAULT '' NOT NULL,
	"proposed_md" text DEFAULT '' NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"source_kind" text DEFAULT '' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"source_snippet" text DEFAULT '' NOT NULL,
	"conflict" jsonb,
	"state" text DEFAULT 'pending_review' NOT NULL,
	"owner_user_id" text,
	"resolved_at" timestamp,
	"applied_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_cursors" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"scope_key" text NOT NULL,
	"cursor_ts" timestamp,
	"cursor_native_id" text,
	"last_run_at" timestamp,
	"last_status" text DEFAULT 'idle' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_uid" text NOT NULL,
	"source_id" text NOT NULL,
	"scope_key" text DEFAULT '' NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"event_ts" timestamp,
	"text" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"ingested_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"authority_rank" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"default_cadence" text DEFAULT 'weekly' NOT NULL,
	"notify_on_drift" boolean DEFAULT true NOT NULL,
	"notify_digest" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "_users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "findings_key_uidx" ON "findings" USING btree ("finding_key");--> statement-breakpoint
CREATE INDEX "findings_section_idx" ON "findings" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "page_sections_page_idx" ON "page_sections" USING btree ("page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_versions_page_v_uidx" ON "page_versions" USING btree ("page_id","version_no");--> statement-breakpoint
CREATE INDEX "page_versions_page_idx" ON "page_versions" USING btree ("page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_slug_uidx" ON "pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "pages_owner_idx" ON "pages" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_finding_uidx" ON "proposals" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "proposals_page_idx" ON "proposals" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "proposals_owner_idx" ON "proposals" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "proposals_state_idx" ON "proposals" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "source_cursors_src_scope_uidx" ON "source_cursors" USING btree ("source_id","scope_key");--> statement-breakpoint
CREATE INDEX "source_cursors_source_idx" ON "source_cursors" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_events_uid_uidx" ON "source_events" USING btree ("event_uid");--> statement-breakpoint
CREATE INDEX "source_events_source_idx" ON "source_events" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "sources_kind_idx" ON "sources" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "user_profiles_owner_uidx" ON "user_profiles" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "_users_email_unique" ON "_users" USING btree ("email");