import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// The long-term usage rollup (lib/usage-rollup.ts). The organisation FK is ON DELETE CASCADE
// instead of Payload's default SET NULL, which would fail against the NOT NULL column (see
// 20260914_095814_cascade_delete_fks.ts). No backfill here: the first rollup run folds in
// every event still in the activity log.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "usage_rollups" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"organisation_id" integer NOT NULL,
  	"day" varchar NOT NULL,
  	"module" varchar NOT NULL,
  	"tool" varchar NOT NULL,
  	"kind" varchar NOT NULL,
  	"calls" numeric DEFAULT 0 NOT NULL,
  	"failures" numeric DEFAULT 0 NOT NULL,
  	"plan_limited" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "usage_rollups_id" integer;
  ALTER TABLE "usage_rollups" ADD CONSTRAINT "usage_rollups_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "usage_rollups_organisation_idx" ON "usage_rollups" USING btree ("organisation_id");
  CREATE INDEX "usage_rollups_updated_at_idx" ON "usage_rollups" USING btree ("updated_at");
  CREATE INDEX "usage_rollups_created_at_idx" ON "usage_rollups" USING btree ("created_at");
  CREATE UNIQUE INDEX "organisation_day_module_tool_idx" ON "usage_rollups" USING btree ("organisation_id","day","module","tool");
  CREATE INDEX "day_idx" ON "usage_rollups" USING btree ("day");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_usage_rollups_fk" FOREIGN KEY ("usage_rollups_id") REFERENCES "public"."usage_rollups"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_usage_rollups_id_idx" ON "payload_locked_documents_rels" USING btree ("usage_rollups_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "usage_rollups" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "usage_rollups" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_usage_rollups_fk";
  
  DROP INDEX "payload_locked_documents_rels_usage_rollups_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "usage_rollups_id";`)
}
