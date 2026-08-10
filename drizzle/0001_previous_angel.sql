ALTER TABLE "audit_log" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "pages" ALTER COLUMN "last_verified_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "resolved_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_cursors" ALTER COLUMN "cursor_ts" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_cursors" ALTER COLUMN "last_run_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_events" ALTER COLUMN "event_ts" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_events" ALTER COLUMN "ingested_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "source_events" ALTER COLUMN "ingested_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "sources" ALTER COLUMN "last_synced_at" SET DATA TYPE timestamp with time zone;